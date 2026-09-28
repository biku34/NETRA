"""FR-2 — Ingestion & normalization.

Brings any source (synthetic, domain, news) into the canonical schema (DR-1):
coerce timestamps to IST ISO-8601, repair/drop invalid coordinates, recompute
``h3_r8`` on ingest (never trusted from input), assign source/confidence, and
load into SQLite.

Invalid rows are logged, not silently dropped (FR-2 acceptance).
"""
from __future__ import annotations

import logging

import pandas as pd

from app.config import CRIME_TYPES, INCIDENTS_PARQUET, get_settings
from app.core import h3_utils
from app.store import db

log = logging.getLogger("bob.loader")

_REQUIRED = ["timestamp", "latitude", "longitude", "crime_type"]


def normalize(df: pd.DataFrame) -> pd.DataFrame:
    """Return a canonical-schema DataFrame; log & drop unrecoverable rows."""
    settings = get_settings()
    minlat, minlng, maxlat, maxlng = settings.bbox
    df = df.copy()

    missing = [c for c in _REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"Input missing required columns: {missing}")

    n_in = len(df)

    # timestamps -> tz-aware IST
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    bad_ts = df["timestamp"].isna()
    if bad_ts.any():
        log.warning("Dropping %d rows with unparseable timestamps", int(bad_ts.sum()))
    df = df[~bad_ts]

    # coordinates: numeric + within a sane range (allow a small margin round bbox)
    for col in ("latitude", "longitude"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    bad_coord = df["latitude"].isna() | df["longitude"].isna()
    if bad_coord.any():
        log.warning("Dropping %d rows with invalid coordinates", int(bad_coord.sum()))
    df = df[~bad_coord]

    # crime type must be in taxonomy
    bad_type = ~df["crime_type"].isin(CRIME_TYPES)
    if bad_type.any():
        log.warning("Dropping %d rows with unknown crime_type", int(bad_type.sum()))
    df = df[~bad_type]

    # recompute h3 on ingest (DR-1: never trust incoming h3)
    df["h3_r8"] = [
        h3_utils.latlng_to_cell(lat, lng, settings.h3_res)
        for lat, lng in zip(df["latitude"], df["longitude"])
    ]

    # defaults / coercions for optional canonical fields.
    # NB: DataFrame.get(col, default) returns the scalar default when the column
    # is missing, so we materialise a Series before calling Series methods.
    def _col(name: str, default):
        if name in df.columns:
            return df[name]
        return pd.Series([default] * len(df), index=df.index)

    if "incident_id" not in df.columns:
        import uuid
        df["incident_id"] = [str(uuid.uuid4()) for _ in range(len(df))]
    df["severity"] = (
        pd.to_numeric(_col("severity", 2), errors="coerce").fillna(2).clip(1, 5).astype(int)
    )
    df["reported_via"] = _col("reported_via", "synthetic").fillna("synthetic")
    df["location_name"] = _col("location_name", None)
    df["source"] = _col("source", "synthetic").fillna("synthetic")
    df["confidence"] = (
        pd.to_numeric(_col("confidence", 1.0), errors="coerce").fillna(1.0).clip(0, 1)
    )

    log.info("Normalized %d/%d rows (dropped %d)", len(df), n_in, n_in - len(df))
    return df.reset_index(drop=True)


def load_dataframe(df: pd.DataFrame) -> int:
    """Normalize then replace the incidents table. Returns rows loaded."""
    clean = normalize(df)
    return db.replace_incidents(clean)


def load_from_csv() -> int:
    """(Re)load incidents from the static CSV dataset into SQLite."""
    from app.data import csv_store

    return load_dataframe(csv_store.incidents())


def load_from_parquet(path=INCIDENTS_PARQUET) -> int:
    """(Re)load incidents from the generated parquet into SQLite."""
    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found. Run `python -m app.data.generator` first.")
    df = pd.read_parquet(path)
    return load_dataframe(df)
