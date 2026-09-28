"""In-memory intelligence state: processed FIRs, matches and networks.

Rebuilt whenever FIRs are ingested or the scoring configuration changes.
"""
import json
import logging
import threading
from datetime import datetime, timezone

import httpx
from . import db, granite, settings
from .matching import DEFAULT_CONFIG, TextSimilarity, build_networks, find_matches

log = logging.getLogger("netra.pipeline")

REQUIRED = ["fir_id", "fir_reg_no", "state", "district", "police_station", "date_of_fir", "occurrence", "acts_sections", "accused", "narrative"]


class State:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.text: TextSimilarity | None = None
        self.config: dict = DEFAULT_CONFIG
        self.firs: list[dict] = []
        self.by_id: dict[str, dict] = {}
        self.matches: list[dict] = []
        self.networks: list[dict] = []
        self.as_of = ""
        self.updated_at = ""

    def rebuild(self) -> None:
        with self.lock, db.connect() as con:
            self.config = db.get_setting(con, "scoring") or DEFAULT_CONFIG
            self.firs = db.all_firs(con)
            self.by_id = {f["fir_reg_no"]: f for f in self.firs}
            if self.text is None:
                self.text = TextSimilarity()
            self.matches = find_matches(self.firs, self.text, self.config)
            self.networks = build_networks(self.firs, self.matches, self.config)
            self.as_of = max((f["date_of_fir"] for f in self.firs), default="")[:10]
            self.updated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            log.info("Rebuilt: %d FIRs, %d linked pairs, %d networks (%s)", len(self.firs), sum(m["verdict"] == "linked" for m in self.matches), len(self.networks), self.text.method)


state = State()


def validate(fir: dict) -> str | None:
    missing = [k for k in REQUIRED if k not in fir or fir[k] in (None, "")]
    if missing:
        return f"missing fields: {', '.join(missing)}"
    if not isinstance(fir["accused"], list) or not all(isinstance(a, dict) and "name" in a for a in fir["accused"]):
        return "accused must be a list of objects with a name"
    if not isinstance(fir["occurrence"], dict) or len(str(fir["occurrence"].get("date", ""))) != 10:
        return "occurrence.date must be YYYY-MM-DD"
    return None


def store(firs: list[dict]) -> dict:
    """Extract and save FIRs. Returns counts and per-record errors."""
    added, updated, errors, engines = 0, 0, [], {}
    with db.connect() as con, httpx.Client(timeout=30) as client:
        for i, fir in enumerate(firs):
            problem = validate(fir) if isinstance(fir, dict) else "not an object"
            if problem:
                errors.append({"index": i, "fir_reg_no": fir.get("fir_reg_no") if isinstance(fir, dict) else None, "error": problem})
                continue
            fir = {k: v for k, v in fir.items() if k not in ("seed_group", "extraction", "redacted")}
            fir.setdefault("language", "en")
            fir.setdefault("complainant", {"name": "", "phone_masked": ""})
            fir.setdefault("victim_profile", {"gender": "", "age_range": "", "relation_to_accused": ""})
            fir.setdefault("investigating_officer", {"name": "", "rank": ""})
            fir.setdefault("status", "")
            fir.setdefault("lat", 0)
            fir.setdefault("lng", 0)
            fir.setdefault("mo_summary", "")

            extraction = granite.extract(fir, client)
            # Granite writes the English method summary when the FIR arrives without one
            summary = extraction.pop("mo_summary", "")
            if not fir["mo_summary"]:
                fir["mo_summary"] = summary or fir["narrative"]
            engines[extraction["engine"]] = engines.get(extraction["engine"], 0) + 1

            if db.upsert_fir(con, fir, extraction) == "added":
                added += 1
            else:
                updated += 1
    return {"added": added, "updated": updated, "errors": errors, "engines": engines}


def startup() -> None:
    db.init()
    with db.connect() as con:
        empty = db.fir_count(con) == 0
    if empty and settings.SEED_FILE.exists():
        result = store(json.loads(settings.SEED_FILE.read_text(encoding="utf-8")))
        log.info("Seeded from %s: %s", settings.SEED_FILE.name, {k: v for k, v in result.items() if k != "errors"})
    state.rebuild()
