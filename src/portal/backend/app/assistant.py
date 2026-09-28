"""Records assistant: answers questions about people, offences and FIRs.

Every answer is computed from the records the asking officer is allowed to see, and
each row points at the record it came from. Nothing is generated freely, so an answer
can be wrong only if the records are. A language model (IBM Bob) can later take over
understanding the question; the look-ups below stay the source of facts.
"""
import re
from datetime import date, timedelta

from rapidfuzz import fuzz

from .extract import CRIME_TYPES, MO_TAGS

ENGINE = "records-rules"
MAX_ROWS = 6

SYNONYMS = {
    "Cyber Fraud": ["cyber", "online fraud", "otp fraud", "phishing"],
    "Cheating": ["cheating", "fraud", "cheated"],
    "Theft": ["theft", "thefts", "stolen", "stealing"],
    "Vehicle Theft": ["vehicle theft", "bike theft", "motorcycle theft", "scooter theft", "two-wheeler"],
    "Burglary": ["burglary", "burglaries", "house-breaking", "house breaking", "break-in"],
    "Snatching": ["snatching", "chain snatching", "snatched"],
    "Robbery": ["robbery", "robberies", "loot"],
    "Narcotics": ["narcotic", "narcotics", "drug", "drugs", "ndps", "heroin"],
    "Assault": ["assault", "assaults", "attack"],
    "Kidnapping": ["kidnap", "kidnapping", "abduction"],
    "Extortion": ["extortion"],
    "Forgery": ["forgery", "forged"],
    "Prohibition Offence": ["liquor", "prohibition", "bootlegging", "alcohol"],
    "Land Grabbing": ["land grabbing", "land grab"],
    "Rioting": ["riot", "rioting"],
    "Road Accident": ["accident", "hit and run"],
    "Dowry Harassment": ["dowry"],
    "Crime Against Women": ["crime against women", "molestation"],
    "Organised Crime": ["organised crime", "organized crime"],
    "Illegal Money Lending": ["money lending", "moneylender", "usury"],
    "Immigration Fraud": ["immigration", "visa fraud", "emigration"],
    "Arms Offence": ["arms", "illegal weapon"],
}
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
STEP_LABEL = {"escalated": "escalated to district", "linkage_approved": "linkage approved", "task_force_approved": "task force alert approved"}

SUGGESTIONS = ["Which gangs are waiting for my decision?", "Who is Vikram Solanki?", "Co-accused of Vikram Solanki", "How many vehicle thefts in Ahmedabad City?", "Cases with car glass break"]


def _fmt(iso: str) -> str:
    d = date.fromisoformat(iso[:10])
    return f"{d.day} {MONTHS[d.month - 1][:3].title()} {d.year}"


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def _has(q: str, phrase: str) -> bool:
    # plural forms count: "vehicle thefts", "burglaries" is covered by its own synonym
    return re.search(rf"(?<![a-z]){re.escape(phrase.lower())}(?:s|es)?(?![a-z])", q) is not None


class Context:
    def __init__(self, firs, references, persons, networks, steps, notes, as_of):
        self.firs = firs
        self.references = references
        self.everything = {f["fir_reg_no"]: f for f in [*firs, *references]}
        self.open = {f["fir_reg_no"] for f in firs}
        self.persons = persons
        self.person_by_id = {p["id"]: p for p in persons}
        self.networks = networks
        self.steps = steps
        self.notes = notes
        self.as_of = as_of

    def fir_row(self, reg_no: str, detail: str = "") -> dict:
        f = self.everything[reg_no]
        base = f"{', '.join(c['value'] for c in f['extraction']['crime_types']) or 'Unclassified'}, {_fmt(f['occurrence']['date'])}"
        outside = "" if reg_no in self.open else " (outside your jurisdiction, reference only)"
        return {"label": f"FIR {f['fir_id']}, {f['police_station']} PS, {f['district']}", "detail": (detail or base) + outside, "to": f"/fir/case/{reg_no}" if reg_no in self.open else None}

    def person_row(self, p: dict, detail: str = "") -> dict:
        return {"label": p["name"], "detail": detail or f"{_plural(len(p['firs']), 'FIR')} in {', '.join(p['districts'])}", "to": f"/fir/person/{p['id']}"}

    def network_of(self, reg_no: str):
        return next((n for n in self.networks if reg_no in n["firs"]), None)


def _reply(answer: str, rows=None, suggestions=None) -> dict:
    return {"answer": answer, "rows": rows or [], "suggestions": suggestions or [], "engine": ENGINE}


# ---------- finding what the question is about ----------


def _find_persons(q: str, ctx: Context) -> list[dict]:
    words = re.findall(r"[a-z]+", q)
    scored = []
    for p in ctx.persons:
        best = 0.0
        for name in {p["name"], *[m["name"] for m in p["mentions"]], *p["aliases"]}:
            tokens = [t for t in re.findall(r"[a-z]+", name.lower()) if len(t) >= 3]
            if not tokens:
                continue
            hit = [t for t in tokens if any(fuzz.ratio(t, w) >= 84 for w in words)]
            # a full name must match in full; a single-word name or alias may match alone
            if len(hit) == len(tokens):
                best = max(best, 1.0 + len(tokens) / 10)
            elif len(tokens) > 1 and len(hit) / len(tokens) >= 0.5:
                best = max(best, len(hit) / len(tokens) * 0.9)
        if best:
            scored.append((best, p))
    if not scored:
        return []
    top = max(s for s, _ in scored)
    return [p for s, p in sorted(scored, key=lambda x: (-x[0], -len(x[1]["firs"]))) if s >= top - 0.001]


def _find_types(q: str) -> list[str]:
    found = [t for t in CRIME_TYPES if _has(q, t)]
    for kind, words in SYNONYMS.items():
        if kind not in found and any(_has(q, w) for w in words):
            found.append(kind)
    # "vehicle theft" should not also count as plain theft, nor "cyber fraud" as cheating
    if "Vehicle Theft" in found and "Theft" in found and not re.search(r"(?<!vehicle )(?<!bike )(?<!motorcycle )(?<!scooter )\bthefts?\b", q):
        found.remove("Theft")
    if "Cyber Fraud" in found and "Cheating" in found and not _has(q, "cheating"):
        found.remove("Cheating")
    return found


def _find_places(q: str, ctx: Context) -> tuple[list[str], list[str]]:
    stations = sorted({f["police_station"] for f in ctx.firs}, key=len, reverse=True)
    districts = sorted({f["district"] for f in ctx.firs}, key=len, reverse=True)
    found_s = [s for s in stations if _has(q, s)]
    found_d = [d for d in districts if _has(q, d) or (d.endswith(" City") and _has(q, d[:-5]))]
    # "Rajkot" alone means the district, not "Rajkot A Division" station
    return found_s, found_d


def _find_tags(q: str) -> list[str]:
    return [t for t in MO_TAGS if _has(q, t.replace("_", " "))]


def _find_period(q: str, as_of: str):
    end = date.fromisoformat(as_of)
    m = re.search(r"(?:last|past)\s+(\d+)\s+(day|week|month)s?", q)
    if m:
        n = int(m.group(1)) * {"day": 1, "week": 7, "month": 30}[m.group(2)]
        return end - timedelta(days=n), end, f"in the last {m.group(1)} {m.group(2)}{'s' if m.group(1) != '1' else ''}"
    for i, name in enumerate(MONTHS):
        if _has(q, name) or (name != "may" and _has(q, name[:3])):
            y = re.search(r"\b(20\d\d)\b", q)
            year = int(y.group(1)) if y else (end.year if i + 1 <= end.month else end.year - 1)
            start = date(year, i + 1, 1)
            stop = date(year + (i == 11), (i + 1) % 12 + 1, 1) - timedelta(days=1)
            return start, stop, f"in {name.title()} {year}"
    y = re.search(r"\b(20\d\d)\b", q)
    if y and not re.search(r"\d{3,4}\s*/\s*20\d\d", q):
        return date(int(y.group(1)), 1, 1), date(int(y.group(1)), 12, 31), f"in {y.group(1)}"
    return None


# ---------- answers ----------


def _answer_fir(found: list[dict], ctx: Context) -> dict:
    rows = []
    for f in found[:MAX_ROWS]:
        reg = f["fir_reg_no"]
        if reg not in ctx.open:
            rows.append(ctx.fir_row(reg))
            continue
        people = [p for p in ctx.persons if reg in p["firs"]]
        gang = ctx.network_of(reg)
        rows.append(ctx.fir_row(reg, f"{', '.join(c['value'] for c in f['extraction']['crime_types'])}. Occurred {_fmt(f['occurrence']['date'])} at {f['occurrence']['place']}. Status: {f['status'] or 'not recorded'}."))
        for p in people:
            rows.append(ctx.person_row(p, f"Accused in this FIR. {_plural(len(p['firs']), 'FIR')} on record."))
        if not people:
            rows.append({"label": "Accused", "detail": "Not identified", "to": None})
        if gang:
            rows.append({"label": f"Gang: {gang['label']}", "detail": f"Linked to {_plural(len(gang['firs']) - 1, 'other FIR')} in {', '.join(gang['districts'])}", "to": "/fir/networks"})
        notes = ctx.notes.get(reg, [])
        if notes:
            rows.append({"label": f"Latest note, {notes[0]['by']}", "detail": notes[0]["text"], "to": f"/fir/case/{reg}"})
    fir_id = found[0]["fir_id"]
    stations = list(dict.fromkeys(f["police_station"] for f in found))
    if len(stations) > 1:
        return _reply(f"FIR number {fir_id} exists at {len(stations)} stations: {', '.join(stations)}.", rows)
    return _reply(f"FIR {fir_id} was registered at {found[0]['police_station']} PS, {found[0]['district']}, on {_fmt(found[0]['date_of_fir'])}.", rows)


CO_ACCUSED = r"co-?accused|associate|accomplice|partner|together|along with|with whom|works? with"


def _where(p: dict) -> str:
    return f"{_plural(len(p['firs']), 'FIR')} in {', '.join(p['districts'])}"


def _answer_person(q: str, people: list[dict], ctx: Context) -> dict:
    if len(people) > 1 and re.search(CO_ACCUSED, q):
        # the name belongs to more than one person: answer for each, never merge them
        rows = []
        for p in people[:MAX_ROWS]:
            if not p["coAccused"]:
                rows.append(ctx.person_row(p, f"{_where(p)}. No co-accused on record."))
            for c in p["coAccused"]:
                shared = "; ".join(f"FIR {ctx.everything[r]['fir_id']} {ctx.everything[r]['police_station']} PS" for r in c["firs"])
                rows.append(ctx.person_row(ctx.person_by_id[c["id"]], f"Co-accused of {p['name']} ({_where(p)}). Named together in {_plural(len(c['firs']), 'FIR')}: {shared}"))
        with_any = sum(1 for p in people if p["coAccused"])
        return _reply(f"{len(people)} different people on record are named {people[0]['name']}. {with_any} of them {'has' if with_any == 1 else 'have'} co-accused.", rows[:MAX_ROWS])

    if len(people) > 1:
        rows = [ctx.person_row(p, f"{_plural(len(p['firs']), 'FIR')} in {', '.join(p['districts'])}. {', '.join(p['crimeTypes'][:2])}.") for p in people[:MAX_ROWS]]
        return _reply(f"{len(people)} different people on record match that name. They are separate profiles because their FIRs are not linked.", rows)

    p = people[0]
    name = p["name"]
    if re.search(CO_ACCUSED, q):
        if not p["coAccused"]:
            return _reply(f"{name} has no co-accused on record. Every FIR names {name} alone or with unidentified persons.", [ctx.person_row(p)])
        rows = [ctx.person_row(ctx.person_by_id[c["id"]], f"Named together in {_plural(len(c['firs']), 'FIR')}: " + "; ".join(f"FIR {ctx.everything[r]['fir_id']} {ctx.everything[r]['police_station']} PS" for r in c["firs"])) for c in p["coAccused"][:MAX_ROWS]]
        return _reply(f"{name} has {_plural(len(p['coAccused']), 'co-accused')} on record, each named in the same FIR as {name}.", rows)

    if re.search(r"\bwhere\b|district|location|area|operat", q):
        rows = [ctx.fir_row(r) for r in p["firs"][:MAX_ROWS]]
        return _reply(f"{name} is named in FIRs in {_plural(len(p['districts']), 'district')}: {', '.join(p['districts'])} ({', '.join(p['states'])}).", rows)

    if re.search(r"\bmethod\b|modus|\bmo\b|\bhow\b(?! many)", q):
        tags = ", ".join(t.replace("_", " ") for t in p["moTags"][:8]) or "no method tags found"
        return _reply(f"Method across {name}'s {_plural(len(p['firs']), 'FIR')}: {tags}.", [ctx.person_row(p)])

    if re.search(r"\bwhy\b|same person|justif|linked|proof|evidence", q) and p["identityLinks"]:
        rows = [{"label": f"\"{x['a']['name']}\" and \"{x['b']['name']}\"", "detail": f"Name match {round(x['similarity'] * 100)}% ({x['method']}). FIR pair score {x['score']:.2f}.", "to": f"/fir/person/{p['id']}"} for x in p["identityLinks"][:MAX_ROWS]]
        return _reply(f"{name}'s {_plural(len(p['firs']), 'FIR')} are treated as one person because the names match and the FIRs are linked by method and timing.", rows)

    rows = [ctx.person_row(p, f"Open profile. Also written as: {', '.join(p['variants'])}." if len(p["variants"]) > 1 else "Open profile.")]
    rows += [ctx.fir_row(r) for r in p["firs"][: MAX_ROWS - 1]]
    gang = next((n for n in ctx.networks if set(n["firs"]) & set(p["firs"])), None)
    parts = [f"{name} is accused in {_plural(len(p['firs']), 'FIR')} across {_plural(len(p['districts']), 'district')} ({', '.join(p['districts'])}), from {_fmt(p['firstSeen'])} to {_fmt(p['lastSeen'])}."]
    parts.append(f"Offences: {', '.join(p['crimeTypes'])}.")
    if p["aliases"]:
        parts.append(f"Alias: {', '.join(p['aliases'])}.")
    if p["coAccused"]:
        parts.append(f"Co-accused: {', '.join(c['name'] for c in p['coAccused'])}.")
    if gang:
        parts.append("Part of a flagged repeat-offender network.")
    if p["sameNameNotLinked"]:
        parts.append(f"{_plural(len(p['sameNameNotLinked']), 'other person')} with the same name is on record and is not linked.")
    return _reply(" ".join(parts), rows)


def _answer_gangs(q: str, ctx: Context) -> dict:
    waiting_only = bool(re.search(r"waiting|pending|decision|approve|approval|not approved", q))
    rows = []
    for n in ctx.networks:
        done = [s["action"] for s in ctx.steps.get(f"net:{n['firs'][0]}", [])]
        if waiting_only and "task_force_approved" in done:
            continue
        status = STEP_LABEL[done[-1]] if done and done[-1] in STEP_LABEL else "no decision taken yet"
        rows.append({"label": n["label"], "detail": f"{_plural(len(n['firs']), 'FIR')} in {', '.join(n['districts'])}. {', '.join(n['crimeTypes'][:2])}. Last offence {_fmt(n['lastSeen'])}. Status: {status}.", "to": "/fir/networks"})
    if waiting_only:
        return _reply(f"{_plural(len(rows), 'gang')} {'is' if len(rows) == 1 else 'are'} waiting for a task force decision." if rows else "No gang is waiting for a decision. Every detected gang has an approved task force alert.", rows[:MAX_ROWS])
    return _reply(f"{_plural(len(rows), 'gang')} detected in your jurisdiction." if rows else "No gangs detected in your jurisdiction.", rows[:MAX_ROWS])


def _answer_filter(q: str, ctx: Context, types, stations, districts, tags, period) -> dict:
    firs = ctx.firs
    said = []
    if types:
        firs = [f for f in firs if any(c["value"] in types for c in f["extraction"]["crime_types"])]
        said.append(" or ".join(t.lower() for t in types))
    if tags:
        firs = [f for f in firs if all(t in [x["value"] for x in f["extraction"]["mo_tags"]] for t in tags)]
        said.append("method " + ", ".join(t.replace("_", " ") for t in tags))
    if stations:
        firs = [f for f in firs if f["police_station"] in stations]
        said.append(f"at {', '.join(stations)} PS")
    elif districts:
        firs = [f for f in firs if f["district"] in districts]
        said.append(f"in {', '.join(districts)}")
    if period:
        firs = [f for f in firs if period[0] <= date.fromisoformat(f["occurrence"]["date"]) <= period[1]]
        said.append(period[2])
    firs = sorted(firs, key=lambda f: f["occurrence"]["date"], reverse=True)
    what = ", ".join(said)
    if not firs:
        return _reply(f"No FIRs on record for: {what}.")
    more = f" Showing the latest {MAX_ROWS}." if len(firs) > MAX_ROWS else ""
    by_district = {}
    for f in firs:
        by_district[f["district"]] = by_district.get(f["district"], 0) + 1
    spread = ""
    if len(by_district) > 1:
        spread = " By district: " + ", ".join(f"{d} {n}" for d, n in sorted(by_district.items(), key=lambda x: -x[1])) + "."
    return _reply(f"{_plural(len(firs), 'FIR')} on record for: {what}.{spread}{more}", [ctx.fir_row(f["fir_reg_no"]) for f in firs[:MAX_ROWS]])


def _answer_notes(ctx: Context) -> dict:
    flat = sorted(((n["at"], reg, n) for reg, ns in ctx.notes.items() for n in ns), reverse=True)
    if not flat:
        return _reply("No case notes have been added yet.")
    rows = [{"label": f"{n['by']} on FIR {ctx.everything[reg]['fir_id']}, {ctx.everything[reg]['police_station']} PS", "detail": n["text"], "to": f"/fir/case/{reg}"} for _, reg, n in flat[:MAX_ROWS] if reg in ctx.everything]
    return _reply(f"{_plural(len(flat), 'case note')} on record. Latest first.", rows)


def answer(question: str, ctx: Context) -> dict:
    q = " ".join(question.lower().split())
    if not q:
        return _reply("Ask about a person, an offence or a FIR.", suggestions=SUGGESTIONS)

    m = re.search(r"\b(\d{3,4})\s*/\s*(20\d\d)\b", q)
    if m:
        fir_id = f"{int(m.group(1)):04d}/{m.group(2)}"
        found = [f for f in ctx.everything.values() if f["fir_id"] == fir_id]
        found.sort(key=lambda f: f["fir_reg_no"] not in ctx.open)
        if found:
            return _answer_fir(found, ctx)
        return _reply(f"No FIR numbered {fir_id} is on record in your jurisdiction.")

    people = _find_persons(q, ctx)
    if people:
        return _answer_person(q, people, ctx)

    if re.search(r"\bgangs?\b|network|repeat.offender|task force", q):
        return _answer_gangs(q, ctx)

    types, (stations, districts), tags, period = _find_types(q), _find_places(q, ctx), _find_tags(q), _find_period(q, ctx.as_of)
    if types or stations or districts or tags:
        return _answer_filter(q, ctx, types, stations, districts, tags, period)

    if re.search(r"\bnotes?\b|remarks?|observations?", q):
        return _answer_notes(ctx)

    if period or re.search(r"how many|total|count|number of", q):
        return _answer_filter(q, ctx, [], [], [], [], period) if period else _reply(f"{_plural(len(ctx.firs), 'FIR')} on record in your jurisdiction up to {_fmt(ctx.as_of)}, with {_plural(len(ctx.persons), 'identified accused')} and {_plural(len(ctx.networks), 'gang')}.")

    if re.search(r"who is|profile|accused|against", q):
        return _reply("No accused by that name is on record in your jurisdiction. Check the spelling, or try the surname with the first name.", suggestions=SUGGESTIONS[1:3])

    return _reply("I can answer from the records about a person, an offence type, a place, a method, a FIR number, gangs and case notes. I could not tell which of these you are asking about.", suggestions=SUGGESTIONS)
