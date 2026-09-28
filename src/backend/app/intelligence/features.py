"""Shared feature substrate for the prediction + spike layers.

Builds two things, both leakage-free:

* ``live_features(df, ref)`` — one feature row per populated hex, computed *as
  of* ref, describing the "coming week" [ref+1, ref+7].
* ``build_panel(df, ref)`` — the historical (hex, week) panel: target = incident
  count that week, features computed as of the week's start. This is what the
  Poisson GLM (FR-6) is fit on.

Canonical feature order is ``FEATURES`` and is shared by predictor + drivers.
``news_uplift`` is always 0 in core-only mode (augmentation off, CR-6).
"""
from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from app.core import temporal
from app.intelligence import hotspots, near_repeat
from app.news import live_calendar

FEATURES = [
    "count_7d_prior",
    "count_28d_prior",
    "near_repeat_signal",
    "kde_intensity",
    "is_festival_week",
    "event_flag",
    "dow_peak_indicator",
    "seasonal_index",
    "news_uplift",
]

FEATURE_LABELS = {
    "count_7d_prior": "recent activity (7d)",
    "count_28d_prior": "sustained activity (28d)",
    "near_repeat_signal": "near-repeat pattern",
    "kde_intensity": "hotspot density",
    "is_festival_week": "festival window",
    "event_flag": "local event",
    "dow_peak_indicator": "weekend concentration",
    "seasonal_index": "seasonal trend",
    "news_uplift": "news signal",
}


# ---------------------------------------------------------------------------
# helpers
#
# Festival + event signals come from independent, free live sources
# (``app.news.live_calendar``) — the Google India-holidays iCal feed for
# festivals and Google News for current events — NOT from the data generator's
# own scenario config. This is deliberate: sourcing them from the generator
# would hand the model the ground truth it is meant to rediscover (circular
# validation). Sourced externally, ``is_festival_week`` is a genuine, testable
# predictor and events reach the score through ``news_uplift``.
# ---------------------------------------------------------------------------
def _seasonal_index(df: pd.DataFrame, ref: date) -> float:
    """District-level temporal multiplier: trailing-14d daily rate vs long-run."""
    hist = df[df["_ts_local"].dt.date <= ref]
    if hist.empty:
        return 1.0
    hd = hist["_ts_local"].dt.date
    span_days = max(1, (ref - hd.min()).days)
    long_run = len(hist) / span_days
    recent_rate = len(hist[hd > (ref - timedelta(days=14))]) / 14
    if long_run <= 0:
        return 1.0
    return float(round(recent_rate / long_run, 3))


# ---------------------------------------------------------------------------
# live features (coming week)
# ---------------------------------------------------------------------------
def live_features(df: pd.DataFrame, ref: date,
                  kde: dict[str, float] | None = None) -> pd.DataFrame:
    """One feature row per populated hex, as of `ref`.

    ``kde`` (the spatial density surface) is stationary geography; pass a
    precomputed one to avoid refitting it (NFR-1).
    """
    if "_ts_local" not in df.columns:
        df = temporal.add_time_features(df)
    cells = sorted(df["h3_r8"].unique().tolist())

    c7 = temporal.window_counts(df, ref, 7)
    c28 = temporal.window_counts(df, ref, 28)
    nr = near_repeat.near_repeat_signals(df, cells, ref)
    if kde is None:
        kde = hotspots.kde_intensity(df, cells, ref)

    coming_start, coming_end = ref + timedelta(days=1), ref + timedelta(days=7)
    # festival window from the independent India-holidays calendar (not the
    # generator config); events from current live news, geolocated to hexes.
    is_fest = int(live_calendar.festival_in_window(coming_start, coming_end) is not None)
    coming_event_hexes: set[str] = live_calendar.event_hexes()

    seasonal = _seasonal_index(df, ref)

    # per-hex weekend concentration from full history as of ref (one groupby)
    hist = temporal.as_of(df, ref)
    wshare = _weekend_share_by_hex(hist)

    rows = []
    for c in cells:
        rows.append({
            "h3_r8": c,
            "count_7d_prior": int(c7.get(c, 0)),
            "count_28d_prior": int(c28.get(c, 0)),
            "near_repeat_signal": round(float(nr.get(c, 0.0)), 4),
            "kde_intensity": round(float(kde.get(c, 0.0)), 4),
            "is_festival_week": is_fest,
            "event_flag": int(c in coming_event_hexes),
            "dow_peak_indicator": round(float(wshare.get(c, 0.0)), 4),
            "seasonal_index": seasonal,
            "news_uplift": 0.0,
        })
    return pd.DataFrame(rows).set_index("h3_r8")


def _weekend_share_by_hex(df: pd.DataFrame) -> dict[str, float]:
    """Weekend (Fri/Sat) share of each hex's incidents, in one groupby."""
    if df.empty:
        return {}
    g = df.groupby("h3_r8")["is_weekend"].agg(["sum", "count"])
    share = (g["sum"] / g["count"]).fillna(0.0)
    return share.to_dict()


# ---------------------------------------------------------------------------
# historical panel (for Poisson fit)
# ---------------------------------------------------------------------------
def build_panel(df: pd.DataFrame, ref: date,
                kde: dict[str, float] | None = None) -> pd.DataFrame:
    """(hex, week_start) rows with target count + as-of features.

    Every feature is computed with data strictly before the week it labels — no
    look-ahead. In particular the KDE surface is **refit per week** on incidents
    up to that week's start (``as_of_ref``); reusing a single ref-date KDE across
    all weeks would let past weeks see the future density (feature leakage). The
    ``kde`` argument is accepted for call-site compatibility but ignored here.

    ``is_festival_week`` comes from the independent India-holidays calendar.
    ``event_flag`` is 0 across the panel: current live events have no history, so
    the GLM (which drops zero-variance columns) simply ignores it, and events
    instead reach the score through the post-model ``news_uplift`` path (FR-8).
    """
    if "_ts_local" not in df.columns:
        df = temporal.add_time_features(df)
    cells = sorted(df["h3_r8"].unique().tolist())
    d = df["_ts_local"].dt.date
    first = d.min()
    starts = temporal.week_starts(first, ref)

    records: list[dict] = []
    for ws in starts:
        we = ws + timedelta(days=6)                    # target week [ws, ws+6]
        as_of_ref = ws - timedelta(days=1)             # features use data < ws
        prior = df[d <= as_of_ref]
        if prior.empty:
            continue

        target = df[(d >= ws) & (d <= we)].groupby("h3_r8").size()
        c7 = temporal.window_counts(df, as_of_ref, 7)
        c28 = temporal.window_counts(df, as_of_ref, 28)
        nr = near_repeat.near_repeat_signals(df, cells, as_of_ref)
        # refit the density surface as of this week's start — no future incidents
        kde_w = hotspots.kde_intensity(df, cells, as_of_ref)
        seasonal = _seasonal_index(df, as_of_ref)
        is_fest = int(live_calendar.festival_in_window(ws, we) is not None)

        wshare = _weekend_share_by_hex(prior)
        for c in cells:
            records.append({
                "h3_r8": c,
                "week_start": ws.isoformat(),
                "count": int(target.get(c, 0)),
                "count_7d_prior": int(c7.get(c, 0)),
                "count_28d_prior": int(c28.get(c, 0)),
                "near_repeat_signal": round(float(nr.get(c, 0.0)), 4),
                "kde_intensity": round(float(kde_w.get(c, 0.0)), 4),
                "is_festival_week": is_fest,
                "event_flag": 0,
                "dow_peak_indicator": round(float(wshare.get(c, 0.0)), 4),
                "seasonal_index": seasonal,
                "news_uplift": 0.0,
            })
    return pd.DataFrame.from_records(records)
