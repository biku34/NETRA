"""Storage on SQLite through the standard library.

Kept behind a handful of functions so PostgreSQL + PostGIS can replace it for PS12
without touching the API or the scoring code.
"""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from . import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS firs (
  fir_reg_no TEXT PRIMARY KEY,
  police_station TEXT NOT NULL,
  district TEXT NOT NULL,
  state TEXT NOT NULL,
  occurrence_date TEXT NOT NULL,
  lat REAL NOT NULL,  -- lat/lng become a PostGIS geometry for PS12
  lng REAL NOT NULL,
  data TEXT NOT NULL,
  extraction TEXT NOT NULL,
  ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS firs_station ON firs (police_station);
CREATE INDEX IF NOT EXISTS firs_district ON firs (district);
DROP TABLE IF EXISTS reviews;
-- one row per decision taken on a flag, so the full chain of decisions is kept
CREATE TABLE IF NOT EXISTS review_steps (target TEXT NOT NULL, action TEXT NOT NULL, by TEXT NOT NULL, role TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (target, action));
CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, fir_reg_no TEXT NOT NULL, by TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL, role TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS notes_fir ON notes (fir_reg_no);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, by TEXT NOT NULL, role TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


@contextmanager
def connect():
    """One transaction: committed on success, rolled back on error."""
    con = sqlite3.connect(settings.DATABASE_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    try:
        with con:
            yield con
    finally:
        con.close()


def init() -> None:
    with connect() as con:
        con.executescript(SCHEMA)
        # databases created before notes recorded the author's rank
        if "role" not in [c["name"] for c in con.execute("PRAGMA table_info(notes)")]:
            con.execute("ALTER TABLE notes ADD COLUMN role TEXT NOT NULL DEFAULT ''")


def all_firs(con) -> list[dict]:
    return [{**json.loads(r["data"]), "extraction": json.loads(r["extraction"])} for r in con.execute("SELECT data, extraction FROM firs")]


def fir_count(con) -> int:
    return con.execute("SELECT COUNT(*) FROM firs").fetchone()[0]


def upsert_fir(con, fir: dict, extraction: dict) -> str:
    existed = con.execute("SELECT 1 FROM firs WHERE fir_reg_no = ?", (fir["fir_reg_no"],)).fetchone() is not None
    con.execute(
        "INSERT OR REPLACE INTO firs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (fir["fir_reg_no"], fir["police_station"], fir["district"], fir["state"], fir["occurrence"]["date"], fir["lat"], fir["lng"], json.dumps(fir, ensure_ascii=False), json.dumps(extraction, ensure_ascii=False), now()),
    )
    return "updated" if existed else "added"


def get_setting(con, key: str):
    row = con.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return json.loads(row["value"]) if row else None


def put_setting(con, key: str, value) -> None:
    con.execute("INSERT OR REPLACE INTO settings VALUES (?, ?)", (key, json.dumps(value)))


OPPOSITE = {"confirmed": "rejected", "rejected": "confirmed"}


def steps(con) -> dict[str, list[dict]]:
    """Every decision taken on each flag, oldest first."""
    out: dict[str, list[dict]] = {}
    for r in con.execute("SELECT * FROM review_steps ORDER BY at, rowid"):
        out.setdefault(r["target"], []).append({"action": r["action"], "by": r["by"], "role": r["role"], "at": r["at"]})
    return out


def put_review(con, target: str, action: str, role: dict) -> None:
    # confirming withdraws an earlier rejection of the same match, and the reverse
    if action in OPPOSITE:
        con.execute("DELETE FROM review_steps WHERE target = ? AND action = ?", (target, OPPOSITE[action]))
    con.execute("INSERT OR REPLACE INTO review_steps VALUES (?, ?, ?, ?, ?)", (target, action, role["persona"], role["short"], now()))


def notes(con) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for r in con.execute("SELECT * FROM notes ORDER BY id DESC"):
        out.setdefault(r["fir_reg_no"], []).append({"at": r["at"], "by": r["by"], "role": r["role"], "text": r["text"]})
    return out


def add_note(con, fir_reg_no: str, role: dict, text: str) -> None:
    con.execute("INSERT INTO notes (fir_reg_no, by, role, text, at) VALUES (?, ?, ?, ?, ?)", (fir_reg_no, role["persona"], role["short"], text, now()))


def audit(con, limit: int = 200) -> list[dict]:
    return [dict(r) for r in con.execute("SELECT at, by, role, action, target FROM audit ORDER BY id DESC LIMIT ?", (limit,))]


def log(con, role: dict, action: str, target: str) -> None:
    con.execute("INSERT INTO audit (at, by, role, action, target) VALUES (?, ?, ?, ?, ?)", (now(), role["persona"], role["short"], action, target))
