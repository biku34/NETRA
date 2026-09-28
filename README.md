# Netra — Predictive Crime Hotspot Intelligence

> **Bob AI Hackathon submission.** Decision-support for a district Station House Officer (SHO).
> **Netra recommends; the SHO decides. Not an automated order.**

Netra turns ~6 months of station crime records into an explainable, ranked map of the
micro-zones most likely to see an incident in the coming week — so a Station House Officer
can concentrate limited patrols where they matter, and justify the call. It ships as the
**Hotspots** module of the wider Netra platform (which also does FIR intelligence and
repeat-offender detection).

---

## Team

| | |
|---|---|
| **Team** | _CHANGE-ME (see `submission.yaml`)_ |
| **Track** | AI |
| **Lead** | Bikram Sadhukhan · smartseal.bikram@gmail.com |
| **Members** | _see `submission.yaml`_ |

## Problem statement

A district SHO has limited patrol units and must decide, every week, where to place them.
That decision usually leans on memory and last week's incident list, so crews are spread thin
and repeat hotspots get missed. There is no explainable, forward-looking view of *where* risk
is concentrating, or *why*. See [`docs/problem-statement.md`](docs/problem-statement.md).

## Solution

Netra bins incidents into **H3 hexagons** and fits a **Poisson / negative-binomial GLM** on a
leakage-free hex-week panel to predict each zone's probability of at least one incident next
week, with **per-driver contributions** (hotspot density, near-repeat pattern, recency,
seasonality, festival window, news). A **rolling-origin backtest** proves the model beats
random and persistence baselines. A **grounded LLM assistant** answers questions using only
each zone's on-screen data, and a **weekly redeployment brief** turns the ranking into a
concrete, officer-approved patrol plan. See [`docs/solution-overview.md`](docs/solution-overview.md).

## Key features

1. **Explainable weekly hotspot prediction** — Poisson/NB GLM over an H3 hex-week panel;
   every zone shows the ranked drivers behind its risk (contribution to the log-rate).
2. **Accuracy you can check** — a rolling-origin backtest page: hit rate, **PAI (~3.4× vs
   random)**, PEI (efficiency vs the theoretical best), and a comparison against a persistence
   baseline, over the last 8 weeks. No look-ahead, no tuning to the answer.
3. **Grounded zone assistant** — an OpenAI-compatible LLM answers questions about a zone using
   **only** the data shown on its page; hardened with a server-built context, a prompt-injection
   pre-filter, a leak canary, and rate limits.
4. **Weekly SHO brief** — a patrol-redeployment plan the officer can reshape in plain language
   ("I only have 8 units", "keep 3 at the top zone") and Approve / Modify / Reject.
5. **Interactive risk map** — H3 hexes coloured by risk, spike alerts, geo-correlated news/events,
   and side-by-side zone compare.

## Tech stack

- **Backend:** Python, FastAPI, SQLModel/SQLite, pandas/NumPy, **statsmodels** (Poisson/NB GLM),
  scikit-learn, SciPy, **H3** (Uber hex grid).
- **Hotspots frontend:** Next.js 14 (React 18, TypeScript), deck.gl + MapLibre + react-map-gl,
  TanStack Query, Zustand, Tailwind.
- **Platform shell:** React 19 + Vite, React Router, Recharts, Leaflet, Radix UI.
- **LLM assistant:** OpenAI-compatible chat completions (Groq `gpt-oss` in the current build;
  see *IBM Bob integration* below).
- **Email:** Resend. **News:** GDELT (with an offline event-calendar fallback).

## How to run

Full, tested steps are in [`docs/setup-guide.md`](docs/setup-guide.md). Quick start (Windows):

```powershell
powershell -ExecutionPolicy Bypass -File .\start-netra.ps1
```

Then open **http://localhost:5173**, sign in with the dev login in the service `.env` files (see the setup guide),
and click **Hotspots**. Four services start: platform shell (5173), Hotspots module (3000),
Hotspots API (8000), FIR API (8001).

## IBM Bob integration

The zone assistant is built against the **OpenAI-compatible chat-completions** interface, the
same shape IBM Bob's inference API exposes, so the LLM provider is a configuration choice rather
than hard-wired. The current build runs the assistant on Groq's `gpt-oss` models. See
[`docs/architecture.md`](docs/architecture.md) for where the LLM sits in the data flow and
[Known limitations](#known-limitations) for an honest note on the IBM Bob endpoint.

## Demo

- **Video:** see [`demo/demo-video-link.txt`](demo/demo-video-link.txt)
- **Live demo:** see [`demo/live-demo-url.txt`](demo/live-demo-url.txt)
- **Screenshots:** [`demo/screenshots/`](demo/screenshots/)

## Known limitations

- **Synthetic data.** Incidents come from a seeded generator scoped to the Infocity/Gandhinagar
  jurisdiction, not a live CCTNS feed. The modelling and metrics are real; the numbers are not.
- **IBM Bob endpoint not live in this build.** The assistant is provider-agnostic and was wired
  to a Bob provider during development, but the final build runs on Groq because a verified Bob
  inference endpoint/key was not available. Swapping to Bob is a config change in the LLM client.
- **Free-tier LLM limits.** The public Groq tier caps daily tokens per model; under heavy use the
  assistant can return "unavailable" until the quota resets.
- **Dev setup, not production.** A dev-server proxy joins the modules on one origin; the sign-in
  gate is a convenience, not a security boundary, and the Hotspots API has no auth of its own.
- **Drug-risk module** is a placeholder ("coming soon").

## What we're most proud of

The **backtest**. It is easy to draw a heatmap and claim it predicts crime; it is much harder to
*prove* it. Netra's `/hotspots/accuracy` page runs an honest rolling-origin evaluation — train on
the past, predict the next week blind, measure what was caught — and reports standard
predictive-policing metrics (PAI, PEI) against random and persistence baselines. The prediction
engine is also fully **explainable**: every zone's risk decomposes into named driver contributions,
so an officer sees *why*, not just *where*.
