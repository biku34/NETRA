# Source layout

All source code lives in this directory — a four-service monorepo:

| Directory | What it is |
|---|---|
| `backend/` | **Hotspots API** — FastAPI + the modelling core: H3 binning, leakage-free hex-week panel, Poisson/NegBin GLM prediction with per-driver explanations, rolling-origin backtest, spike detection, GDELT news correlation, redeployment brief, grounded zone assistant. Tests in `backend/tests/`. |
| `frontend/` | **Hotspots UI** — Next.js 14: deck.gl risk map, zone dashboard, prediction-accuracy page, weekly SHO brief, Ask-Netra chat. Served under `/hotspots`. |
| `portal/` | **Platform shell** (React+Vite: sign-in, navbar, FIR intelligence UI) and `portal/backend/` (FIR API: extraction, repeat-offender matching, trends). |
| `data/csv/` | The seed dataset (source of truth); SQLite/parquet artefacts are regenerated from it and git-ignored. |

How they join at runtime: the shell's dev server (5173) proxies `/hotspots` → the Next.js
app (3000, built with `basePath: "/hotspots"`) and `/api` → the FIR API (8001); the
Hotspots UI calls its own API on 8000. One origin in the browser.

Start here: [`../docs/architecture.md`](../docs/architecture.md) (diagram + component
table) and [`../docs/setup-guide.md`](../docs/setup-guide.md) (exact run steps).

Environment variables: [`./.env.example`](./.env.example) aggregates every variable in
one annotated list; each service also ships its own template (`backend/.env.example`,
`portal/backend/.env.example`). Copy those two to `.env` — real `.env` files are
git-ignored and never committed.
