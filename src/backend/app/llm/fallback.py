"""Offline fallback renderer (CR-6).

If the Claude API is unreachable (or no key is configured), these deterministic
templates fill the same sections from the structured JSON — no prose flair, but a
complete, correct rationale/brief. This keeps the demo alive with zero external
dependencies and guarantees every number traces to a signal.
"""
from __future__ import annotations

from datetime import datetime


def confidence_for(probability: float, drivers: list[dict]) -> str:
    top = max((abs(d.get("contribution", 0.0)) for d in drivers), default=0.0)
    if probability >= 0.7 and top >= 1.0:
        return "high"
    if probability >= 0.4:
        return "medium"
    return "low"


def _fmt_window(win) -> str:
    if not win:
        return "peak hours"
    return f"{win[0]:02d}:00-{win[1]:02d}:00"


def render_rationale(zone: dict) -> str:
    name = zone.get("name") or zone.get("h3_r8", "zone")[:10]
    prob = round(float(zone.get("probability", 0.0)) * 100)
    drivers = zone.get("drivers", [])
    conf = confidence_for(zone.get("probability", 0.0), drivers)

    parts = [f"Zone {name}: {prob}% risk of at least one incident in the coming week."]
    if drivers:
        d0 = drivers[0]
        clause = f"Primary driver: {d0['label']} (value {d0['value']})"
        if len(drivers) > 1:
            clause += f", followed by {drivers[1]['label']}"
        parts.append(clause + ".")
    flags = []
    if any(d["name"] == "is_festival_week" and d["value"] for d in drivers):
        flags.append("a festival window is active")
    if any(d["name"] == "news_uplift" for d in drivers):
        flags.append("external news/event signal present")
    if flags:
        parts.append(("Note: " + " and ".join(flags) + ".").capitalize())
    caveat = ("driven mainly by recent recurrence; six months of one district is small data"
              if conf != "high" else "based on a sustained, concentrated pattern")
    parts.append(f"Confidence: {conf} — {caveat}.")
    return " ".join(parts)


def render_brief(payload: dict) -> str:
    d = payload
    window = d.get("window", {})
    district = d.get("district", "District")
    gen = d.get("generated_at") or datetime.now().isoformat(timespec="minutes")
    zones = d.get("zones", [])
    spikes = d.get("spikes", [])
    redeploy = d.get("redeployment", [])
    aug = d.get("augmentation_available", False)

    redeploy_by_h3 = {r["h3_r8"]: r for r in redeploy}
    L: list[str] = []

    # 1. Header
    L.append(f"# Weekly Patrol Redeployment Brief — {district}")
    L.append(f"**Coverage week:** {window.get('start','?')} → {window.get('end','?')}  ")
    L.append(f"**Generated:** {gen}")
    L.append("")
    L.append("> **DECISION SUPPORT — for SHO review and approval. Not an automated order.**")
    L.append("")

    # 2. Executive summary
    top_names = ", ".join((z.get("name") or z["h3_r8"][:8]) for z in zones[:3])
    seasonal = sum(1 for s in spikes if s.get("label") == "seasonal")
    L.append("## Executive summary")
    L.append(
        f"{len(zones)} priority zones for the coming week; highest risk in "
        f"{top_names or '—'}. {len(spikes)} spike(s) flagged"
        + (f" ({seasonal} seasonal)" if seasonal else "")
        + f". News/event augmentation is {'available' if aug else 'unavailable'}."
    )
    L.append("")

    # 3. Top-5 zones table
    L.append("## Top-5 at-risk zones")
    L.append("| # | Zone | Probability | Primary driver | Recommended action |")
    L.append("|---|------|-------------|----------------|--------------------|")
    for z in zones:
        name = z.get("name") or z["h3_r8"][:10]
        prob = f"{round(z['probability']*100)}%"
        drv = z["drivers"][0]["label"] if z.get("drivers") else "—"
        r = redeploy_by_h3.get(z["h3_r8"])
        if r and r["delta"] != 0:
            sign = "+" if r["delta"] > 0 else ""
            action = f"{sign}{r['delta']} unit(s), focus {_fmt_window(r['peak_window'])}"
        elif r:
            action = f"hold {r['suggested_units']} unit(s), focus {_fmt_window(r['peak_window'])}"
        else:
            action = "maintain coverage"
        L.append(f"| {z.get('rank','')} | {name} | {prob} | {drv} | {action} |")
    L.append("")

    # 4. Spike alerts
    L.append("## Spike alerts")
    if spikes:
        for s in spikes[:8]:
            nm = s.get("name") or s["h3_r8"][:10]
            reason = f" — {s['linked_reason']}" if s.get("linked_reason") else ""
            L.append(
                f"- **{s['crime_type'].replace('_',' ')}** in {nm}: "
                f"{s['recent']} vs {s['baseline']} baseline (z={s['z']}), "
                f"labelled *{s['label']}*{reason}."
            )
    else:
        L.append("- No anomalies above threshold this week.")
    L.append("")

    # 5. Patrol redeployment
    L.append("## Patrol redeployment")
    if redeploy:
        for r in redeploy:
            sign = "+" if r["delta"] > 0 else ""
            delta = f"{sign}{r['delta']}" if r["delta"] else "no change"
            L.append(
                f"- **{r['zone']}**: {r['current_units']} → {r['suggested_units']} units "
                f"({delta}); target {_fmt_window(r['peak_window'])}."
            )
    else:
        L.append("- No patrol configuration available.")
    L.append("")

    # 6. Confidence & caveats
    L.append("## Confidence & caveats")
    L.append("- Model is interpretable by design; ~6 months of one district is small data.")
    L.append("- Predictions are zone-, time-, and crime-type-level only — no individual or "
             "demographic features are used.")
    aug_txt = "available" if aug else "UNAVAILABLE — core predictions unaffected"
    L.append(f"- News/event augmentation: {aug_txt}.")
    L.append("")

    # 7. Officer action
    L.append("## Officer action")
    L.append("Bob recommends; the SHO decides. Review each zone and **Approve**, **Modify**, "
             "or **Reject** — no recommendation is executed automatically.")
    return "\n".join(L)
