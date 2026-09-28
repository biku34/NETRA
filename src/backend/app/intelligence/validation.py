"""FR-14 — Backtest: does the hotspot model actually predict where crime happens?

An honest rolling-origin evaluation. For each recent week we:
  1. train / predict using ONLY incidents on or before that week's start
     (no look-ahead — the same leakage-free path build_panel uses);
  2. take the model's top-K hotspot hexes;
  3. count how many incidents that ACTUALLY occurred in the next 7 days fell
     inside those hexes.

Reported metrics are the standard crime-forecasting ones:

* **Hit rate** — share of next-week incidents captured inside the flagged hexes.
* **Area %** — share of the jurisdiction flagged (K hexes of N).
* **PAI** (Prediction Accuracy Index) = hit_rate / area% — >1 beats random
  patrolling; the higher the better.
* **PEI** (Predictive Efficiency Index) = PAI / PAI_max — how close the model
  is to the *best any K-hex forecast could have done* that week (1.0 = perfect).

Two references are scored on the exact same weeks and hexes:
  * **Random** patrol — PAI = 1 by definition (the break-even line).
  * **Persistence** — flag last month's busiest hexes; the naive baseline a
    good model must beat.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from functools import lru_cache

import pandas as pd

from app.core import temporal
from app.intelligence import predictor, service

log = logging.getLogger("bob.validation")

# how many recent weeks to score, and the minimum history before the first one
_MAX_WEEKS = 8
_MIN_HISTORY_DAYS = 56
# operational flag size: the SHO patrols the top-N zones (matches the app default)
_DEFAULT_TOPK = 5


def _actual_counts(df: pd.DataFrame, d: pd.Series, start: date, end: date) -> pd.Series:
    """Incidents per hex in the window [start, end] (inclusive)."""
    win = df[(d >= start) & (d <= end)]
    return win.groupby("h3_r8").size() if not win.empty else pd.Series(dtype=int)


def _persistence_rank(df: pd.DataFrame, d: pd.Series, ref: date) -> list[str]:
    """Hexes ordered by incident count in the trailing 28 days (naive baseline)."""
    counts = temporal.window_counts(df, ref, 28)
    return list(counts.sort_values(ascending=False).index)


def _hits(actual: pd.Series, cells: list[str]) -> int:
    return int(actual.reindex(cells).fillna(0).sum())


def _run(top_k: int) -> dict:
    df = service.cached_df()
    if df.empty:
        return {"available": False, "reason": "No incidents loaded."}
    if "_ts_local" not in df.columns:
        df = temporal.add_time_features(df)

    d = df["_ts_local"].dt.date
    first, last = d.min(), d.max()
    n_cells = int(df["h3_r8"].nunique())

    # week starts whose full 7-day actual window fits inside the data and that
    # have enough history behind them to train
    starts = [
        ws for ws in temporal.week_starts(first, last)
        if ws >= first + timedelta(days=_MIN_HISTORY_DAYS)
        and ws + timedelta(days=6) <= last
    ][-_MAX_WEEKS:]

    if not starts:
        return {"available": False, "reason": "Not enough history to backtest yet."}

    weeks: list[dict] = []
    tot_actual = tot_model = tot_persist = tot_best = 0
    # each scored week's (actual counts, model ranking, persistence ranking),
    # kept so the coverage curve reuses the same fits (one GLM per week, not two)
    per_week: list[tuple[pd.Series, list[str], list[str]]] = []

    for ws in starts:
        ref = ws - timedelta(days=1)                 # predict as of the day before
        we = ws + timedelta(days=6)
        actual = _actual_counts(df, d, ws, we)
        n_actual = int(actual.sum())
        if n_actual == 0:
            continue

        # model: rank all hexes by predicted rate (no live-news uplift, so the
        # backtest is reproducible and uses only what history could know)
        pred = predictor.predict(df, ref=ref, top_n=top_k)
        model_rank = [z["h3_r8"] for z in
                      sorted(pred["zones"], key=lambda z: z["expected_count"], reverse=True)]
        persist_rank = _persistence_rank(df, d, ref)
        per_week.append((actual, model_rank, persist_rank))

        model_cells = model_rank[:top_k]
        persist_cells = persist_rank[:top_k]
        # the best any K hexes could have captured that week (the efficiency ceiling)
        best = int(actual.sort_values(ascending=False).head(top_k).sum())

        m_hits = _hits(actual, model_cells)
        p_hits = _hits(actual, persist_cells)
        tot_actual += n_actual
        tot_model += m_hits
        tot_persist += p_hits
        tot_best += best

        weeks.append({
            "week_start": ws.isoformat(),
            "incidents": n_actual,
            "model_hits": m_hits,
            "persistence_hits": p_hits,
            "best_possible": best,
            "model_hit_rate": round(m_hits / n_actual, 4),
            "persistence_hit_rate": round(p_hits / n_actual, 4),
        })

    if not weeks or tot_actual == 0:
        return {"available": False, "reason": "No incidents in the backtest window."}

    area_pct = top_k / n_cells
    model_hr = tot_model / tot_actual
    persist_hr = tot_persist / tot_actual
    best_hr = tot_best / tot_actual

    def pai(hr: float) -> float:
        return round(hr / area_pct, 2) if area_pct else 0.0

    return {
        "available": True,
        "ref_date": last.isoformat(),
        "weeks_tested": len(weeks),
        "top_k": top_k,
        "total_zones": n_cells,
        "area_pct": round(area_pct, 4),
        "total_incidents": tot_actual,
        "model": {
            "hit_rate": round(model_hr, 4),
            "captured": tot_model,
            "pai": pai(model_hr),
            "pei": round(model_hr / best_hr, 4) if best_hr else 0.0,
        },
        "persistence": {
            "hit_rate": round(persist_hr, 4),
            "captured": tot_persist,
            "pai": pai(persist_hr),
        },
        "best_possible": {
            "hit_rate": round(best_hr, 4),
            "captured": tot_best,
            "pai": pai(best_hr),
        },
        "uplift_vs_persistence": round(model_hr / persist_hr, 2) if persist_hr else None,
        "coverage_curve": _coverage_curve(per_week, n_cells),
        "weeks": weeks,
    }


def _coverage_curve(per_week: list[tuple[pd.Series, list[str], list[str]]],
                    n_cells: int) -> list[dict]:
    """Pooled hit rate as the flagged area grows — model vs persistence vs the
    break-even (random) line. Shows the result is not cherry-picked to one K."""
    ks = sorted({k for k in (1, 2, 3, 5, 8, 10, 15, 20, 30) if k <= n_cells})
    curve = []
    for k in ks:
        tot = m = p = 0
        for actual, model_rank, persist_rank in per_week:
            tot += int(actual.sum())
            m += _hits(actual, model_rank[:k])
            p += _hits(actual, persist_rank[:k])
        if tot:
            curve.append({
                "k": k,
                "area_pct": round(k / n_cells, 4),
                "model": round(m / tot, 4),
                "persistence": round(p / tot, 4),
                "random": round(k / n_cells, 4),
            })
    return curve


@lru_cache(maxsize=4)
def _cached(ref_date: str, top_k: int) -> dict:
    # ref_date only keys the cache to the loaded dataset; _run reads cached_df()
    return _run(top_k)


def backtest(top_k: int = _DEFAULT_TOPK) -> dict:
    df = service.cached_df()
    if df.empty:
        return {"available": False, "reason": "No incidents loaded."}
    ref = str(df["_ts_local"].dt.date.max() if "_ts_local" in df.columns
              else temporal.add_time_features(df)["_ts_local"].dt.date.max())
    return _cached(ref, top_k)
