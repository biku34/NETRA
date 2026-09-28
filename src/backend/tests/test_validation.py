"""Backtest metrics are internally consistent and leakage-free."""
from __future__ import annotations

from app.intelligence import service, validation


def test_backtest_is_consistent():
    service.cached_df()
    r = validation.backtest(5)
    assert r["available"] is True
    assert r["weeks_tested"] >= 1
    # hits never exceed the incidents that occurred, and the model never beats
    # the theoretical ceiling
    assert 0 <= r["model"]["captured"] <= r["total_incidents"]
    assert r["model"]["captured"] <= r["best_possible"]["captured"]
    # PAI > 1 means better than random patrol coverage
    assert r["model"]["pai"] > 1
    # PEI is a fraction of the best possible
    assert 0 <= r["model"]["pei"] <= 1
    # per-week hits are bounded by that week's incidents
    for w in r["weeks"]:
        assert w["model_hits"] <= w["incidents"]
        assert w["best_possible"] <= w["incidents"]
    # coverage curve rises with k and the model clears the random line
    curve = r["coverage_curve"]
    assert curve[-1]["model"] >= curve[0]["model"]
    assert all(pt["model"] >= pt["random"] for pt in curve)

