"""POST /email/brief — email the weekly brief / an alert via Resend.

The frontend renders the brief HTML (from the plan already on screen) and posts
it here; the server relays it to Resend with the server-side key. Returns a
clear result whether or not the key is configured yet.
"""
from __future__ import annotations

import re

from fastapi import APIRouter

from app.config import get_settings
from app.models.schemas import EmailRequest, EmailResponse
from app.notify import email_resend

router = APIRouter()

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MAX_HTML = 200_000


@router.get("/email/status")
def email_status() -> dict:
    s = get_settings()
    return {"configured": s.email_available, "default_to": s.email_default_to or None}


@router.post("/email/brief", response_model=EmailResponse)
def email_brief(req: EmailRequest) -> EmailResponse:
    to = req.to.strip()
    if not _EMAIL_RE.match(to):
        return EmailResponse(ok=False, configured=get_settings().email_available,
                             error="Enter a valid email address.")
    subject = (req.subject or "Netra — patrol brief").strip()[:180]
    html = req.html[:_MAX_HTML]
    result = email_resend.send_email(to, subject, html, req.text)
    return EmailResponse(**result)
