# Solution overview

Netra is decision-support for a Station House Officer. It answers three questions the SHO asks
every week — **where** is risk concentrating, **why**, and **can I trust it** — and then turns the
answer into an **approvable patrol plan**.

## Core mechanism

### 1. Space: a hex grid, not a heatmap blur

Every incident is binned into an **H3 hexagon** (Uber's hierarchical hex grid, res 8 — ~0.7 km²
cells). Hexes are uniform, tileable, and neighbour-aware, which is exactly what near-repeat and
density analysis need. This replaces a smeared heatmap with ~100 discrete, rankable, patrollable
zones.

### 2. Prediction: an explainable GLM, not a black box

For each zone Netra builds a **hex-week panel** — one row per (hex, week) with the target (did an
incident occur that week) and features computed **strictly from data before that week**:

- **KDE hotspot density** — kernel density of recent incidents (the standing "hot" surface).
- **Near-repeat signal** — recent nearby incidents that predict follow-on crime.
- **Recency** — 7-day and 28-day prior counts.
- **Seasonality** and a **festival-week** flag (India holidays calendar).
- **News/event uplift** — geo-correlated GDELT news as a post-model multiplier.

A **Poisson GLM** (auto-upgraded to **negative binomial** under overdispersion) fits this panel and
predicts each zone's expected incident rate → **P(≥1 incident next week) = 1 − e^(−λ̂)**. Because it
is a GLM, each prediction decomposes into **per-feature contributions** (βⱼ·xⱼ), which the UI shows
as ranked drivers. The officer sees *why* a zone is risky, not just a score. A recency-weighted
frequency (RWF) model is the always-on fallback when the GLM cannot fit.

### 3. Proof: a backtest, not a claim

The hard part of a prediction tool is showing it works. Netra's **rolling-origin backtest**
(`/hotspots/accuracy`) rewinds the clock over the last 8 weeks: for each week it refits on data
*before* that week, freezes the top-K zones, then reveals what actually happened and measures the
catch. It reports the standard predictive-policing metrics —

- **Hit rate** (share of next-week incidents caught in the flagged zones),
- **PAI** = hit rate ÷ area flagged (**~3.4× better than random** patrol coverage),
- **PEI** = efficiency vs the best any K zones could have caught that week,

— against two references scored on the same weeks: **random** (the break-even line) and
**persistence** (flagging last month's busiest zones, the SHO's mental baseline).

## What makes it different from the naive alternatives

- **vs a heatmap:** Netra predicts next week and explains each zone; a heatmap only shows the past.
- **vs a black-box score:** every risk decomposes into named drivers; the officer can interrogate it.
- **vs "trust me":** the backtest measures accuracy on held-out weeks against honest baselines.
- **vs automation:** nothing is dispatched. The SHO reviews, adjusts in plain language, and approves.

## Key design decisions

- **Leakage-free by construction.** The panel refits the KDE surface per week on past-only data.
  A single ref-date surface would let old weeks "see" the future — the code avoids this deliberately.
- **Deterministic core, LLM at the edges.** The prediction and allocation maths are deterministic
  and reproducible; the LLM only *narrates* and *answers questions* over figures the system already
  computed — it never invents numbers.
- **Grounded, hardened assistant.** The zone chat context is built server-side from the hex id;
  the client can only send chat turns. A prompt-injection pre-filter, a leaked-prompt canary, and
  rate limits defend it. It answers only from the page's data or declines.
- **Advisory framing everywhere.** "Netra recommends; the SHO decides" is enforced in the brief
  (Approve/Modify/Reject) and the assistant's rules.

## What the user experience looks like

1. Sign in to the Netra platform → open **Hotspots**. A district map shows H3 zones coloured by
   next-week risk, with the top-5 priority zones outlined and live spike/news alerts.
2. Click a zone → a full dashboard: risk gauge, ranked drivers, hour/day profiles, incident
   history, crime mix, and its rank in the precinct. **Ask Netra** answers questions about *this*
   zone's data.
3. Open **Prediction accuracy** → see the backtest prove the model beats random and persistence.
4. Open **Weekly SHO brief** → a patrol-redeployment plan; reshape it in plain language, then
   Approve / Modify / Reject. Email it to the station.
