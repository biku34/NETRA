"""Person profiles: one entry per accused, across every FIR that names them.

Two mentions are treated as the same person only when their FIRs are linked by the
scoring engine and the two names clear the name gate. Every profile keeps those links,
so "why is this one person" always has an answer. Mirrors src/lib/persons.ts.
"""


def _index(fir: dict, raw: str) -> int | None:
    for i, a in enumerate(fir["extraction"]["accused"]):
        if a["identified"] and a["raw"] == raw:
            return i
    return None


def build_persons(firs: list[dict], matches: list[dict], name_gate: float) -> list[dict]:
    by_id = {f["fir_reg_no"]: f for f in firs}
    mentions = [(f["fir_reg_no"], i) for f in firs for i, a in enumerate(f["extraction"]["accused"]) if a["identified"]]
    parent = {m: m for m in mentions}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    links: list[dict] = []
    same_name: list[tuple] = []
    for m in matches:
        a, b = by_id.get(m["a"]), by_id.get(m["b"])
        if a is None or b is None:
            continue
        for n in [m["bestName"], *m["otherNames"]]:
            if n["similarity"] < name_gate:
                continue
            ia, ib = _index(a, n["a"]), _index(b, n["b"])
            if ia is None or ib is None:
                continue
            ka, kb = (m["a"], ia), (m["b"], ib)
            if m["verdict"] == "linked":
                parent[find(ka)] = find(kb)
                links.append({"a": {"fir": m["a"], "name": n["a"]}, "b": {"fir": m["b"], "name": n["b"]}, "similarity": n["similarity"], "method": n["method"], "score": m["score"], "key": (ka, kb)})
            elif m["verdict"] == "name_only":
                same_name.append((ka, kb, m))

    groups: dict[tuple, list[tuple]] = {}
    for k in mentions:
        groups.setdefault(find(k), []).append(k)

    def order(k):
        return (by_id[k[0]]["occurrence"]["date"], k[0], k[1])

    person_of: dict[tuple, str] = {}
    persons: dict[str, dict] = {}
    for members in groups.values():
        members.sort(key=order)
        pid = f"{members[0][0]}-{members[0][1]}"
        accused = [by_id[r]["extraction"]["accused"][i] for r, i in members]
        fir_ids = list(dict.fromkeys(r for r, _ in members))
        member_firs = [by_id[r] for r in fir_ids]
        aliases: list[str] = []
        for a in accused:
            for alias in a["aliases"]:
                if alias.lower() not in [x.lower() for x in aliases]:
                    aliases.append(alias)
        for k in members:
            person_of[k] = pid
        persons[pid] = {
            "id": pid,
            # the spelling used most often is the display name; the longer one wins a tie
            "name": max((a["name"] for a in accused), key=lambda n: ([x["name"] for x in accused].count(n), len(n))),
            "aliases": aliases,
            "variants": list(dict.fromkeys(a["raw"] for a in accused)),
            "mentions": [{"fir": r, "name": by_id[r]["extraction"]["accused"][i]["raw"]} for r, i in members],
            "firs": fir_ids,
            "districts": list(dict.fromkeys(f["district"] for f in member_firs)),
            "states": list(dict.fromkeys(f["state"] for f in member_firs)),
            "crimeTypes": list(dict.fromkeys(c["value"] for f in member_firs for c in f["extraction"]["crime_types"])),
            "moTags": list(dict.fromkeys(t["value"] for f in member_firs for t in f["extraction"]["mo_tags"])),
            "firstSeen": member_firs[0]["occurrence"]["date"],
            "lastSeen": member_firs[-1]["occurrence"]["date"],
            "identityLinks": [],
            "coAccused": [],
            "sameNameNotLinked": [],
        }

    for link in links:
        ka, _ = link.pop("key")
        persons[person_of[ka]]["identityLinks"].append(link)

    # co-accused: named together in the same FIR
    together: dict[tuple[str, str], list[str]] = {}
    for f in firs:
        here = list(dict.fromkeys(person_of[(f["fir_reg_no"], i)] for i, a in enumerate(f["extraction"]["accused"]) if a["identified"]))
        for p in here:
            for q in here:
                if p != q:
                    together.setdefault((p, q), []).append(f["fir_reg_no"])
    for (p, q), shared in together.items():
        persons[p]["coAccused"].append({"id": q, "name": persons[q]["name"], "firs": shared})
    for p in persons.values():
        p["coAccused"].sort(key=lambda c: (-len(c["firs"]), c["name"]))

    for ka, kb, m in same_name:
        p, q = person_of[ka], person_of[kb]
        if p == q:
            continue
        for x, y, fir in ((p, q, m["b"]), (q, p, m["a"])):
            if not any(s["id"] == y for s in persons[x]["sameNameNotLinked"]):
                persons[x]["sameNameNotLinked"].append({"id": y, "name": persons[y]["name"], "fir": fir, "score": m["score"], "sharedTags": len(m["sharedTags"]), "daysApart": m["daysApart"]})

    return sorted(persons.values(), key=lambda p: (-len(p["firs"]), p["name"]))
