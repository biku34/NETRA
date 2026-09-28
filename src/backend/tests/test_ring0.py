"""Ring 0 tests (§15.1 subset).

Run:  cd backend && ./.venv/Scripts/python.exe -m pytest -q
"""
from __future__ import annotations

import hashlib

import pandas as pd

from app.config import get_settings
from app.core import h3_utils
from app.data import loader
from app.data.generator import generate


def _hash(df: pd.DataFrame) -> str:
    return hashlib.sha256(
        pd.util.hash_pandas_object(df, index=True).values.tobytes()
    ).hexdigest()


def test_generator_reproducible():
    """Same seed -> byte-identical data (CR-5)."""
    df1 = generate().reset_index(drop=True)
    df2 = generate().reset_index(drop=True)
    assert len(df1) == len(df2) > 0
    assert _hash(df1) == _hash(df2)


def test_h3_binning():
    """Known lat/lng -> stable res-8 cell, and centroid round-trips nearby."""
    settings = get_settings()
    cell = h3_utils.latlng_to_cell(28.6512, 77.1905, settings.h3_res)
    assert isinstance(cell, str) and len(cell) == 15
    # same point -> same cell
    assert cell == h3_utils.latlng_to_cell(28.6512, 77.1905, settings.h3_res)
    # centroid of the cell is within ~500 m of the original point
    clat, clng = h3_utils.cell_to_latlng(cell)
    assert h3_utils.haversine_m(28.6512, 77.1905, clat, clng) < 500


def test_normalization_recomputes_h3_and_drops_bad_rows():
    """Loader recomputes h3, coerces fields, and drops unrecoverable rows (FR-2)."""
    raw = pd.DataFrame(
        [
            {"timestamp": "2026-04-12T21:34:00+05:30", "latitude": 28.6448,
             "longitude": 77.2167, "crime_type": "theft", "h3_r8": "TRUST_ME_NOT"},
            {"timestamp": "not-a-date", "latitude": 28.6, "longitude": 77.2,
             "crime_type": "theft"},                       # bad timestamp -> dropped
            {"timestamp": "2026-04-12T10:00:00+05:30", "latitude": 28.6,
             "longitude": 77.2, "crime_type": "not_a_crime"},  # bad type -> dropped
        ]
    )
    clean = loader.normalize(raw)
    assert len(clean) == 1
    row = clean.iloc[0]
    # h3 recomputed, not trusted from input
    assert row["h3_r8"] != "TRUST_ME_NOT"
    assert row["h3_r8"] == h3_utils.latlng_to_cell(28.6448, 77.2167,
                                                    get_settings().h3_res)


def test_manifest_has_ground_truth():
    """Generation records the injected patterns for the demo/tests (DR-3)."""
    import json

    from app.config import MANIFEST_JSON

    generate()
    m = json.loads(MANIFEST_JSON.read_text())
    assert len(m["attractors"]) >= 3
    assert m["festival"]["start"] and m["festival"]["end"]
    assert len(m["events"]) >= 1
    assert m["near_repeat"]["injected_followups"] > 0
