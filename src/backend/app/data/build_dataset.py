"""One-off builder for the static CSV dataset (data/csv/*.csv).

Writes ~6 months of structured, seeded data covering every endpoint:

  incidents.csv     -> /health /hotspots /predict /spikes /zones /brief /chat
  news_events.csv   -> /news + the `news_uplift` signal
  field_alerts.csv  -> /field-alerts

The API never calls this module: at runtime the CSVs are read as-is and only
the calculations (risk, spikes, uplift, redeployment) are computed live.

Run:  python -m app.data.build_dataset
"""
from __future__ import annotations

import csv
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd

from app.config import (
    CSV_DIR,
    FIELD_ALERTS_CSV,
    INCIDENTS_CSV,
    NEWS_EVENTS_CSV,
    Attractor,
    get_scenario,
    get_settings,
)
from app.core import h3_utils
from app.data.generator import generate

TS_FMT = "%Y-%m-%dT%H:%M:%S"      # local IST wall-clock, no offset
OTHER_LOCALITY = "Gandhinagar (other)"


def _nearest_attractor(lat: float, lng: float, attractors: list[Attractor],
                       max_m: float = 1500.0) -> str:
    best, best_d = OTHER_LOCALITY, max_m
    for a in attractors:
        d = h3_utils.haversine_m(lat, lng, a.lat, a.lng)
        if d < best_d:
            best, best_d = a.name, d
    return best


# ---------------------------------------------------------------------------
# incidents.csv
# ---------------------------------------------------------------------------
def build_incidents(rng: np.random.Generator) -> pd.DataFrame:
    scenario = get_scenario()
    end = date.fromisoformat(get_settings().gen_end)
    df = generate()      # seeded, deterministic (CR-5)

    df["location_name"] = [
        _nearest_attractor(lat, lng, scenario.attractors)
        for lat, lng in zip(df["latitude"], df["longitude"])
    ]
    df["fir_no"] = [f"GNR/{ts.year}/{i + 1:05d}"
                    for i, ts in enumerate(df["timestamp"])]

    def _status(ts: datetime) -> str:
        age = (end - ts.date()).days
        if age <= 14:
            return str(rng.choice(["registered", "under_investigation"], p=[0.4, 0.6]))
        if age <= 60:
            return str(rng.choice(["under_investigation", "chargesheeted", "closed"],
                                  p=[0.5, 0.3, 0.2]))
        return str(rng.choice(["under_investigation", "chargesheeted", "closed"],
                              p=[0.15, 0.45, 0.4]))

    df["status"] = [_status(ts) for ts in df["timestamp"]]
    df["timestamp"] = pd.to_datetime(df["timestamp"]).dt.strftime(TS_FMT)
    return df[[
        "incident_id", "fir_no", "timestamp", "latitude", "longitude", "h3_r8",
        "crime_type", "severity", "reported_via", "location_name", "status",
        "source", "confidence",
    ]]


# ---------------------------------------------------------------------------
# news_events.csv
# ---------------------------------------------------------------------------
# (name, attractor, start, end, weight, kind). The first four are the calendar
# entries the prediction week depends on; the rest are history.
_CALENDAR = [
    ("Navratri Garba — Sector 21 grounds", "Sector 21 Market", "2026-09-14", "2026-09-24", 1.0, "festival"),
    ("Navratri Garba — Infocity", "Infocity", "2026-09-14", "2026-09-24", 0.9, "festival"),
    ("GIFT City Business Summit", "GIFT City", "2026-09-21", "2026-09-23", 0.7, "event"),
    ("Akshardham weekend footfall", "Akshardham (Sector 20)", "2026-09-19", "2026-09-26", 0.6, "event"),
    ("Ram Navami procession — Sector 21", "Sector 21 Market", "2026-03-26", "2026-03-26", 0.6, "festival"),
    ("Summer night market — Kudasan", "Kudasan", "2026-05-08", "2026-05-10", 0.5, "event"),
    ("Monsoon waterlogging advisory — Sargasan", "Sargasan Crossroads", "2026-06-24", "2026-06-27", 0.4, "advisory"),
    ("Rath Yatra route bandobast — Sector 7", "Sector 7 Secretariat", "2026-07-16", "2026-07-16", 0.7, "festival"),
    ("Sector 21 Cultural Mela", "Sector 21 Market", "2026-07-19", "2026-07-19", 0.8, "event"),
    ("GIFT City Tech Expo", "GIFT City", "2026-08-15", "2026-08-15", 0.8, "event"),
    ("Independence Day parade — Sector 16", "Sector 16 Commercial", "2026-08-15", "2026-08-15", 0.6, "event"),
    ("Janmashtami celebrations — Akshardham", "Akshardham (Sector 20)", "2026-09-04", "2026-09-04", 0.7, "festival"),
    ("Streetlight maintenance advisory — Infocity", "Infocity", "2026-09-18", "2026-09-22", 0.3, "advisory"),
]

_HEADLINES = {
    "theft": ["Shop theft reported near {loc}; police scan CCTV footage",
              "Residents flag repeated thefts around {loc}"],
    "burglary": ["Locked house burgled near {loc} while family was away",
                 "Daytime burglary near {loc} prompts society patrol request"],
    "vehicle_theft": ["Two-wheelers stolen overnight from parking near {loc}",
                      "Vehicle theft complaints rise around {loc}"],
    "chain_snatching": ["Bike-borne duo snatch gold chain near {loc}",
                        "Chain snatching near {loc}; evening patrols stepped up"],
    "robbery": ["Robbery reported near {loc}; suspects flee on motorcycle"],
    "pickpocketing": ["Pickpockets target crowded stretch near {loc}"],
    "mobile_snatching": ["Phone snatch reported near {loc} during evening rush",
                         "Commuters warned after mobile snatching near {loc}"],
    "assault": ["Late-night assault near {loc}; two detained"],
    "harassment": ["Harassment complaints near {loc} lead to extra beat patrols"],
    "vandalism": ["Parked vehicles vandalised overnight near {loc}"],
}


def build_news(incidents: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    scenario = get_scenario()
    by_name = {a.name: a for a in scenario.attractors}
    rows: list[dict] = []

    for name, where, start, end, weight, kind in _CALENDAR:
        a = by_name[where]
        rows.append({
            "type": kind, "title": name, "location": where,
            "latitude": a.lat, "longitude": a.lng,
            "published_at": f"{start}T08:00:00",
            "start_date": start, "end_date": end,
            "weight": weight, "domain": "calendar", "url": "",
        })

    # Articles follow the incident record: each week, the busiest
    # (locality, crime type) pairs get a headline a day or two later.
    inc = incidents[incidents["location_name"] != OTHER_LOCALITY].copy()
    inc["_ts"] = pd.to_datetime(inc["timestamp"])
    inc["_week"] = inc["_ts"].dt.to_period("W").dt.start_time
    last = inc["_ts"].max()
    for week, grp in inc.groupby("_week"):
        top = (grp.groupby(["location_name", "crime_type"]).size()
               .sort_values(ascending=False, kind="mergesort").head(3))
        for (loc, ctype), _n in top.items():
            sub = grp[(grp["location_name"] == loc) & (grp["crime_type"] == ctype)]
            published = sub["_ts"].max() + timedelta(
                days=int(rng.integers(0, 2)), hours=int(rng.integers(2, 12)))
            if published > last + timedelta(hours=6):
                published = sub["_ts"].max() + timedelta(hours=2)
            a = by_name[loc]
            title = str(rng.choice(_HEADLINES[ctype])).format(loc=loc)
            rows.append({
                "type": "news", "title": title, "location": loc,
                "latitude": a.lat, "longitude": a.lng,
                "published_at": published.strftime(TS_FMT),
                "start_date": published.date().isoformat(),
                "end_date": published.date().isoformat(),
                "weight": 1.0, "domain": "synthetic", "url": "",
            })

    df = pd.DataFrame(rows).sort_values(
        ["published_at", "title"], kind="mergesort").reset_index(drop=True)
    df.insert(0, "item_id", [f"NE-{i + 1:04d}" for i in range(len(df))])
    return df


# ---------------------------------------------------------------------------
# field_alerts.csv
# ---------------------------------------------------------------------------
_OFFICERS = [
    ("PSI", "R. Chaudhary", "PCR-3"), ("PSI", "N. Desai", "PCR-2"),
    ("ASI", "D. Vaghela", "PCR-1"), ("ASI", "S. Rathod", "PCR-4"),
    ("HC", "M. Parmar", "Beat 2"), ("HC", "B. Gohil", "Beat 6"),
    ("PC", "J. Solanki", "Beat 5"), ("PC", "K. Thakor", "Beat 4"),
    ("PC", "A. Makwana", "Beat 1"), ("PC", "H. Zala", "Beat 3"),
]

# (category, priority, title, detail)
_ALERTS = [
    ("crime_in_progress", "urgent", "Chain snatching reported",
     "Two suspects on a motorcycle fled the spot; description circulated."),
    ("crime_in_progress", "urgent", "Mobile snatching reported",
     "Victim's phone snatched by a pillion rider; nearby units alerted."),
    ("crime_in_progress", "urgent", "Break-in attempt at locked house",
     "Neighbours heard the lock being forced; suspects left before arrival."),
    ("crowd", "urgent", "Crowd build-up at venue gate",
     "Entry queue spilling onto the road; requesting two more constables."),
    ("public_order", "urgent", "Scuffle between two groups",
     "Situation contained, both parties brought to the chowky."),
    ("suspicious", "attention", "Suspicious vehicle parked since morning",
     "Hatchback without a number plate; owner not traced yet."),
    ("suspicious", "attention", "Unattended bag reported",
     "Bag checked and cleared; owner located nearby."),
    ("infrastructure", "attention", "Streetlights out on service road",
     "Roughly 400 m stretch dark; recommend a night patrol pass."),
    ("infrastructure", "attention", "CCTV camera not recording",
     "Junction camera offline; control room informed."),
    ("traffic", "attention", "Traffic congestion at junction",
     "Signal fault causing tailback; manual regulation started."),
    ("patrol", "info", "Nakabandi point established",
     "Vehicle checking in progress, no incidents so far."),
    ("patrol", "info", "Foot patrol completed",
     "Market stretch covered; shopkeepers briefed on shutter locks."),
    ("patrol", "info", "Night round completed",
     "Residential lanes checked; nothing to report."),
]
_ALERT_P = {"urgent": 1.0, "attention": 1.6, "info": 2.0}
_HOUR_W = [1, 1, 1, 1, 1, 1, 2, 3, 4, 4, 4, 5, 5, 5, 5, 6, 7, 8, 9, 9, 8, 6, 4, 2]


def build_field_alerts(rng: np.random.Generator) -> pd.DataFrame:
    settings = get_settings()
    scenario = get_scenario()
    start = date.fromisoformat(settings.gen_start)
    end = date.fromisoformat(settings.gen_end)
    fest_s = date.fromisoformat(scenario.festival_start)
    fest_e = date.fromisoformat(scenario.festival_end)

    loc_p = np.array([a.amplitude for a in scenario.attractors])
    loc_p = loc_p / loc_p.sum()
    tmpl_p = np.array([_ALERT_P[t[1]] for t in _ALERTS])
    tmpl_p = tmpl_p / tmpl_p.sum()
    hour_p = np.array(_HOUR_W, dtype=float)
    hour_p = hour_p / hour_p.sum()

    rows: list[dict] = []
    day = start
    while day <= end:
        rate = 4.0
        if day.weekday() in (4, 5):
            rate *= 1.3
        if fest_s <= day <= fest_e:
            rate *= 1.5
        for _ in range(int(rng.poisson(rate))):
            cat, prio, title, detail = _ALERTS[int(rng.choice(len(_ALERTS), p=tmpl_p))]
            a = scenario.attractors[int(rng.choice(len(scenario.attractors), p=loc_p))]
            rank, officer, unit = _OFFICERS[int(rng.integers(0, len(_OFFICERS)))]
            ts = datetime(day.year, day.month, day.day,
                          int(rng.choice(24, p=hour_p)), int(rng.integers(0, 60)))
            lat = round(a.lat + rng.normal(0, 0.002), 6)
            lng = round(a.lng + rng.normal(0, 0.002), 6)
            age_h = (datetime(end.year, end.month, end.day, 23, 59) - ts).total_seconds() / 3600
            if age_h > 24:
                status = "resolved"
            elif age_h > 3:
                status = "acknowledged"
            else:
                status = "open"
            rows.append({
                "timestamp": ts.strftime(TS_FMT), "priority": prio, "category": cat,
                "title": title, "detail": detail,
                "officer_rank": rank, "officer_name": officer, "unit": unit,
                "location": a.name, "latitude": lat, "longitude": lng,
                "h3_r8": h3_utils.latlng_to_cell(lat, lng, settings.h3_res),
                "status": status,
            })
        day += timedelta(days=1)

    df = pd.DataFrame(rows).sort_values(
        ["timestamp", "title", "location"], kind="mergesort").reset_index(drop=True)
    df.insert(0, "alert_id", [f"FA-{i + 1:05d}" for i in range(len(df))])
    return df


# ---------------------------------------------------------------------------
def build_all() -> dict[str, int]:
    rng = np.random.default_rng(get_settings().random_seed + 1)
    CSV_DIR.mkdir(parents=True, exist_ok=True)

    incidents = build_incidents(rng)
    news = build_news(incidents, rng)
    alerts = build_field_alerts(rng)

    for df, path in ((incidents, INCIDENTS_CSV), (news, NEWS_EVENTS_CSV),
                     (alerts, FIELD_ALERTS_CSV)):
        df.to_csv(path, index=False, encoding="utf-8", quoting=csv.QUOTE_MINIMAL)
    return {"incidents": len(incidents), "news_events": len(news),
            "field_alerts": len(alerts)}


def main() -> None:
    counts = build_all()
    for name, n in counts.items():
        print(f"[build_dataset] {name}: {n} rows -> {CSV_DIR / (name + '.csv')}")


if __name__ == "__main__":
    main()
