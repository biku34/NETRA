# Netra: Unified Crime Intelligence Platform

PS10 (FIR intelligence and repeat-offender detection) is built & PS12 (predictive hotspot mapping).

All FIR records are synthetic.

## Run

Two terminals, both from this folder.

API (first start loads the embedding model and takes about 20 seconds):

```bash
backend/.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --port 8000
```

Dashboard:

```bash
npm run dev
```

Open http://localhost:5173 and sign in with the development login in `backend/.env.example`.
If the API is not running, the dashboard says so and works on the device with the built-in records.

First-time setup of the API:

```bash
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt
```

## Connect IBM watsonx.ai Granite

Copy `backend/.env.example` to `backend/.env`, fill in `WATSONX_API_KEY` and `WATSONX_PROJECT_ID`, restart the API.
Granite is then used for every newly ingested FIR; the local rule engine remains the fallback.
FIRs already stored keep their existing extraction: delete `backend/netra.db` to re-read the seed data with Granite.

## Check

```bash
npm run validate
```

```bash
backend/.venv/Scripts/python -m pytest backend -q
```

Both check that the three planted gangs are recovered with no false links. The backend tests also cover jurisdiction, permissions and ingestion.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | Sign in, returns a token |
| POST | `/auth/role` | Switch role (development only) |
| GET | `/snapshot` | Everything the dashboard needs for the signed-in role |
| POST | `/fir/ingest` | Batch upload FIRs (`{"firs": [...]}`) |
| GET | `/fir` | FIRs in the caller's jurisdiction |
| GET | `/fir/{reg_no}` | One FIR with extracted entities |
| GET | `/fir/{reg_no}/matches` | Repeat-offender matches with score breakdown |
| GET | `/networks` | Linked-offender networks |
| GET | `/station/{station}/trend` | Station crime trend summary |
| POST | `/reviews` | Confirm, reject, escalate or approve a flag |
| POST | `/fir/{reg_no}/notes` | Add a case note |
| GET, PUT | `/config` | Scoring weights and thresholds (PUT: System Admin) |
| GET | `/audit` | Audit trail (System Admin) |

Interactive documentation: http://localhost:8000/docs

## Layout

| Path | Contents |
|---|---|
| `shared/` | Extraction rules and role definitions, read by both the dashboard and the API |
| `scripts/` | Dataset builder (`npm run dataset`), Gujarat records, icon builder, matching validation |
| `src/` | React dashboard; `src/lib` holds the on-device scoring engine used when the API is unreachable |
| `backend/app/` | FastAPI service: extraction, Granite client, scoring, trends, storage, access control |
| `backend/tests/` | Matching and API tests |

## Scoring

```
score = 0.40 × name match + 0.25 × MO tag overlap + 0.20 × MO description similarity + 0.15 × closeness in time
```

Two FIRs are linked only when the name match is at least 0.80 **and** the score is at least 0.60.
