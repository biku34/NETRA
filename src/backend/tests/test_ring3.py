"""Ring 3 tests: news correlation + graceful degradation (FR-8 / CR-6)."""
from __future__ import annotations

import warnings
from datetime import date

import pandas as pd

from app.core import temporal
from app.data.generator import generate
from app.intelligence import predictor
from app.news import correlate, gdelt, geocode

warnings.filterwarnings("ignore")


def _df():
    return temporal.add_time_features(generate())


def test_gazetteer_locates_known_localities():
    """Real news place-names resolve to coordinates (FR-8)."""
    assert geocode.locate_from_text("Theft reported near Sector 21 market")[2] == "sector 21"
    assert geocode.locate_from_text("GIFT City summit crowd")[2] == "gift city"
    assert geocode.locate_from_text("Snatching in Infocity")[2] == "infocity"
    assert geocode.locate_from_text("Nothing relevant here") is None


def test_news_degrades_gracefully_when_gdelt_down(monkeypatch):
    """GDELT failure -> calendar still supplies signal; no exception (CR-6)."""
    def _boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(gdelt, "fetch_articles", _boom)

    df = _df()
    cells = sorted(df["h3_r8"].unique().tolist())
    ref = df["_ts_local"].dt.date.max()
    news = correlate.compute_news_uplift(cells, ref)
    assert news["gdelt_ok"] is False
    # calendar events still populate uplift
    assert any(v > 0 for v in news["uplift"].values())
    assert any(it["type"] != "news" for it in news["items"])


def test_predict_still_returns_with_news_off(monkeypatch):
    """Core prediction is unaffected when augmentation yields nothing (CR-6)."""
    def _boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(gdelt, "fetch_articles", _boom)
    df = _df()
    cells = sorted(df["h3_r8"].unique().tolist())
    ref = df["_ts_local"].dt.date.max()
    news = correlate.compute_news_uplift(cells, ref)
    res = predictor.predict(df, ref, top_n=5,
                            news_uplift=news["uplift"], news_by_hex=news["by_hex"],
                            news_available=news["available"])
    ranked = [z for z in res["zones"] if z["rank"] is not None]
    assert len(ranked) == 5
    for z in res["zones"]:
        assert 0.0 <= z["probability"] <= 1.0


def test_news_uplift_adds_driver_and_events():
    """A hex near a calendar event gets a news driver + cited events (FR-8)."""
    df = _df()
    cells = sorted(df["h3_r8"].unique().tolist())
    ref = df["_ts_local"].dt.date.max()
    news = correlate.compute_news_uplift(cells, ref)
    res = predictor.predict(df, ref, top_n=5,
                            news_uplift=news["uplift"], news_by_hex=news["by_hex"],
                            news_available=news["available"])
    newsy = [z for z in res["zones"]
             if any(d["name"] == "news_uplift" for d in z["drivers"])]
    assert len(newsy) > 0
    assert any(z["news_events"] for z in res["zones"])
