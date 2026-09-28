# Netra: Unified Crime Intelligence Platform

Netra turns isolated FIRs into recognised repeat offenders and cross-jurisdiction
networks, and explains every link it draws. PS10 (FIR intelligence and
repeat-offender detection) is built; PS12 (predictive hotspot mapping) is a
placeholder.

*All FIR records in this project are synthetic.*

## Team

- **Team:** ABnity
- **Track:** AI-4
- **Lead:** Aastha Thakker
- **Members:** Bikram Sadhukhan

> Update the team details above and in [`submission.yaml`](submission.yaml).

## Problem Statement

Police stations file FIRs in isolation, so the same repeat offender or organised
gang operating across stations, districts and states is recorded as unrelated
strangers. Investigators have no reliable way to see that a name, method and
timeline in front of them already match a crime registered elsewhere — letting
serial and interstate offenders stay invisible. See
[`docs/problem-statement.md`](docs/problem-statement.md).

## Solution

Netra ingests FIRs, extracts people, aliases and modus-operandi tags, and scores
every pair of FIRs on name similarity, MO overlap, description similarity and
closeness in time to surface repeat offenders and linked networks — each with a
transparent, auditable score breakdown. IBM watsonx.ai Granite performs entity
extraction and IBM Bob interprets the officer's natural-language questions, while
an on-device engine remains a fully functional fallback. See
[`docs/solution-overview.md`](docs/solution-overview.md).

## Key Features

- **Granite-powered extraction** of entities, aliases and MO tags, with a
  deterministic local rule-engine fallback.
- **Explainable repeat-offender scoring** — `0.40 × name + 0.25 × MO tags +
  0.20 × description + 0.15 × time` — with a per-factor breakdown for every match.
- **Cross-jurisdiction network detection**, validated to recover all planted
  gangs with **zero false links**.
- **IBM Bob records assistant** — Bob understands the question (follow-ups, other
  languages, loose wording); the answer comes from the records, and FIR text
  never leaves the system.
- **Role- and jurisdiction-aware access control**, station crime trends, and a
  full audit trail.
- **Explainable weekly hotspot prediction** Poisson/NB GLM over an H3 hex-week panel; every zone shows the ranked drivers behind its risk (contribution to the log-rate).
- **Accuracy you can check** a rolling-origin backtest page: hit rate, PAI (~3.4× vs random), PEI (efficiency vs the theoretical best), and a comparison against a persistence baseline, over the last 8 weeks. No look-ahead, no tuning to the answer.
- **Weekly SHO brief** a patrol-redeployment plan the officer can reshape in plain language ("I only have 8 units", "keep 3 at the top zone") and Approve / Modify / Reject.
- **Interactive risk map** H3 hexes coloured by risk, spike alerts, geo-correlated news/events, and side-by-side zone compare.

## Tech Stack

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS, Recharts, Leaflet (PWA)
- **Backend:** FastAPI (Python 3.11), SQLite (PostgreSQL/PostGIS-ready)
- **IBM technologies:** IBM watsonx.ai Granite 3 8B (extraction), IBM Bob via Bob
  Shell (assistant question understanding)
- **Engine:** phonetic/alias-aware name matching, sentence embeddings with a
  TF-IDF fallback
- **Backend**: Python, FastAPI, SQLModel/SQLite, pandas/NumPy, statsmodels (Poisson/NB GLM), scikit-learn, SciPy, H3 (Uber hex grid).
-**Hotspots frontend**: Next.js 14 (React 18, TypeScript), deck.gl + MapLibre + react-map-gl, TanStack Query, Zustand, Tailwind.
- **Platform shell**: React 19 + Vite, React Router, Recharts, Leaflet, Radix UI.
- **LLM assistant**: OpenAI-compatible chat completions (Groq gpt-oss in the current build; see IBM Bob integration below).
- **Email**: Resend. News: GDELT (with an offline event-calendar fallback).

## How to Run

Full instructions (including first-time setup) are in
[`docs/setup-guide.md`](docs/setup-guide.md). In short, from the repository root:

```bash
# Terminal 1 — API (first start loads the embedding model, ~20s)
src/backend/.venv/Scripts/python -m uvicorn app.main:app --app-dir src/backend --port 8000
```

```bash
# Terminal 2 — dashboard
cd src/frontend && npm run dev
```

Open http://localhost:5173 and sign in with the development login (`123` / `123`).
If the API is not running, the dashboard works on-device with the built-in
records.

**Checks:**

```bash
cd src/frontend && npm run validate
```

```bash
src/backend/.venv/Scripts/python -m pytest src/backend -q
```

## Demo

- **Video:** https://drive.google.com/drive/folders/11OWqIMIex94b_EIQs1vAVusWM6UA_lqy?usp=sharing
- **Live demo:**  (currently NOT DEPLOYED)
- **Screenshots:** https://drive.google.com/drive/folders/1hvt1m61S79YZeZi8-qQX5K56zlmS4bjG?usp=sharing

## Repository Structure

```
├── submission.yaml        Structured metadata (read first by evaluators)
├── README.md              This file
├── docs/                  Problem, solution, architecture, setup guide
├── demo/                  Demo video link, live-demo URL, screenshots
├── presentation/          Slide deck
└── src/                   All source code
    ├── frontend/          React + Vite dashboard
    ├── backend/           FastAPI service
    └── shared/            Extraction rules + roles, used by both
```

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

## Scoring

```
score = 0.40 × name match + 0.25 × MO tag overlap + 0.20 × MO description similarity + 0.15 × closeness in time
```

Two FIRs are linked only when the name match is at least 0.80 **and** the score
is at least 0.60.

## Known Limitations

- Extraction and matching are tuned and validated on synthetic data; real FIR
  text will need re-tuning of thresholds.
- Synthetic data. Incidents come from a seeded generator scoped to the Infocity/Gandhinagar jurisdiction, not a live CCTNS feed. The modelling and metrics are real; the numbers are not.

## What We're Most Proud Of

The **explainable, zero-false-link matching engine**: phonetic, alias-aware name
matching finds repeat offenders that exact search misses, while a strict
name-and-score gate keeps the false-link rate at zero across all nine planted
networks in `npm run validate` — and every link shows exactly why it was drawn.

The backtest. It is easy to draw a heatmap and claim it predicts crime; it is much harder to prove it. Netra's /hotspots/accuracy page runs an honest rolling-origin evaluation — train on the past, predict the next week blind, measure what was caught — and reports standard predictive-policing metrics (PAI, PEI) against random and persistence baselines. The prediction engine is also fully explainable: every zone's risk decomposes into named driver contributions, so an officer sees why, not just where.
