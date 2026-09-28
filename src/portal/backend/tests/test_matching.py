"""The scoring engine must recover the planted gangs and nothing else."""
import json

import pytest

from app import settings
from app.extract import extract_local
from app.matching import DEFAULT_CONFIG, TextSimilarity, build_networks, compare_names, find_matches

SEED = json.loads(settings.SEED_FILE.read_text(encoding="utf-8"))
GROUP = {f["fir_reg_no"]: f["seed_group"] for f in SEED}


@pytest.fixture(scope="module", params=["embeddings", "tfidf"])
def result(request):
    mp = pytest.MonkeyPatch()
    mp.setattr(settings, "TEXT_SIMILARITY", request.param)
    try:
        text = TextSimilarity()
    finally:
        mp.undo()
    assert text.method == request.param
    firs = [{**f, "extraction": extract_local(f)} for f in SEED]
    matches = find_matches(firs, text, DEFAULT_CONFIG)
    return matches, build_networks(firs, matches, DEFAULT_CONFIG)


@pytest.mark.parametrize("group,size", [("cluster-A", 5), ("cluster-B", 4), ("cluster-C", 3), ("cluster-D", 5)])
def test_planted_gang_is_recovered_exactly(result, group, size):
    _, networks = result
    expected = sorted(k for k, g in GROUP.items() if g == group)
    assert len(expected) == size
    found = [n for n in networks if set(n["firs"]) & set(expected)]
    assert len(found) == 1
    assert sorted(found[0]["firs"]) == expected
    assert len(found[0]["districts"]) >= 3


def test_no_false_links(result):
    matches, networks = result
    assert len(networks) == 4
    for m in matches:
        if m["verdict"] == "linked":
            assert GROUP[m["a"]] == GROUP[m["b"]] and GROUP[m["a"]].startswith("cluster")


def test_same_name_unrelated_offence_is_not_linked(result):
    matches, _ = result
    control = [m for m in matches if "control" in (GROUP[m["a"]], GROUP[m["b"]])]
    assert control and all(m["verdict"] == "name_only" for m in control)


def test_same_method_different_accused_is_not_linked(result):
    matches, _ = result
    decoy = [m for m in matches if "decoy" in (GROUP[m["a"]], GROUP[m["b"]])]
    assert decoy and all(m["verdict"] != "linked" for m in decoy)


@pytest.mark.parametrize("a,b", [("Pradip Mondal", "Pradeep Mandal"), ("P. Mandal", "Pradeep Mandal"), ("Pradeep Kr. Mandal", "Pradip Mondal"), ("Bablu Hajra", "Babloo Hazra"), ("Gurprit Singh", "Gurpreet Singh"), ("Seetaram Mondal", "Sitaram Mandal"), ("Vikrambhai Solanki", "Vikram Solanki"), ("Vikramsinh Solanky", "Vikrambhai Solanki"), ("V. Solanki", "Vikramsinh Solanky")])
def test_spelling_variants_match(a, b):
    assert compare_names(a, b)[0] >= DEFAULT_CONFIG["nameGate"]


@pytest.mark.parametrize("a,b", [("Pradeep Mandal", "Anil Yadav"), ("Bablu Hazra", "Tapan Bagdi"), ("Gurpreet Singh", "Harjinder Kumar"), ("Hitesh Patel", "Hansaben Patel"), ("Vikram Solanki", "Chirag Solanki"), ("Vikram Solanki", "Dinesh Makwana")])
def test_different_people_do_not_match(a, b):
    assert compare_names(a, b)[0] < DEFAULT_CONFIG["nameGate"]
