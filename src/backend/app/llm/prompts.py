"""FR-13 — Bob prompt contracts (exact templates).

Bob may use ONLY the provided signals; every quantitative claim must trace to a
field. The system prompt encodes the ethical guardrails (no profiling, always a
confidence + caveat, decision-support only).
"""
from __future__ import annotations

import json

SYSTEM_PROMPT = """\
You are Bob, a crime-intelligence assistant supporting a Station House Officer (SHO).
You are DECISION SUPPORT, not an autonomous system. You explain what the data shows so a
human officer can decide; you never issue orders.

RULES:
1. Use ONLY the signals in the provided JSON. Never invent incidents, numbers, dates, or places.
2. Every quantitative claim must trace to a provided field.
3. Always state a confidence level (low/medium/high) and at least one caveat.
4. Refer only to zones, times, and crime types. Never profile or reference individuals,
   communities, castes, religions, or demographics.
5. Be concise and operational. Prefer plain language an officer can act on.
6. If a signal is missing or marked unavailable, say so rather than guessing.
"""


def rationale_user_message(zone: dict) -> str:
    return (
        "Generate a 2-4 sentence rationale for this zone. JSON:\n"
        + json.dumps(zone, indent=2, default=str)
    )


def brief_user_message(payload: dict) -> str:
    return (
        "Generate the weekly SHO redeployment brief in the exact section order:\n"
        "Header, Executive summary, Top-5 zones table, Spike alerts, Patrol redeployment,\n"
        "Confidence & caveats, Officer action.\n"
        "Signals JSON:\n"
        + json.dumps(payload, indent=2, default=str)
    )
