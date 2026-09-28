"""FR-6 — Prediction engine (top-N at-risk zones with drivers).

Two models, both shipped:

* **RWF** — Recency-Weighted Frequency baseline. Always works, <1s. Used as the
  fallback when the GLM will not fit.
* **Poisson GLM** — the probability-rationale engine. Fit on the historical
  hex-week panel; predicts λ̂ for the coming week and converts to
  ``P(≥1) = 1 - exp(-λ̂)``. Per-feature contribution ``β_j · x_j`` gives the
  ranked, explainable drivers (CR-4 / NFR-2).

Default is Poisson; RWF is exposed as a toggle and the small-data safety net.
"""
from __future__ import annotations

import logging
import math
from datetime import date, timedelta
from functools import lru_cache

import numpy as np
import pandas as pd

from app.config import CRIME_PROFILES, get_scenario, get_settings
from app.core import h3_utils, temporal
from app.intelligence import features as F
from app.intelligence import hotspots, near_repeat

log = logging.getLogger("bob.predictor")

# RWF decay: 30-day-old incident weighs ~0.3  ->  λ = ln(1/0.3)/30
_RWF_LAMBDA = math.log(1 / 0.3) / 30
_BETA_NR = 1.0
_BETA_KDE = 0.8
# continuous features standardized for the GLM; binary flags kept raw
_BINARY = {"is_festival_week", "event_flag"}


# ---------------------------------------------------------------------------
# RWF baseline
# ---------------------------------------------------------------------------
def _rwf(df: pd.DataFrame, ref: date, cells: list[str],
         kde: dict[str, float] | None = None) -> dict[str, float]:
    hist = temporal.as_of(df, ref).copy()
    hist["_days_ago"] = (pd.Timestamp(ref) - hist["_ts_local"].dt.normalize()).dt.days
    hist["_w"] = hist["crime_type"].map(
        lambda t: CRIME_PROFILES[t].base_weight if t in CRIME_PROFILES else 1.0
    ) * np.exp(-_RWF_LAMBDA * hist["_days_ago"].clip(lower=0))
    decay = hist.groupby("h3_r8")["_w"].sum()

    nr = near_repeat.near_repeat_signals(df, cells, ref)
    if kde is None:
        kde = hotspots.kde_intensity(df, cells, ref)
    raw = {
        c: float(decay.get(c, 0.0)) + _BETA_NR * nr.get(c, 0.0) + _BETA_KDE * kde.get(c, 0.0)
        for c in cells
    }
    lo, hi = min(raw.values()), max(raw.values())
    span = (hi - lo) or 1.0
    return {c: (v - lo) / span for c, v in raw.items()}


# ---------------------------------------------------------------------------
# Poisson GLM
# ---------------------------------------------------------------------------
def _fit_poisson(panel: pd.DataFrame):
    """Return (result, used_cols, scaler_mean, scaler_std, family_name) or None."""
    import statsmodels.api as sm

    cols = [c for c in F.FEATURES if panel[c].std(ddof=0) > 1e-9]
    if not cols or len(panel) < 30:
        return None

    X = panel[cols].astype(float).copy()
    cont = [c for c in cols if c not in _BINARY]
    mean = X[cont].mean()
    std = X[cont].std(ddof=0).replace(0, 1.0)
    X[cont] = (X[cont] - mean) / std
    X = sm.add_constant(X, has_constant="add")
    y = panel["count"].astype(float)

    try:
        res = sm.GLM(y, X, family=sm.families.Poisson()).fit()
    except Exception as e:  # convergence / singularity
        log.warning("Poisson GLM failed: %s", e)
        return None

    # overdispersion check -> negative binomial
    family = "poisson"
    try:
        dof = max(1, int(res.df_resid))
        dispersion = float(res.pearson_chi2) / dof
        if dispersion > 1.5:
            nb = sm.GLM(y, X, family=sm.families.NegativeBinomial(alpha=1.0)).fit()
            res, family = nb, "negative_binomial"
            log.info("Overdispersion %.2f -> negative_binomial", dispersion)
    except Exception:
        pass

    return res, cols, mean, std, family


def _drivers_for(x_scaled: pd.Series, params: pd.Series, raw: pd.Series, cols: list[str]):
    contribs = []
    for c in cols:
        beta = float(params.get(c, 0.0))
        contribution = beta * float(x_scaled[c])
        if abs(contribution) < 1e-6:
            continue
        contribs.append({
            "name": c,
            "label": F.FEATURE_LABELS.get(c, c),
            "value": round(float(raw[c]), 3),
            "contribution": round(contribution, 4),
            "direction": "up" if contribution >= 0 else "down",
        })
    contribs.sort(key=lambda d: abs(d["contribution"]), reverse=True)
    return contribs


# ---------------------------------------------------------------------------
# public entry
# ---------------------------------------------------------------------------
# localities that are only district-wide fallbacks — never use them to name a hex
_NAME_EXCLUDE = {"gandhinagar", "gujarat", "info city"}
# nicer display forms for acronym localities
_DISPLAY = {"gift city": "GIFT City", "pdeu": "PDEU", "pdpu": "PDEU"}


def _display_name(key: str) -> str:
    return _DISPLAY.get(key, key.title())


@lru_cache(maxsize=1)
def _places() -> tuple[tuple[str, float, float], ...]:
    """Named places (attractors + gazetteer localities) used to name every hex."""
    places: list[tuple[str, float, float]] = [
        (a.name, a.lat, a.lng) for a in get_scenario().attractors
    ]
    have = {p[0].lower() for p in places}
    from app.news.geocode import LOCALITY_GAZETTEER

    for key, (lat, lng) in LOCALITY_GAZETTEER.items():
        if key in _NAME_EXCLUDE:
            continue
        name = _display_name(key)
        if name.lower() in have:
            continue
        places.append((name, lat, lng))
        have.add(name.lower())
    return tuple(places)


def _name_for(cell: str) -> str:
    """Name a hex after its nearest locality — never a raw H3 string."""
    clat, clng = h3_utils.cell_centroid_cached(cell)
    best, best_d = None, 1e18
    for name, lat, lng in _places():
        dd = h3_utils.haversine_m(clat, clng, lat, lng)
        if dd < best_d:
            best, best_d = name, dd
    if best is None:
        return cell[:10]
    return best if best_d <= 650 else f"{best} area"


# News augmentation: a fully-newsy zone (uplift=1) lifts λ̂ by this fraction.
# Applied on top of the base model because real-time news is not in the panel
# (historical news_uplift is 0), so the GLM cannot learn its weight (FR-8).
_BETA_NEWS = 0.35


def predict(df: pd.DataFrame, ref: date | None = None, top_n: int = 5,
            force_model: str | None = None,
            news_uplift: dict[str, float] | None = None,
            news_by_hex: dict[str, list] | None = None,
            news_available: bool = False) -> dict:
    if "_ts_local" not in df.columns:
        df = temporal.add_time_features(df)
    if ref is None:
        ref = df["_ts_local"].dt.date.max()
    cells = sorted(df["h3_r8"].unique().tolist())

    # Fit the stationary KDE surface once and reuse it everywhere (NFR-1).
    kde = hotspots.kde_intensity(df, cells, ref)
    live = F.live_features(df, ref, kde=kde)
    rwf = _rwf(df, ref, cells, kde=kde)

    model_used = "rwf"
    zones_risk: dict[str, dict] = {}

    fit = None
    if force_model != "rwf":
        # build_panel refits KDE per week internally (leakage-free); it does not
        # take the ref-date surface.
        panel = F.build_panel(df, ref)
        fit = _fit_poisson(panel) if not panel.empty else None

    if fit is not None:
        res, cols, mean, std, family = fit
        model_used = family
        cont = [c for c in cols if c not in _BINARY]
        Xlive = live[cols].astype(float).copy()
        raw_live = live[cols].astype(float).copy()
        Xlive[cont] = (Xlive[cont] - mean) / std
        import statsmodels.api as sm
        Xdesign = sm.add_constant(Xlive, has_constant="add")
        lam = np.asarray(res.predict(Xdesign), dtype=float)
        lam = np.clip(lam, 1e-6, None)
        prob = 1.0 - np.exp(-lam)
        lo, hi = lam.min(), lam.max()
        span = (hi - lo) or 1.0
        for i, c in enumerate(cells):
            drivers = _drivers_for(Xlive.loc[c], res.params, raw_live.loc[c], cols)
            zones_risk[c] = {
                "expected_count": round(float(lam[i]), 3),
                "probability": round(float(prob[i]), 3),
                "risk_score": round(float((lam[i] - lo) / span), 4),
                "drivers": drivers,
            }
    else:
        # RWF fallback: calibrate a probability from normalized risk
        for c in cells:
            r = rwf[c]
            implied_lambda = 0.051 + 1.846 * r
            zones_risk[c] = {
                "expected_count": round(implied_lambda, 3),
                "probability": round(1 - math.exp(-implied_lambda), 3),
                "risk_score": round(r, 4),
                "drivers": _rwf_drivers(live.loc[c]),
            }

    # assemble; apply news augmentation to expected_count, then recompute
    # probability + normalized risk_score across all zones (FR-8).
    news_uplift = news_uplift or {}
    news_by_hex = news_by_hex or {}
    zones = []
    for c in cells:
        zr = zones_risk[c]
        exp = zr["expected_count"]
        drivers = list(zr["drivers"])
        nu = float(news_uplift.get(c, 0.0))
        if nu > 0:
            exp = exp * (1 + _BETA_NEWS * nu)
            drivers.append({
                "name": "news_uplift",
                "label": F.FEATURE_LABELS["news_uplift"],
                "value": round(nu, 3),
                "contribution": round(_BETA_NEWS * nu, 4),
                "direction": "up",
            })
            # keep drivers ranked by absolute contribution (news takes its rightful place)
            drivers.sort(key=lambda d: abs(d["contribution"]), reverse=True)
        zones.append({
            "h3_r8": c,
            "name": _name_for(c),
            "centroid": h3_utils.centroid(c),
            "probability": round(1 - math.exp(-max(exp, 1e-6)), 3),
            "expected_count": round(exp, 3),
            "_lambda": exp,
            "drivers": _ensure_min_drivers(drivers, live.loc[c]),
            "news_events": news_by_hex.get(c, []),
        })

    # normalize risk_score from the (possibly news-adjusted) lambda
    lams = [z["_lambda"] for z in zones]
    lo, hi = (min(lams), max(lams)) if lams else (0.0, 1.0)
    span = (hi - lo) or 1.0
    for z in zones:
        z["risk_score"] = round((z.pop("_lambda") - lo) / span, 4)

    zones.sort(key=lambda z: (z["probability"], z["risk_score"]), reverse=True)
    for rank, z in enumerate(zones, start=1):
        z["rank"] = rank if rank <= top_n else None

    return {
        "ref_date": ref.isoformat(),
        "model_used": model_used,
        "top_n": top_n,
        "news_available": news_available,
        "zones": zones,
    }


def _rwf_drivers(feat: pd.Series) -> list[dict]:
    """Descriptive drivers for the RWF fallback (no fitted betas)."""
    candidates = [
        ("near_repeat_signal", feat["near_repeat_signal"]),
        ("kde_intensity", feat["kde_intensity"]),
        ("count_7d_prior", feat["count_7d_prior"]),
        ("is_festival_week", feat["is_festival_week"]),
    ]
    out = []
    for name, val in candidates:
        if float(val) > 0:
            out.append({
                "name": name,
                "label": F.FEATURE_LABELS.get(name, name),
                "value": round(float(val), 3),
                "contribution": round(float(val), 4),
                "direction": "up",
            })
    return out


def _ensure_min_drivers(drivers: list[dict], feat: pd.Series) -> list[dict]:
    """Guarantee ≥2 ranked drivers per zone (NFR-2 / CR-4)."""
    if len(drivers) >= 2:
        return drivers
    have = {d["name"] for d in drivers}
    for name in ("count_7d_prior", "count_28d_prior", "kde_intensity", "near_repeat_signal"):
        if name in have:
            continue
        drivers.append({
            "name": name,
            "label": F.FEATURE_LABELS.get(name, name),
            "value": round(float(feat[name]), 3),
            "contribution": 0.0,
            "direction": "up",
        })
        if len(drivers) >= 2:
            break
    return drivers
