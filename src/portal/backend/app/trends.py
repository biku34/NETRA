"""Station-level crime trend summary. Mirrors src/lib/trends.ts."""
from collections import Counter
from datetime import date

WINDOW_DAYS = 90
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _types(firs: list[dict]) -> list[str]:
    return [c["value"] for f in firs for c in f["extraction"]["crime_types"]]


def station_trend(station: str, firs: list[dict], networks: list[dict], as_of: str) -> dict:
    """`firs` must already be limited to what the caller is allowed to see."""
    firs = [f for f in firs if f["police_station"] == station]
    end = date.fromisoformat(as_of)

    def age(f: dict) -> int:
        return (end - date.fromisoformat(f["occurrence"]["date"])).days

    recent_firs = [f for f in firs if age(f) <= WINDOW_DAYS]
    previous_firs = [f for f in firs if WINDOW_DAYS < age(f) <= WINDOW_DAYS * 2]

    monthly = []
    y, m = end.year, end.month - 11
    while m <= 0:
        y, m = y - 1, m + 12
    for _ in range(12):
        key = f"{y}-{m:02d}"
        monthly.append({"month": key, "label": f"{MONTHS[m - 1]} {str(y)[2:]}", "count": sum(f["occurrence"]["date"].startswith(key) for f in firs)})
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)

    recent_types, previous_types = Counter(_types(recent_firs)), Counter(_types(previous_firs))
    by_type = [{"type": t, "count": n, "recent": recent_types[t], "previous": previous_types[t]} for t, n in Counter(_types(firs)).most_common()]
    repeat_places = [{"place": p, "count": n} for p, n in Counter(f["occurrence"]["place"] for f in firs).most_common() if n > 1]
    top_tags = [{"tag": t, "count": n} for t, n in Counter(t["value"] for f in firs for t in f["extraction"]["mo_tags"]).most_common(6)]
    ids = {f["fir_reg_no"] for f in firs}
    linked = [n for n in networks if ids & set(n["firs"])]

    recent, previous = len(recent_firs), len(previous_firs)
    change = round((recent - previous) / previous * 100) if previous else None

    summary = []
    if not firs:
        summary.append(f"No FIRs on record for {station} PS.")
    else:
        if change is None:
            direction = "no earlier period to compare against"
        elif change > 0:
            direction = f"up {change}% on the 90 days before"
        elif change < 0:
            direction = f"down {abs(change)}% on the 90 days before"
        else:
            direction = "unchanged from the 90 days before"
        summary.append(f"{recent} FIRs registered in the last 90 days, {direction} ({previous}).")
        if by_type:
            summary.append(f"{by_type[0]['type']} is the most frequent offence: {by_type[0]['count']} of {len(firs)} FIRs in the last 12 months.")
        rising = next((c for c in by_type if c["recent"] > c["previous"] and c["recent"] >= 2), None)
        if rising:
            summary.append(f"{rising['type']} is rising: {rising['recent']} cases in the last 90 days against {rising['previous']} before.")
        if repeat_places:
            summary.append(f"{repeat_places[0]['place']} has {repeat_places[0]['count']} FIRs. Consider a fixed evening picket or CCTV check there.")
        for n in linked:
            summary.append(f"One FIR here is linked to \"{n['label']}\", a repeat-offender signature seen in {len(n['districts'])} districts ({', '.join(n['districts'])}). Coordinate with those stations before closing the case.")

    return {
        "station": station,
        "district": firs[0]["district"] if firs else "",
        "total": len(firs),
        "recent": recent,
        "previous": previous,
        "changePct": change,
        "monthly": monthly,
        "byCrimeType": by_type,
        "repeatPlaces": repeat_places,
        "topTags": top_tags,
        "linkedNetworks": [n["id"] for n in linked],
        "summary": summary,
        "summaryEngine": "local-rules",
    }
