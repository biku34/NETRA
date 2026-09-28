"""Thin caching layer over the intelligence engine.

Predictions and spikes are computed once per (ref_date, top_n) and reused across
/predict, /spikes and /zones so a page load stays within NFR-1. The cache is
invalidated whenever the incident count changes (e.g. after /ingest).
"""
from __future__ import annotations

from datetime import date
from typing import Optional

import pandas as pd

from app.intelligence import predictor, spikes
from app.store import db

_cache: dict = {"key": None, "predict": None, "spikes": None, "df": None, "news": None}


def _load_df() -> pd.DataFrame:
    from app.core import temporal

    df = db.load_incidents()
    if df.empty:
        return df
    return temporal.add_time_features(df)


def _key(ref: Optional[str], top_n: int) -> tuple:
    from app.data import csv_store

    return (db.incident_count(), csv_store.signature(), ref or "latest", top_n)


def invalidate() -> None:
    _cache.update(key=None, predict=None, spikes=None, df=None, news=None)


def get_prediction(ref: Optional[str] = None, top_n: int = 5) -> dict:
    key = _key(ref, top_n)
    if _cache["key"] == key and _cache["predict"] is not None:
        return _cache["predict"]

    df = _load_df()
    if df.empty:
        result = {"ref_date": "", "model_used": "none", "top_n": top_n,
                  "news_available": False, "zones": []}
        _cache.update(key=key, predict=result, spikes=[], df=df, news=None)
        return result

    ref_date = date.fromisoformat(ref) if ref else df["_ts_local"].dt.date.max()
    cells = sorted(df["h3_r8"].unique().tolist())

    # --- augmentation (Ring 3): news correlation, gracefully degradable ---
    from app.news import correlate

    try:
        news = correlate.compute_news_uplift(cells, ref_date)
    except Exception:  # belt-and-braces: never let augmentation break the core
        news = {"available": False, "gdelt_ok": False, "uplift": {},
                "items": [], "by_hex": {}}

    result = predictor.predict(
        df, ref_date, top_n=top_n,
        news_uplift=news["uplift"], news_by_hex=news["by_hex"],
        news_available=news["available"],
    )
    sp = spikes.detect_spikes(df, ref_date)
    name_by_hex = {z["h3_r8"]: z["name"] for z in result["zones"]}
    for s in sp:
        s["name"] = name_by_hex.get(s["h3_r8"])

    # grounded per-zone rationale for EVERY zone (FR-10). Deterministic fallback
    # text is instant, so all hexes get a description, not just the top-5.
    from app.llm import fallback

    for z in result["zones"]:
        z["rationale"] = fallback.render_rationale(z)

    _cache.update(key=key, predict=result, spikes=sp, df=df, news=news)
    return result


def get_spikes(ref: Optional[str] = None, top_n: int = 5) -> list[dict]:
    get_prediction(ref, top_n)          # ensures cache populated
    return _cache["spikes"] or []


def get_zone_prediction(h3: str, ref: Optional[str] = None) -> Optional[dict]:
    pred = get_prediction(ref)
    for z in pred["zones"]:
        if z["h3_r8"] == h3:
            return z
    return None


def get_news(ref: Optional[str] = None, top_n: int = 5) -> dict:
    get_prediction(ref, top_n)          # ensures cache populated
    news = _cache["news"]
    if not news:
        return {"available": False, "gdelt_ok": False, "items": []}
    return news


def build_brief(ref: Optional[str] = None, top_n: int = 5,
                include_news: bool = True) -> dict:
    """Assemble the structured signals and generate the SHO brief (FR-11)."""
    import uuid
    from datetime import date, timedelta

    from app.config import PATROL_CONFIG_JSON
    from app.intelligence import redeploy
    from app.llm import bob
    from app.store import db as _db

    pred = get_prediction(ref, top_n)
    if not pred["zones"]:
        raise ValueError("No data — generate incidents first.")

    df = cached_df()
    ranked = [z for z in pred["zones"] if z.get("rank") is not None]
    spike_list = _cache["spikes"] or []
    news = _cache["news"] or {"available": False, "items": []}
    ref_date = date.fromisoformat(pred["ref_date"])
    redeployment = redeploy.compute_redeployment(pred["zones"], df, ref_date)

    import json
    try:
        district = json.loads(
            PATROL_CONFIG_JSON.read_text(encoding="utf-8")).get("station", "District")
    except Exception:
        district = "District"

    payload = {
        "district": district,
        "window": {
            "start": (ref_date + timedelta(days=1)).isoformat(),
            "end": (ref_date + timedelta(days=7)).isoformat(),
        },
        "generated_at": _now_minutes(),
        "zones": [_brief_zone(z) for z in ranked],
        "spikes": spike_list,
        "redeployment": redeployment,
        "news": news["items"][:10] if include_news else [],
        "augmentation_available": bool(include_news and news.get("available")),
    }

    markdown, source = bob.generate_brief(payload)
    brief_id = str(uuid.uuid4())
    _db.save_brief(brief_id, pred["ref_date"], markdown, payload)

    return {
        "brief_id": brief_id,
        "ref_date": pred["ref_date"],
        "markdown": markdown,
        "source": source,
        "structured": payload,
    }


def _brief_zone(z: dict) -> dict:
    return {
        "name": z.get("name"),
        "h3_r8": z["h3_r8"],
        "rank": z.get("rank"),
        "probability": z["probability"],
        "expected_count": z["expected_count"],
        "drivers": z["drivers"],
        "rationale": z.get("rationale"),
        "news_events": z.get("news_events", []),
    }


def _now_minutes() -> str:
    from datetime import datetime
    return datetime.now().isoformat(timespec="minutes")


def cached_df() -> pd.DataFrame:
    if _cache["df"] is None:
        return _load_df()
    return _cache["df"]
