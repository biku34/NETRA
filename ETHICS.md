# Ethics & limitations

Predictive policing is not a neutral technology. Done badly it creates feedback loops
(patrols go where past arrests were → more incidents recorded there → more patrols) and can
entrench over-policing of particular places and people. Bob is designed so that its
*architecture* — not just good intentions — mitigates these risks. This document states the
limits plainly; state them in the demo too.

## Design commitments

1. **Bob recommends; the SHO decides.** No output is an automated order. Every screen carries a
   standing banner, and the brief ends with a mandatory **Approve / Modify / Reject** step
   (`CR-3`, FR-12). Overrides are stored; nothing is executed automatically.

2. **Explainable by design, not by add-on.** No risk score reaches the UI without at least two
   ranked, named drivers (`CR-4`, NFR-2). The model is an interpretable Poisson regression, not
   a black box — a deliberate choice, because six months of one district is small data and a
   black box would overfit and could not be defended to a human officer.

3. **Places, times, and crime types only.** No individual-level data, and no community,
   demographic, caste, religion, or ethnicity features exist anywhere in the pipeline or the
   output (`CR-1`, `CR-2`). The unit of prediction is an H3 hexagon (~0.74 km²) over a time
   window — never a person or a group. Bob's system prompt forbids referencing individuals or
   communities, and a grounding test asserts injected content cannot change the reported numbers.

4. **No real personal data.** All incidents are synthetic and seeded (`CR-5`). There are no real
   names, victims, or identifiers. The generator's ground truth is published so the model's
   claims can be checked against what was actually injected.

5. **Feedback loop awareness.** Because patrol allocation can itself shape where future crime is
   *recorded*, the redeployment logic is advisory and bounded (it never exceeds the roster), and
   the human-in-the-loop override is the intended correction mechanism. A production system would
   add drift monitoring and audit logging (see below).

## Known limitations

- **Small data.** ~6 months of one district. Confidence is reported per zone; treat low/medium
  confidence zones as leads, not conclusions.
- **Synthetic patterns.** The demo's patterns (attractors, Navratri uplift, near-repeat chains)
  are injected and therefore *recoverable*. Real data is noisier; the same model would need
  recalibration and validation against ground truth before any operational use.
- **News augmentation is a hint, not evidence.** `news_uplift` nudges risk from public news and a
  known-events calendar; it can be wrong or stale, and it degrades to zero when unavailable
  (`CR-6`). It never overrides the crime-data signal.
- **Not a substitute for judgement.** Bob surfaces where a pattern is concentrating and why. It
  cannot know local context an officer has — which is exactly why the human decides.

## What a production version would add

Real-data validation against ground truth; an **audit log** for every recommendation and
override; model **drift monitoring** and periodic recalibration; Getis-Ord Gi* significance
testing so "hotspot" means statistically significant, not just high-count; role-based access;
and an independent review of disparate-impact before deployment.

> Bottom line: Bob is a lens, not a verdict. It explains what the data shows so a human officer
> can decide — and it is built to make that the only way it can be used.
