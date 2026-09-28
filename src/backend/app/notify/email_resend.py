"""Email alerts via Resend (https://resend.com).

A thin relay: the caller supplies the recipient, subject and HTML; we POST to
Resend's API with the server-side key. If RESEND_API_KEY is not set yet the
function returns a clear ``not configured`` result instead of raising, so the
feature is fully wired and starts working the moment the key is added.
"""
from __future__ import annotations

import logging

import httpx

from app.config import get_settings

log = logging.getLogger("bob.email")

RESEND_URL = "https://api.resend.com/emails"


def send_email(to: str, subject: str, html: str,
               text: str | None = None, timeout: float = 12.0) -> dict:
    """Return {ok, configured, id?, error?}. Never raises."""
    settings = get_settings()
    if not settings.resend_api_key:
        return {"ok": False, "configured": False,
                "error": "Email is not configured yet (set RESEND_API_KEY)."}

    payload: dict = {
        "from": settings.resend_from,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text

    try:
        r = httpx.post(
            RESEND_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(timeout, connect=5.0),
        )
    except Exception as e:
        log.warning("Resend request failed: %s", e)
        return {"ok": False, "configured": True,
                "error": f"Could not reach the email service ({type(e).__name__})."}

    if r.status_code in (200, 201, 202):
        data = r.json() if r.content else {}
        return {"ok": True, "configured": True, "id": data.get("id")}

    # surface Resend's error message (e.g. unverified domain, bad key)
    detail = ""
    try:
        detail = r.json().get("message") or r.text[:200]
    except Exception:
        detail = r.text[:200]
    log.warning("Resend error %s: %s", r.status_code, detail)
    return {"ok": False, "configured": True,
            "error": detail or f"Email service returned {r.status_code}."}
