# Software Requirements Specification (SRS)
## Predictive Crime Hotspot Mapping Assistant — "Bob"

**Version:** 1.0
**Status:** Approved for build
**Document type:** SRS + build scaffold
**Target:** District police station decision-support tool
**Build window:** 36-hour hackathon

---

> This file is the canonical SRS for the project. It mirrors the approved spec the
> build was scaffolded from. The concentric-ring build plan is tracked in
> [`README.md`](README.md); Ring 0 (foundation) is implemented.

For the full requirement text (FR/NFR/DR/CR tags, formulas, API spec, prompts, and
scaffold), see the approved specification. Key anchors implemented so far:

- **FR-1 / DR-3** — Synthetic data generator: `backend/app/data/generator.py`
- **FR-2** — Ingestion & normalization: `backend/app/data/loader.py`
- **H3 binning / geometry** — `backend/app/core/h3_utils.py`
- **Config & ground-truth scenario** — `backend/app/config.py`
- **API (Ring 0 subset)** — `/api/health`, `/api/ingest`, `/api/hotspots`
- **Frontend dashboard** — `frontend/app/page.tsx` + `components/MapView.tsx`

Constraints honoured in Ring 0: `CR-1` (no PII — synthetic only), `CR-2` (no
individual/demographic features), `CR-5` (seeded, reproducible generation),
`CR-6` (augmentation wired but off; core runs offline). The decision-support
banner (`CR-3`, `NFR-5`) is present on the dashboard.

_The remainder of the approved SRS (Sections 1–16) governs the later rings and is
kept alongside this build. Replace this file with the full approved text if a
single self-contained copy is required in-repo._
