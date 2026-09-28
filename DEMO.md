# Bob — 5-minute demo script

**Scope:** Infocity police station, Gandhinagar district (Gujarat). **Mode:** core + news augmentation, Bob on the offline
fallback (no API key needed). Everything below runs from seeded, reproducible data.

> Opening line: *"Bob is a decision-support layer for a Station House Officer. It never issues
> orders — it explains what the data shows so an officer can decide. Watch the banner: it's on
> every screen."*

---

### 0. Setup (before the demo)
```bash
# terminal 1
cd backend && uvicorn app.main:app --port 8000
# terminal 2
cd frontend && npm run dev        # http://localhost:3000
```
Or: `docker compose up --build`.

---

### 1. The map (30s)
Open `http://localhost:3000` — a **full-screen map of the Infocity station area**. H3 hexagons are coloured by
predicted criticality (teal → amber → red); the rural fringe stays empty. Point out the hottest
hexes clustered on **Infocity IT Park / Kudasan Market**.

> *"These aren't raw counts — it's the model's risk for the coming week. The hotspot zones light
> up because that's where the pattern is."*

### 2. Hover a hex → Bob's card (60s)
**Hover the hottest hex.** A card pops with the probability, a confidence badge, expected count,
a news/event flag, **Bob's grounded rationale**, and the ranked drivers — then click
**"Go in — full details →"**.

- **Bob's rationale** (plain English, grounded): *"…100% risk… primary driver: hotspot density,
  followed by near-repeat pattern. A festival window is active…"*
- On the zone page, the **hour-of-day** chart peaks late evening (orange = peak window);
  **day-of-week** peaks Fri/Sat. These are patterns the model *rediscovered* — baked into the data.

> *"Hover for the gist, go in for the detail. Every number traces to a signal — no black box."*

### 3. Spike alert (30s)
Open **Alerts & news** in the header. The **Spike alerts** list flags anomalies — note a
a **Kudasan / mobile snatching** spike, labelled **seasonal** and linked to the **Navratri** window.

> *"Bob doesn't just say 'more crime' — it tells you it's seasonal, tied to the festival."*

### 4. The SHO brief (90s) — the headline
Click **"Generate SHO brief"**. Bob produces the printable weekly brief:
- Header + the decision-support banner
- Executive summary
- **Top-5 zones table** with a recommended action per zone
- Spike alerts (seasonal / event-linked / emerging)
- **Patrol redeployment** — concrete unit deltas and peak windows (e.g. *Maninagar 2 → 4 units,
  focus 18:00–22:00*). The numbers are computed deterministically, then Bob narrates them.
- Confidence & caveats
- Officer action

Hit **Print / PDF** to show it prints to one or two clean pages.

### 5. Human-in-the-loop (30s)
Scroll to **Officer action** and click **Reject** (add a note like *"covered by night patrol"*).
It's recorded — *"Recorded: reject — not auto-executed."*

> *"Bob recommends; the SHO decides. The override is stored, nothing is executed automatically."*

### 6. News augmentation + graceful degradation (30s)
In the **Alerts & news** panel: correlated GDELT articles about Gandhinagar/Gujarat plus the
Navratri / GIFT City calendar, feeding a `news_uplift` driver. Note the badge — **GDELT live** or
**calendar**.

> *"If the news feed dies, the badge flips to 'calendar' and predictions are unaffected. The
> impressive layer can fail without breaking the core."*

### 7. Close on ethics (20s)
> *"Explainable by design. Zone-, time-, and crime-type-level only — never individuals or
> communities. Human-in-the-loop is mandatory. Bob recommends; the SHO decides."*

---

### Reset between runs
- **Reload data** button (or `POST /api/ingest`) — re-reads the CSV dataset in `data/csv/`;
  identical data every time.
- `GET /api/health` shows incident count, model, news status, and whether Bob is live or on the
  fallback.
