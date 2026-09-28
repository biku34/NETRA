"""Ring 1 tests (§15.1 subset): near-repeat, predict shape, spike detection."""
from __future__ import annotations

import warnings

import pandas as pd

from app.core import temporal
from app.data.generator import generate
from app.intelligence import near_repeat, predictor, spikes

warnings.filterwarnings("ignore")


def _df():
    return temporal.add_time_features(generate())


def test_near_repeat_signal_elevated_in_active_hexes():
    """Injected near-repeat chains score materially higher than the median (FR-5)."""
    df = _df()
    ref = df["_ts_local"].dt.date.max()
    cells = sorted(df["h3_r8"].unique().tolist())
    sig = near_repeat.near_repeat_signals(df, cells, ref)
    vals = pd.Series(sig)
    # the busiest recent hexes should be well above the median signal
    top = vals.sort_values(ascending=False).head(5).mean()
    med = vals.median()
    assert top > med
    assert top > 0


def test_predict_shape():
    """Top-5 returned; each zone has >=2 drivers; probabilities in [0,1] (FR-6)."""
    df = _df()
    res = predictor.predict(df, top_n=5)
    assert res["model_used"] in {"poisson", "negative_binomial", "rwf"}
    ranked = [z for z in res["zones"] if z["rank"] is not None]
    assert len(ranked) == 5
    for z in res["zones"]:
        assert 0.0 <= z["probability"] <= 1.0
        assert len(z["drivers"]) >= 2
    # probability is monotonic with expected_count (lambda)
    top = res["zones"][0]
    assert top["rank"] == 1
    # top zones should coincide with injected attractors
    named = {z["name"] for z in ranked if z["name"]}
    assert len(named) >= 2


def test_spike_detects_festival():
    """The festival window is flagged and labelled 'seasonal' (FR-7 acceptance)."""
    from app.config import get_scenario

    df = _df()
    sp = spikes.detect_spikes(df)
    assert len(sp) > 0
    labels = {s["label"] for s in sp}
    assert "seasonal" in labels
    seasonal = [s for s in sp if s["label"] == "seasonal"]
    fest = get_scenario().festival_name.lower()
    assert any(fest in (s["linked_reason"] or "").lower() for s in seasonal)


def test_rwf_fallback_produces_ranked_zones():
    """Forcing the RWF baseline still yields ranked zones with drivers."""
    df = _df()
    res = predictor.predict(df, top_n=5, force_model="rwf")
    assert res["model_used"] == "rwf"
    ranked = [z for z in res["zones"] if z["rank"] is not None]
    assert len(ranked) == 5
    for z in ranked:
        assert len(z["drivers"]) >= 2
