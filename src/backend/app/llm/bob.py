"""FR-10 / FR-11 — Bob (the LLM layer).

Generates the grounded per-zone rationale and the SHO redeployment brief. Uses
the Claude API when ANTHROPIC_API_KEY is set; otherwise (or on any API error)
falls back to the deterministic renderer (llm/fallback.py) so a complete,
correct brief is always produced (CR-6).
"""
from __future__ import annotations

import logging

from app.config import get_settings
from app.llm import fallback, prompts

log = logging.getLogger("bob.llm")

_MODEL = "claude-sonnet-5"
_MAX_TOKENS = 1600


def _client():
    settings = get_settings()
    if not settings.llm_available:
        return None
    try:
        import anthropic
        return anthropic.Anthropic(api_key=settings.anthropic_api_key)
    except Exception as e:  # SDK missing / bad key
        log.warning("Anthropic client unavailable: %s", e)
        return None


def _complete(user_message: str) -> str | None:
    client = _client()
    if client is None:
        return None
    try:
        resp = client.messages.create(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            system=prompts.SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        return "".join(
            block.text for block in resp.content if getattr(block, "type", None) == "text"
        ).strip()
    except Exception as e:
        log.warning("Claude call failed, using fallback: %s", e)
        return None


def generate_rationale(zone: dict) -> tuple[str, str]:
    """Return (rationale_text, source) where source is 'claude' or 'fallback'."""
    text = _complete(prompts.rationale_user_message(zone))
    if text:
        return text, "claude"
    return fallback.render_rationale(zone), "fallback"


def generate_brief(payload: dict) -> tuple[str, str]:
    """Return (markdown, source) where source is 'claude' or 'fallback'."""
    text = _complete(prompts.brief_user_message(payload))
    if text:
        return text, "claude"
    return fallback.render_brief(payload), "fallback"
