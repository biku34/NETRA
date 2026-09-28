"""FR-4 — Hotspot detection (Kernel Density Estimation).

A smooth crime-intensity surface for visualization and as a model feature.
Uses a Gaussian kernel with the haversine metric so the bandwidth is expressed
in real metres (SRS: 300-500 m). Evaluated at each populated hex centroid and
normalized 0-1.

KDE peaks should coincide with the generator's attractor centres (FR-4
acceptance).
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd
from sklearn.neighbors import KernelDensity

from app.core import h3_utils

_EARTH_R_M = 6_371_000.0
DEFAULT_BANDWIDTH_M = 450.0


def kde_intensity(
    df: pd.DataFrame,
    cells: list[str],
    ref: date,
    window_days: int | None = 90,
    bandwidth_m: float = DEFAULT_BANDWIDTH_M,
) -> dict[str, float]:
    """Return {h3_r8: intensity in [0,1]} from a KDE over incident coords.

    Only incidents on/before `ref` (and within the trailing window) are used, so
    the feature is leakage-free when called per panel week.
    """
    if "_ts_local" in df.columns:
        d = df["_ts_local"].dt.date
    else:
        d = pd.to_datetime(df["timestamp"]).dt.tz_localize(None).dt.date
    mask = d <= ref
    if window_days is not None:
        mask &= d > (ref - timedelta(days=window_days))
    sub = df[mask]

    if len(sub) < 5 or not cells:
        return {c: 0.0 for c in cells}

    train = np.radians(sub[["latitude", "longitude"]].to_numpy())
    bw_rad = bandwidth_m / _EARTH_R_M
    kde = KernelDensity(metric="haversine", kernel="gaussian", bandwidth=bw_rad)
    kde.fit(train)

    centroids = np.radians(
        np.array([h3_utils.cell_centroid_cached(c) for c in cells])
    )
    log_dens = kde.score_samples(centroids)
    dens = np.exp(log_dens)

    lo, hi = dens.min(), dens.max()
    if hi <= lo:
        return {c: 0.0 for c in cells}
    norm = (dens - lo) / (hi - lo)
    return {c: float(v) for c, v in zip(cells, norm)}
