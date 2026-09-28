"""AI alerts — Groq is always mocked (no network)."""
from __future__ import annotations

import json

from app.llm import zone_alerts, zone_chat

ZONES = [
    {"h3": "aaa", "zone_name": "A", "rank": 1, "last_4_weeks": 9, "prior_4_weeks": 4,
     "peak_window": {"from": "18:00", "to": "22:00"},
     "top_crime_types": [{"type": "theft", "incidents": 12, "share_pct": 30}]},
    {"h3": "bbb", "zone_name": "B", "rank": 2, "last_4_weeks": 3, "prior_4_weeks": 3,
     "peak_window": None, "top_crime_types": []},
]


def _reply(monkeypatch, content):
    monkeypatch.setattr(
        zone_alerts.zone_chat, "_post",
        lambda payload: {"choices": [{"message": {"content": content}}]})


def test_uses_model_wording_and_drops_unknown_zones(monkeypatch):
    _reply(monkeypatch, json.dumps({"alerts": [
        {"h3": "aaa", "severity": "critical", "title": "Evening theft rising.",
         "detail": "Theft is up from 4 to 9."},
        {"h3": "zzz", "severity": "critical", "title": "Invented", "detail": "Nope"},
        {"h3": "bbb", "severity": "apocalyptic", "title": "Steady", "detail": "Flat."},
    ]}))
    out, source = zone_alerts.generate(ZONES)
    assert source == "groq"
    assert set(out) == {"aaa", "bbb"}
    assert out["aaa"]["title"] == "Evening theft rising"
    assert out["bbb"]["severity"] == "high"      # unknown severity is normalised


def test_falls_back_when_groq_is_down(monkeypatch):
    def boom(payload):
        raise zone_chat.ChatUnavailable("down")

    monkeypatch.setattr(zone_alerts.zone_chat, "_post", boom)
    out, source = zone_alerts.generate(ZONES)
    assert source == "fallback"
    assert set(out) == {"aaa", "bbb"}
    assert "18:00–22:00" in out["aaa"]["detail"]


def test_garbage_reply_falls_back(monkeypatch):
    _reply(monkeypatch, "sorry, I cannot do that")
    out, source = zone_alerts.generate(ZONES)
    assert source == "fallback" and set(out) == {"aaa", "bbb"}
