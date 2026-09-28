# Problem statement

## Who experiences this

A **Station House Officer (SHO)** running a police station in a district (here, the Infocity
police-station jurisdiction within Gandhinagar, Gujarat). The SHO commands a small, fixed pool
of patrol units and is accountable for preventing crime across dozens of neighbourhoods, markets,
and roads — every single week, indefinitely.

## The decision that hurts

Every week the SHO must answer one operational question: **where do I put my patrols?**

In practice that decision is made from:

- **Memory and intuition** about which areas "feel" busy.
- **Last week's incident list** — a lagging, noisy signal. One quiet week hides a building
  pattern; one loud week overreacts to noise.
- **No forward-looking, spatial view.** Crime concentrates in space and time (hotspots,
  near-repeat victimisation, day/hour rhythms, festival surges), but nothing on the SHO's desk
  turns that structure into a ranked "watch these zones next week" list.

The result is patrols spread thin and evenly, repeat hotspots under-covered, and no defensible
paper trail for why units went where they did.

## Why existing approaches fall short

- **Static dashboards / heatmaps of past crime** show *where crime happened*, not *where it is
  about to happen*, and give no reason a zone is risky.
- **Simple "same as last week" (persistence)** is a real baseline officers already use in their
  heads — but it is reactive and misses build-ups and near-repeat spread.
- **Black-box predictive-policing tools** produce a risk score with no explanation. An officer
  cannot act on, or be held accountable for, a number they cannot interrogate — and in policing,
  an unexplained score that concentrates enforcement is an ethical hazard.

## Why it matters now

- Patrol capacity is finite and shrinking relative to area; **prioritisation is the whole game.**
- Incident data is already being digitised (CCTNS and similar), so the raw material for a
  forward-looking, explainable tool now exists at the station level.
- Any tool that *directs enforcement* must be **explainable and advisory**, keeping a human
  officer in the loop. The need is not automation — it is decision *support* the SHO can trust,
  question, and defend.

## What a good solution must do

1. **Predict**, not just report — rank micro-zones by their probability of an incident next week.
2. **Explain** — show the specific drivers behind each zone's risk.
3. **Prove it works** — demonstrate, on held-out weeks, that it beats what the SHO would do anyway.
4. **Stay advisory** — recommend a patrol plan the officer reviews, adjusts, and approves.
