"""IBM watsonx.ai Granite extractor.

Used only when WATSONX_API_KEY and WATSONX_PROJECT_ID are set. Granite classifies the
offence, tags the method and writes the English MO summary; accused names still come
from the FIR form fields. Any failure falls back to the local rule engine, so a rate
limit or network fault during a demo never blocks ingestion.
"""
import json
import logging
import time

import httpx

from . import settings
from .extract import CRIME_TYPES, MO_TAGS, accused_with_aliases, extract_local

log = logging.getLogger("netra.granite")

IAM_URL = "https://iam.cloud.ibm.com/identity/token"
_token = {"value": "", "expires": 0.0}

SYSTEM = f"""You read Indian police First Information Reports (FIRs). The text may be in English, Hindi, Bengali or Gujarati, often mixed.
Return one JSON object and nothing else, with these keys:
- "crime_types": list of objects {{"value", "because"}}. "value" must be one of: {", ".join(CRIME_TYPES)}. An FIR usually has more than one. "because" quotes the section or phrase that justifies it.
- "mo_tags": list of objects {{"value", "because"}}. "value" must be one of: {", ".join(MO_TAGS)}. "because" quotes the phrase from the FIR.
- "mo_summary": one or two English sentences describing how the offence was carried out, without names.
Use only the allowed values. Do not infer religion, caste or community. If unsure, leave the item out."""

FEW_SHOT = [
    (
        {
            "acts_sections": ["BNS 318(4) - Cheating", "IT Act 66D - Cheating by personation using computer resource"],
            "narrative": "दिनांक 02.05.2026 को वादी के मोबाइल पर फोन कॉल आया। कॉल करने वाले ने खुद को बैंक KYC अधिकारी बताया और कहा कि खाता बंद हो जाएगा। वादी से AnyDesk ऐप डाउनलोड करवाया और OTP लेकर 95,000 रुपये निकाल लिए।",
        },
        {
            "crime_types": [
                {"value": "Cheating", "because": "Section BNS 318(4) - Cheating"},
                {"value": "Cyber Fraud", "because": "Section IT Act 66D"},
            ],
            "mo_tags": [
                {"value": "phone_call", "because": "फोन कॉल आया"},
                {"value": "fake_kyc", "because": "बैंक KYC अधिकारी बताया"},
                {"value": "impersonation", "because": "खुद को बैंक KYC अधिकारी बताया"},
                {"value": "account_block_threat", "because": "खाता बंद हो जाएगा"},
                {"value": "remote_access_app", "because": "AnyDesk ऐप डाउनलोड करवाया"},
                {"value": "otp_theft", "because": "OTP लेकर"},
            ],
            "mo_summary": "Caller posed as a bank KYC officer, threatened account closure, made the victim install AnyDesk and took the OTP to withdraw money.",
        },
    ),
    (
        {
            "acts_sections": ["BNS 331(4) - House-breaking by night", "BNS 305 - Theft in a dwelling house"],
            "narrative": "Complainant and family had gone to a wedding. On return they found the window grill cut and the almirah broken. Gold ornaments and cash were stolen. A neighbour heard a motorcycle at about 1 am.",
        },
        {
            "crime_types": [
                {"value": "Burglary", "because": "Section BNS 331(4) - House-breaking by night"},
                {"value": "Theft", "because": "Section BNS 305 - Theft in a dwelling house"},
            ],
            "mo_tags": [
                {"value": "owners_away", "because": "had gone to a wedding"},
                {"value": "grill_cutting", "because": "window grill cut"},
                {"value": "almirah_broken", "because": "almirah broken"},
                {"value": "gold_jewellery", "because": "Gold ornaments"},
                {"value": "night", "because": "about 1 am"},
                {"value": "motorcycle", "because": "heard a motorcycle"},
            ],
            "mo_summary": "Family away at a wedding; window grill cut at night, almirah broken, gold ornaments and cash stolen; motorcycle heard leaving.",
        },
    ),
]


def _access_token(client: httpx.Client) -> str:
    if _token["value"] and _token["expires"] - 60 > time.time():
        return _token["value"]
    r = client.post(
        IAM_URL,
        data={"grant_type": "urn:ibm:params:oauth:grant-type:apikey", "apikey": settings.WATSONX_API_KEY},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    r.raise_for_status()
    body = r.json()
    _token.update(value=body["access_token"], expires=time.time() + int(body.get("expires_in", 3600)))
    return _token["value"]


def _messages(fir: dict) -> list[dict]:
    messages = [{"role": "system", "content": SYSTEM}]
    for example, answer in FEW_SHOT:
        messages.append({"role": "user", "content": json.dumps(example, ensure_ascii=False)})
        messages.append({"role": "assistant", "content": json.dumps(answer, ensure_ascii=False)})
    messages.append({"role": "user", "content": json.dumps({"acts_sections": fir.get("acts_sections", []), "narrative": fir.get("narrative", "")}, ensure_ascii=False)})
    return messages


def _allowed(items, allowed: list[str]) -> list[dict]:
    out, seen = [], set()
    for item in items if isinstance(items, list) else []:
        if isinstance(item, dict) and item.get("value") in allowed and item["value"] not in seen:
            seen.add(item["value"])
            out.append({"value": item["value"], "because": str(item.get("because", ""))[:240]})
    return out


def extract_granite(fir: dict, client: httpx.Client) -> dict:
    r = client.post(
        f"{settings.WATSONX_URL}/ml/v1/text/chat",
        params={"version": settings.WATSONX_API_VERSION},
        headers={"Authorization": f"Bearer {_access_token(client)}"},
        json={
            "model_id": settings.WATSONX_MODEL_ID,
            "project_id": settings.WATSONX_PROJECT_ID,
            "messages": _messages(fir),
            "max_tokens": 900,
            "temperature": 0,
        },
    )
    r.raise_for_status()
    content = r.json()["choices"][0]["message"]["content"]
    data = json.loads(content[content.index("{"): content.rindex("}") + 1])
    crime = _allowed(data.get("crime_types"), CRIME_TYPES)
    if not crime:
        raise ValueError("Granite returned no usable offence types")
    return {
        "engine": "watsonx-granite",
        "crime_types": crime,
        "mo_tags": _allowed(data.get("mo_tags"), MO_TAGS),
        "accused": accused_with_aliases(fir),
        "mo_summary": str(data.get("mo_summary", "")).strip(),
    }


def extract(fir: dict, client: httpx.Client | None = None) -> dict:
    """Granite when configured, local rules otherwise or on any failure."""
    if not settings.granite_configured():
        return extract_local(fir)
    own = client is None
    client = client or httpx.Client(timeout=30)
    try:
        return extract_granite(fir, client)
    except Exception as e:  # noqa: BLE001 - any Granite fault must degrade, not fail ingestion
        log.warning("Granite extraction failed for FIR %s, using local rules: %s", fir.get("fir_reg_no"), e)
        result = extract_local(fir)
        result["fallback_reason"] = type(e).__name__
        return result
    finally:
        if own:
            client.close()
