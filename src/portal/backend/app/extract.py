"""Local rule engine: offence types, MO tags and accused names from one FIR.

Mirrors src/lib/extract.ts. Both read shared/extraction-rules.json, and every value
carries the section or phrase that produced it.
"""
import json
import re

from . import settings

RULES = json.loads((settings.SHARED_DIR / "extraction-rules.json").read_text(encoding="utf-8"))


def _flags(rule: dict) -> int:
    return re.IGNORECASE if "i" in rule.get("flags", "") else 0


SECTION_RULES = [(re.compile(r["pattern"]), r["type"]) for r in RULES["sections"]]
TEXT_RULES = [(re.compile(r["pattern"], _flags(r)), r["type"]) for r in RULES["text"]]
MO_RULES = [(r["tag"], re.compile(r["pattern"], _flags(r)), r["indic"]) for r in RULES["mo"]]
MO_TAGS = [r["tag"] for r in RULES["mo"]]
CRIME_TYPES = sorted({r["type"] for r in RULES["sections"]} | {r["type"] for r in RULES["text"]})

_MARKERS = "|".join(rf"\b{m}\b" if re.fullmatch(r"[a-z]+", m) else re.escape(m) for m in RULES["aliasMarkers"])
ALIAS_SPLIT = re.compile(rf"\s*(?:{_MARKERS})\s*", re.IGNORECASE)
ALIAS_AFTER_NAME = re.compile(rf"^\s*(?:{_MARKERS})\s+([^\s,.।]+(?:\s[^\s,.।]+)?)", re.IGNORECASE)
UNIDENTIFIED = re.compile(RULES["unidentified"], re.IGNORECASE)
ALIAS_TRAILING = {w.lower() for w in RULES["aliasTrailingWords"]}


def _alias(found: str) -> str:
    words = found.split()
    return " ".join(words[:-1]) if len(words) > 1 and words[-1].lower() in ALIAS_TRAILING else found


def parse_accused(raw: str) -> dict:
    parts = [p.strip() for p in ALIAS_SPLIT.split(raw) if p and p.strip()]
    return {
        "raw": raw,
        "name": parts[0] if parts else raw,
        "aliases": parts[1:],
        "identified": not UNIDENTIFIED.search(raw),
    }


def _snippet(text: str, index: int, length: int) -> str:
    start = max(0, index - 24)
    end = min(len(text), index + length + 24)
    return f"{'…' if start > 0 else ''}{text[start:end].strip()}{'…' if end < len(text) else ''}"


def accused_with_aliases(fir: dict) -> list[dict]:
    """Accused from the form fields, plus aliases written only in the narrative."""
    people = [parse_accused(a["name"]) for a in fir["accused"]]
    narrative = fir.get("narrative", "")
    for person in people:
        if not person["identified"]:
            continue
        at = narrative.find(person["name"])
        if at < 0:
            continue
        tail = narrative[at + len(person["name"]): at + len(person["name"]) + 40]
        m = ALIAS_AFTER_NAME.match(tail)
        if m and _alias(m.group(1)).lower() not in [a.lower() for a in person["aliases"]]:
            person["aliases"].append(_alias(m.group(1)))
    return people


def extract_local(fir: dict) -> dict:
    text = f"{fir.get('narrative', '')}\n{fir.get('mo_summary', '')}"

    crime: dict[str, str] = {}
    for section in fir.get("acts_sections", []):
        for pattern, kind in SECTION_RULES:
            if pattern.search(section):
                crime.setdefault(kind, f"Section {section}")
    for pattern, kind in TEXT_RULES:
        m = pattern.search(text)
        if m:
            crime.setdefault(kind, f'Text: "{_snippet(text, m.start(), len(m.group(0)))}"')

    tags: dict[str, str] = {}
    for tag, pattern, indic in MO_RULES:
        m = pattern.search(text)
        if m:
            tags[tag] = f'Text: "{_snippet(text, m.start(), len(m.group(0)))}"'
            continue
        term = next((t for t in indic if t in text), None)
        if term:
            tags[tag] = f'Text: "{_snippet(text, text.find(term), len(term))}"'
    if fir.get("victim_profile", {}).get("age_range") == "60+":
        tags.setdefault("elderly_victim", "Victim profile: age 60+")

    return {
        "engine": "local-rules",
        "crime_types": [{"value": k, "because": v} for k, v in crime.items()],
        "mo_tags": [{"value": k, "because": v} for k, v in tags.items()],
        "accused": accused_with_aliases(fir),
    }
