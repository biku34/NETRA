# Setup guide

Exact steps to run Netra from a fresh clone. Written for Windows (PowerShell); the same
commands work on macOS/Linux with the usual `Scripts` → `bin` path change.

## Prerequisites

| Tool | Version used | Check |
|---|---|---|
| Node.js + npm | Node 22.x, npm 10.x | `node -v` |
| Python | 3.13 (3.11+ should work) | `python --version` |
| PowerShell | Windows PowerShell 5.1+ | — |

No accounts are required to run the app. The zone assistant and brief chat need a **free
Groq API key** (console.groq.com); everything else works fully offline.

## 1. Install dependencies (one time)

From the repository root:

```powershell
# Hotspots API (FastAPI + modelling stack)
python -m venv src/backend/.venv
src/backend/.venv/Scripts/python -m pip install -r src/backend/requirements.txt

# FIR API (platform shell's service)
python -m venv src/portal/backend/.venv
src/portal/backend/.venv/Scripts/python -m pip install fastapi "uvicorn[standard]" pyjwt httpx rapidfuzz python-dotenv pytest

# Frontends
npm --prefix src/frontend install
npm --prefix src/portal install
```

> Optional: the FIR service can use sentence-embeddings for MO similarity
> (`pip install torch --index-url https://download.pytorch.org/whl/cpu` then
> `pip install sentence-transformers`, ~2 GB). Without it, it falls back to TF-IDF —
> set `NETRA_TEXT_SIMILARITY=tfidf` and everything works.

## 2. Environment variables

```powershell
copy src\backend\.env.example src\backend\.env
copy src\portal\backend\.env.example src\portal\backend\.env
```

Then edit `src/backend/.env` and set at minimum:

| Variable | Needed for | Value |
|---|---|---|
| `GROQ_API_KEY` | Zone assistant + brief chat | your key from console.groq.com |
| `GROQ_MODEL` | " | `openai/gpt-oss-20b` (default works) |
| `RESEND_API_KEY` / `EMAIL_DEFAULT_TO` | Emailing the brief (optional) | your Resend key / recipient |
| `ANTHROPIC_API_KEY` | Optional Claude narration; offline fallback used when blank | blank is fine |

`src/portal/backend/.env`: the defaults work; the **development sign-in** is
`NETRA_DEV_USER` / `NETRA_DEV_PASSWORD` (default `123` / `123`).

The frontends need no env changes (the app defaults to `http://localhost:8000/api`; see `src/.env.example`).

## 3. Start everything

```powershell
powershell -ExecutionPolicy Bypass -File .\start-netra.ps1
```

This opens four windows:

| Service | Port |
|---|---|
| Platform shell (entry point) | **5173** |
| Hotspots module (Next.js) | 3000 |
| Hotspots API (FastAPI) | 8000 |
| FIR API (FastAPI) | 8001 |

Or start them by hand — the same four commands are listed in the script and README.

## 4. Load the dataset (first run only)

The incident data ships as CSV (`src/data/csv/incidents.csv`); the SQLite DB is built from it once:

```powershell
curl -X POST http://localhost:8000/api/ingest -H "Content-Type: application/json" -d "{\"regenerate\": true}"
```

## 5. Verify it works

1. `curl http://localhost:8000/api/health` → `{"status":"ok","incidents":<n>,...}` with `incidents > 0`.
2. `curl http://localhost:8001/health` → ok.
3. Open **http://localhost:5173** → sign in with the dev login (`123` / `123`).
4. Click **Hotspots** in the navbar → the risk map renders with coloured hexes.
5. Click a hex → **Go in** → the zone dashboard loads; **Ask Netra** answers a question
   (needs `GROQ_API_KEY`).
6. Sidebar → **Prediction accuracy** → the backtest renders (first load takes ~15 s while
   the model refits per week, then it is cached).
7. Sidebar → **Weekly SHO brief** → the patrol plan renders; try "I only have 8 units this week".

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Map is empty / health shows `incidents: 0` | Run the ingest command in step 4 |
| "The assistant is unavailable right now" | `GROQ_API_KEY` missing/invalid, or the free tier's per-minute / per-day token cap is hit — wait a minute (or a day for the daily cap) or use another key |
| Port 3000/5173/8000/8001 already in use | `start-netra.ps1` frees them first; or stop the conflicting process |
| `/hotspots` shows 502 in the shell | The Next.js dev server (3000) isn't up yet — give it ~15 s |
| Accuracy page spinner for a long time | First backtest fits 8 GLMs (~15 s); it's cached afterwards |
| FIR tests error with `[embeddings]` | `sentence-transformers` not installed — expected; TF-IDF fallback is in use |
| Email says "not configured" | Set `RESEND_API_KEY` in `src/backend/.env` (optional feature) |
| PowerShell blocks the start script | Run it exactly as shown with `-ExecutionPolicy Bypass` |

## Running the tests

```powershell
src/backend/.venv/Scripts/python -m pytest src/backend -q          # hotspot engine + API (incl. backtest, chat hardening)
src/portal/backend/.venv/Scripts/python -m pytest src/portal/backend -q   # FIR matching + API
```
