"""Roles and jurisdiction, read from shared/roles.json (the same file the UI uses)."""
import json

from . import settings

ROLES = {r["id"]: r for r in json.loads((settings.SHARED_DIR / "roles.json").read_text(encoding="utf-8"))}
DEFAULT_ROLE = "sho"


def can(role: dict, permission: str) -> bool:
    return permission in role["can"]


def in_scope(role: dict, fir: dict) -> bool:
    scope = role["scope"]
    kind = scope["kind"]
    if kind == "assigned":
        return fir["police_station"] == scope["station"] and fir["investigating_officer"]["name"] == scope["officer"]
    if kind == "station":
        return fir["police_station"] == scope["station"]
    if kind == "circle":
        return fir["police_station"] in scope["stations"]
    if kind == "district":
        return fir["district"] == scope["district"]
    if kind == "state":
        return fir["state"] == scope["state"]
    return False


def can_open(role: dict, fir: dict) -> bool:
    return can(role, "firDetails") and in_scope(role, fir)


def redact(fir: dict) -> dict:
    """Reference-only view of a FIR outside the viewer's jurisdiction.

    Keeps what an officer needs to act on a link (station, date, offence, method tags,
    accused names, approximate location) and drops the narrative, complainant, victim,
    addresses and the exact place.
    """
    return {
        "fir_id": fir["fir_id"],
        "fir_reg_no": fir["fir_reg_no"],
        "state": fir["state"],
        "district": fir["district"],
        "police_station": fir["police_station"],
        "date_of_fir": fir["date_of_fir"],
        "occurrence": {"date": fir["occurrence"]["date"], "time_period": "", "place": ""},
        "acts_sections": [],
        "complainant": {"name": "", "phone_masked": ""},
        "accused": [{"name": a["name"], "relative_name": "", "address": ""} for a in fir["accused"]],
        "victim_profile": {"gender": "", "age_range": "", "relation_to_accused": ""},
        "narrative": "",
        "language": fir["language"],
        "mo_summary": "",
        "investigating_officer": {"name": "", "rank": ""},
        "status": "",
        # rounded to about 10 km: enough to draw the link on a map, not to locate the incident
        "lat": round(fir["lat"], 1),
        "lng": round(fir["lng"], 1),
        "redacted": True,
        "extraction": {
            "engine": fir["extraction"]["engine"],
            "crime_types": [{"value": c["value"], "because": ""} for c in fir["extraction"]["crime_types"]],
            "mo_tags": [{"value": t["value"], "because": ""} for t in fir["extraction"]["mo_tags"]],
            "accused": fir["extraction"]["accused"],
        },
    }
