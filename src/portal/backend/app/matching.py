"""Repeat-offender scoring.

score = w_name * name_match + w_tags * mo_tag_jaccard + w_text * mo_text_similarity + w_time * temporal

Two FIRs are linked only when the name match clears the name gate AND the score clears
the threshold. A similar method alone never creates a link. Mirrors src/lib/matching.ts.
"""
import logging
import math
import re
from datetime import date

from rapidfuzz import fuzz

from . import settings
from .extract import RULES

log = logging.getLogger("netra.matching")

DEFAULT_CONFIG = {
    "weights": {"name": 0.4, "moTags": 0.25, "moText": 0.2, "temporal": 0.15},
    "nameGate": 0.8,
    "threshold": 0.6,
    "decayDays": 180,
}

FILLER = set(RULES["nameFillers"])
# Gujarati honorifics are written joined to the name: Vikrambhai, Vikramsinh, Hansaben.
SUFFIX = re.compile(rf"(?<=.{{4}})({'|'.join(RULES['nameSuffixes'])})$")

# ---------- name similarity ----------


def _tokens(s: str) -> list[str]:
    return [t for t in re.sub(r"[^a-z\s]", " ", s.lower()).split() if t]


_PHONETIC = [(r"ee|ea", "i"), (r"oo|ou", "u"), (r"z", "j"), (r"ph", "f"), (r"w", "v"), (r"y", "i"), (r"o", "a"), (r"(.)\1+", r"\1")]


def phonetic(token: str) -> str:
    """Collapse common transliteration variants: Mondal/Mandal, Hajra/Hazra, Gurprit/Gurpreet."""
    for pattern, repl in _PHONETIC:
        token = re.sub(pattern, repl, token)
    return token


def _ratio(a: list[str], b: list[str]) -> float:
    return fuzz.ratio(" ".join(sorted(a)), " ".join(sorted(b))) / 100


def compare_names(a: str, b: str) -> tuple[float, str]:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0, "no name"
    spelled = _ratio(ta, tb)
    sound = _ratio([phonetic(t) for t in ta], [phonetic(t) for t in tb])
    best = (spelled, "spelling match") if spelled >= sound else (sound, "same pronunciation, different spelling")

    ca = [phonetic(SUFFIX.sub("", t)) for t in ta if t not in FILLER]
    cb = [phonetic(SUFFIX.sub("", t)) for t in tb if t not in FILLER]
    if ca and cb:
        core = _ratio(ca, cb)
        if core > best[0]:
            best = (core, "match after removing titles and honorifics")
        for short, long in ((ca, cb), (cb, ca)):
            initials = [t for t in short if len(t) == 1]
            full = [t for t in short if len(t) > 1]
            if not initials or not full:
                continue
            rest = list(long)

            def take(pred) -> bool:
                for i, r in enumerate(rest):
                    if pred(r):
                        rest.pop(i)
                        return True
                return False

            ok = all(take(lambda r, t=t: fuzz.ratio(t, r) >= 85) for t in full) and all(take(lambda r, t=t: r.startswith(t)) for t in initials)
            if ok and best[0] < 0.85:
                best = (0.85, "initial matches full name")
    return best


def name_similarity(a: dict, b: dict) -> dict:
    sim, method = compare_names(a["name"], b["name"])
    for alias in a["aliases"]:
        s, _ = compare_names(alias, b["name"])
        if s > sim:
            sim, method = s, f'alias "{alias}" matches name'
    for alias in b["aliases"]:
        s, _ = compare_names(a["name"], alias)
        if s > sim:
            sim, method = s, f'alias "{alias}" matches name'
    shared = next((x for x in a["aliases"] if any(_tokens(x) and _tokens(y) and _ratio([phonetic(t) for t in _tokens(x)], [phonetic(t) for t in _tokens(y)]) >= 0.9 for y in b["aliases"])), None)
    if shared and sim >= 0.5:
        sim, method = min(1.0, sim + 0.1), f'{method} + shared alias "{shared}"'
    return {"a": a["raw"], "b": b["raw"], "similarity": sim, "method": method}


# ---------- MO similarity ----------


def jaccard(a: list[str], b: list[str]) -> tuple[float, list[str]]:
    sb = set(b)
    shared = [t for t in a if t in sb]
    union = len(set(a) | sb)
    return (len(shared) / union if union else 0.0), shared


STOP = set("a an the and or of to in on at by for from with was were is are be been as his her he she it they them their its that this who which while had has have not into out over after before about up down off same also then than one two".split())


def _words(s: str) -> list[str]:
    return [w for w in re.sub(r"[^a-z\s]", " ", s.lower()).split() if len(w) > 2 and w not in STOP]


class TextSimilarity:
    """Cosine similarity between MO summaries.

    Sentence embeddings catch paraphrased methods ("cut the grill" vs "sawed through the
    window bars"). TF-IDF is the fallback when the model cannot be loaded.
    """

    def __init__(self) -> None:
        self.method = "tfidf"
        self.label = "Word overlap between the two MO summaries (TF-IDF cosine)"
        self._model = None
        self._cache: dict[str, list[float]] = {}
        self._vectors: dict[str, list[float] | dict[str, float]] = {}
        if settings.TEXT_SIMILARITY in ("auto", "embeddings"):
            try:
                from sentence_transformers import SentenceTransformer

                self._model = SentenceTransformer(settings.EMBEDDING_MODEL, device="cpu")
                self.method = "embeddings"
                self.label = f"Meaning of the two MO summaries compared ({settings.EMBEDDING_MODEL.split('/')[-1]} sentence embeddings)"
            except Exception as e:  # noqa: BLE001 - missing package, no network, corrupt cache
                if settings.TEXT_SIMILARITY == "embeddings":
                    raise
                log.warning("Sentence embeddings unavailable, using TF-IDF: %s", e)

    def fit(self, docs: dict[str, str]) -> None:
        if self._model is not None:
            missing = [t for t in set(docs.values()) if t not in self._cache]
            if missing:
                for text, vec in zip(missing, self._model.encode(missing, normalize_embeddings=True)):
                    self._cache[text] = vec.tolist()
            self._vectors = {k: self._cache[t] for k, t in docs.items()}
            return
        df: dict[str, int] = {}
        tokenised = {k: _words(t) for k, t in docs.items()}
        for ws in tokenised.values():
            for w in set(ws):
                df[w] = df.get(w, 0) + 1
        self._vectors = {}
        for k, ws in tokenised.items():
            v: dict[str, float] = {}
            for w in ws:
                v[w] = v.get(w, 0) + 1
            for w in v:
                v[w] *= math.log((1 + len(docs)) / (1 + df[w])) + 1
            norm = math.sqrt(sum(x * x for x in v.values())) or 1
            self._vectors[k] = {w: x / norm for w, x in v.items()}

    def cosine(self, a: str, b: str) -> float:
        va, vb = self._vectors.get(a), self._vectors.get(b)
        if va is None or vb is None:
            return 0.0
        if isinstance(va, dict):
            return sum(x * vb.get(w, 0) for w, x in va.items())
        return max(0.0, sum(x * y for x, y in zip(va, vb)))


# ---------- pair scoring ----------


def pair_key(a: str, b: str) -> str:
    return f"{a}~{b}" if a < b else f"{b}~{a}"


def score_pair(a: dict, b: dict, text: TextSimilarity, cfg: dict) -> dict | None:
    names = [
        name_similarity(pa, pb)
        for pa in a["extraction"]["accused"] if pa["identified"]
        for pb in b["extraction"]["accused"] if pb["identified"]
    ]
    names.sort(key=lambda n: -n["similarity"])
    best = names[0] if names else {"a": "—", "b": "—", "similarity": 0.0, "method": "no identified accused to compare"}

    tag_value, shared = jaccard([t["value"] for t in a["extraction"]["mo_tags"]], [t["value"] for t in b["extraction"]["mo_tags"]])
    days = abs((date.fromisoformat(a["occurrence"]["date"]) - date.fromisoformat(b["occurrence"]["date"])).days)
    components = {
        "name": best["similarity"],
        "moTags": tag_value,
        "moText": text.cosine(a["fir_reg_no"], b["fir_reg_no"]),
        "temporal": math.exp(-days / cfg["decayDays"]),
    }
    score = sum(cfg["weights"][k] * components[k] for k in components)

    same_name = components["name"] >= cfg["nameGate"]
    if same_name and score >= cfg["threshold"]:
        verdict = "linked"
    elif same_name:
        verdict = "name_only"
    elif components["moTags"] >= 0.5:
        verdict = "mo_only"
    else:
        return None

    return {
        "key": pair_key(a["fir_reg_no"], b["fir_reg_no"]),
        "a": a["fir_reg_no"],
        "b": b["fir_reg_no"],
        "components": components,
        "score": score,
        "verdict": verdict,
        "crossDistrict": a["district"] != b["district"],
        "crossState": a["state"] != b["state"],
        "bestName": best,
        "otherNames": [n for n in names[1:] if n["similarity"] >= cfg["nameGate"]],
        "sharedTags": shared,
        "daysApart": days,
    }


def find_matches(firs: list[dict], text: TextSimilarity, cfg: dict) -> list[dict]:
    text.fit({f["fir_reg_no"]: f["mo_summary"] for f in firs})
    out = []
    for i, a in enumerate(firs):
        for b in firs[i + 1:]:
            m = score_pair(a, b, text, cfg)
            if m:
                out.append(m)
    out.sort(key=lambda m: -m["score"])
    return out


# ---------- networks ----------


def _uniq(xs: list) -> list:
    return list(dict.fromkeys(xs))


def build_networks(firs: list[dict], matches: list[dict], cfg: dict) -> list[dict]:
    by_id = {f["fir_reg_no"]: f for f in firs}
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        while parent.get(x, x) != x:
            parent[x] = parent.get(parent[x], parent[x])
            x = parent[x]
        return x

    linked = [m for m in matches if m["verdict"] == "linked"]
    for m in linked:
        parent[find(m["a"])] = find(m["b"])

    groups: dict[str, set[str]] = {}
    for m in linked:
        groups.setdefault(find(m["a"]), set()).update((m["a"], m["b"]))

    networks = []
    for ids in groups.values():
        members = sorted((by_id[i] for i in ids), key=lambda f: f["occurrence"]["date"])
        ms = [m for m in linked if m["a"] in ids]
        variants = _uniq([x for m in ms for n in [m["bestName"], *m["otherNames"]] if n["similarity"] >= cfg["nameGate"] for x in (n["a"], n["b"])])
        counts: dict[str, int] = {}
        for f in members:
            for t in f["extraction"]["mo_tags"]:
                counts[t["value"]] = counts.get(t["value"], 0) + 1
        networks.append({
            "id": "",
            "label": max(variants, key=len) if variants else "Unnamed",
            "firs": [f["fir_reg_no"] for f in members],
            "nameVariants": variants,
            "districts": _uniq([f["district"] for f in members]),
            "states": _uniq([f["state"] for f in members]),
            "crimeTypes": _uniq([c["value"] for f in members for c in f["extraction"]["crime_types"]]),
            "sharedTags": [t for t, n in counts.items() if n >= math.ceil(len(members) * 0.75)],
            "matches": ms,
            "avgScore": sum(m["score"] for m in ms) / len(ms),
            "firstSeen": members[0]["occurrence"]["date"],
            "lastSeen": members[-1]["occurrence"]["date"],
        })
    networks.sort(key=lambda n: (-len(n["firs"]), -n["avgScore"]))
    for i, n in enumerate(networks):
        n["id"] = f"N{i + 1}"
    return networks
