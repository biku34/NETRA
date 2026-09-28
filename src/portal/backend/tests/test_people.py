"""Person profiles, co-accused links, consolidated notes and the records assistant."""
import pytest
from fastapi.testclient import TestClient

from app import settings
from app.main import app


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    # a database of its own, seeded fresh, so other test modules cannot change the counts
    mp = pytest.MonkeyPatch()
    mp.setattr(settings, "DATABASE_PATH", str(tmp_path_factory.mktemp("people") / "people.db"))
    with TestClient(app) as c:
        yield c
    mp.undo()


def as_role(client, role):
    token = client.post("/auth/login", json={"user_id": "123", "password": "123"}).json()["token"]
    token = client.post("/auth/role", json={"role": role}, headers={"Authorization": f"Bearer {token}"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def ig(client):
    return as_role(client, "ig")


@pytest.fixture(scope="module")
def snap(client, ig):
    return client.get("/snapshot", headers=ig).json()


def person(snap, name, firs=None):
    found = [p for p in snap["persons"] if p["name"].startswith(name) and (firs is None or len(p["firs"]) == firs)]
    assert len(found) == 1, [p["name"] for p in snap["persons"] if name.split()[0] in p["name"]]
    return found[0]


def ask(client, headers, question):
    r = client.post("/assistant/ask", json={"question": question}, headers=headers)
    assert r.status_code == 200
    return r.json()


# ---------- profiles ----------


def test_spelling_variants_become_one_profile(snap):
    vikram = person(snap, "Vikram", firs=5)
    assert len(vikram["districts"]) == 5 and "Vicky" in vikram["aliases"]
    assert {"Vikram Solanki @ Vicky", "Vikrambhai Solanki", "V. Solanki", "Vikramsinh Solanky @ Vicky"} <= set(vikram["variants"])


def test_every_merge_is_justified(snap):
    vikram = person(snap, "Vikram", firs=5)
    assert vikram["identityLinks"]
    merged = {m["fir"] for m in vikram["mentions"]}
    for link in vikram["identityLinks"]:
        assert link["similarity"] >= 0.8 and link["method"] and link["score"] >= 0.6
        assert {link["a"]["fir"], link["b"]["fir"]} <= merged
    # every FIR in the profile is reachable through at least one justified link
    assert merged == {x["fir"] for link in vikram["identityLinks"] for x in (link["a"], link["b"])}


def test_same_name_in_an_unlinked_fir_stays_a_separate_person(snap):
    vikram = person(snap, "Vikram", firs=5)
    other = person(snap, "Vikram Solanki", firs=1)
    assert other["id"] != vikram["id"] and other["districts"] == ["Bhavnagar"]
    assert other["id"] in [s["id"] for s in vikram["sameNameNotLinked"]]


def test_co_accused_link_both_ways_with_the_firs_that_prove_it(snap):
    vikram = person(snap, "Vikram", firs=5)
    dinesh = person(snap, "Dinesh Makwana")
    assert len(dinesh["firs"]) == 2
    to_dinesh = next(c for c in vikram["coAccused"] if c["id"] == dinesh["id"])
    to_vikram = next(c for c in dinesh["coAccused"] if c["id"] == vikram["id"])
    assert sorted(to_dinesh["firs"]) == sorted(to_vikram["firs"]) == sorted(dinesh["firs"])
    by_id = {f["fir_reg_no"]: f for f in snap["firs"]}
    for reg in to_dinesh["firs"]:
        names = [a["name"] for a in by_id[reg]["accused"]]
        assert any("Solank" in n for n in names) and any("Makwana" in n for n in names)


def test_unidentified_accused_get_no_profile(snap):
    assert not [p for p in snap["persons"] if "unknown" in p["name"].lower() or "withheld" in p["name"].lower()]


# ---------- notes ----------


def test_every_level_with_case_access_adds_notes_and_the_ig_sees_them_all(client, ig, snap):
    reg = person(snap, "Vikram", firs=5)["firs"][0]
    for role, text in [("si", "CCTV collected from the restaurant."), ("sho", "Asked Surat for the fingerprint report."), ("dysp", "Same motorcycle seen in Sarkhej."), ("sp", "Put the bank branch on alert."), ("ig", "Share with Rajasthan police.")]:
        assert client.post(f"/fir/{reg}/notes", json={"text": text}, headers=as_role(client, role)).status_code == 200
    notes = client.get("/snapshot", headers=ig).json()["notes"][reg]
    assert [n["role"] for n in notes] == ["IG Intelligence", "SP", "DySP", "SHO", "Sub-Inspector"]
    assert notes[0]["text"] == "Share with Rajasthan police." and notes[-1]["by"] == "SI Bhargav"


def test_roles_without_case_access_cannot_add_notes(client, snap):
    reg = person(snap, "Vikram", firs=5)["firs"][0]
    for role in ("constable", "admin"):
        assert client.post(f"/fir/{reg}/notes", json={"text": "x"}, headers=as_role(client, role)).status_code == 403


def test_notes_cannot_be_added_outside_jurisdiction(client, snap):
    outside = next(f["fir_reg_no"] for f in snap["firs"] if f.get("redacted"))
    assert client.post(f"/fir/{outside}/notes", json={"text": "x"}, headers=as_role(client, "ig")).status_code == 403


# ---------- assistant ----------


def test_assistant_is_for_the_ig(client):
    assert client.post("/assistant/ask", json={"question": "gangs"}, headers=as_role(client, "sho")).status_code == 403
    assert client.post("/assistant/ask", json={"question": "gangs"}).status_code == 401


def test_person_question_separates_people_with_the_same_name(client, ig, snap):
    a = ask(client, ig, "Who is Vikram Solanki?")
    assert "2 different people" in a["answer"]
    assert {r["to"] for r in a["rows"]} == {f"/fir/person/{person(snap, 'Vikram', firs=5)['id']}", f"/fir/person/{person(snap, 'Vikram Solanki', firs=1)['id']}"}


def test_person_summary_matches_the_profile(client, ig, snap):
    dinesh = person(snap, "Dinesh Makwana")
    a = ask(client, ig, "tell me about dinesh makwana")
    assert "2 FIRs" in a["answer"] and "Rajkot City" in a["answer"] and "Udaipur" in a["answer"]
    assert a["rows"][0]["to"] == f"/fir/person/{dinesh['id']}"


def test_misspelt_name_still_finds_the_person(client, ig):
    assert "Dinesh Makwana" in ask(client, ig, "who is dinesh makwanna")["answer"]


def test_co_accused_question(client, ig, snap):
    a = ask(client, ig, "Who are the co-accused of Vikramsinh Solanky?")
    assert "1 co-accused" in a["answer"]
    assert a["rows"][0]["label"] == "Dinesh Makwana" and "2 FIRs" in a["rows"][0]["detail"]
    assert a["rows"][0]["to"] == f"/fir/person/{person(snap, 'Dinesh Makwana')['id']}"


def test_co_accused_question_for_a_shared_name_answers_for_each_person(client, ig, snap):
    a = ask(client, ig, "co-accused of Vikram Solanki")
    assert a["answer"].startswith("2 different people") and "1 of them has co-accused" in a["answer"]
    dinesh = next(r for r in a["rows"] if r["label"] == "Dinesh Makwana")
    assert "5 FIRs" in dinesh["detail"] and "Named together in 2 FIRs" in dinesh["detail"]
    alone = next(r for r in a["rows"] if r["label"] == "Vikram Solanki")
    assert "Bhavnagar" in alone["detail"] and "No co-accused" in alone["detail"]


def test_counts_agree_with_the_records(client, ig, snap):
    own = [f for f in snap["firs"] if not f.get("redacted")]

    def count(kind, district=None):
        return sum(1 for f in own if kind in [c["value"] for c in f["extraction"]["crime_types"]] and (district is None or f["district"] == district))

    assert ask(client, ig, "How many vehicle thefts in Ahmedabad City?")["answer"].startswith(f"{count('Vehicle Theft', 'Ahmedabad City')} FIRs")
    assert ask(client, ig, "vehicle theft in ahmedabad")["answer"].startswith(f"{count('Vehicle Theft', 'Ahmedabad City')} FIRs")
    assert ask(client, ig, "how many narcotics cases")["answer"].startswith(f"{count('Narcotics')} FIR")
    n = sum(1 for f in own if "car_glass_break" in [t["value"] for t in f["extraction"]["mo_tags"]])
    assert ask(client, ig, "cases with car glass break")["answer"].startswith(f"{n} FIRs")


def test_period_filter(client, ig, snap):
    own = [f for f in snap["firs"] if not f.get("redacted")]
    n = sum(1 for f in own if f["occurrence"]["date"].startswith("2026-08") and "Theft" in [c["value"] for c in f["extraction"]["crime_types"]])
    assert ask(client, ig, "thefts in August 2026")["answer"].startswith(f"{n} FIR")


def test_nothing_outside_the_state_is_counted(client, ig):
    assert ask(client, ig, "burglary in Hooghly")["answer"].startswith("No FIRs") or "Hooghly" not in ask(client, ig, "burglary in Hooghly")["answer"].split("for:")[0]
    a = ask(client, ig, "who is Pradeep Mandal")
    assert "No accused by that name" in a["answer"]


def test_fir_number_question(client, ig, snap):
    fir = next(f for f in snap["firs"] if not f.get("redacted") and f["police_station"] == "Rajkot A Division" and len(f["accused"]) == 2 and "Solank" in f["accused"][0]["name"])
    a = ask(client, ig, f"status of FIR {fir['fir_id']}")
    assert fir["police_station"] in a["answer"]
    labels = [r["label"] for r in a["rows"]]
    assert "Dinesh Makwana" in labels and any(l.startswith("Gang:") for l in labels)
    assert a["rows"][0]["to"] == f"/fir/case/{fir['fir_reg_no']}"
    assert "No FIR numbered 9999/2026" in ask(client, ig, "FIR 9999/2026")["answer"]


def test_outside_fir_is_named_but_not_opened(client, ig, snap):
    outside = next(f for f in snap["firs"] if f.get("redacted"))
    a = ask(client, ig, f"FIR {outside['fir_id']}")
    row = next(r for r in a["rows"] if outside["police_station"] in r["label"])
    assert row["to"] is None and "reference only" in row["detail"]


def test_gang_questions_follow_decisions(client, ig, snap):
    a = ask(client, ig, "which gangs are waiting for my decision")
    assert a["answer"].startswith("1 gang is waiting")
    target = f"net:{snap['networks'][0]['firs'][0]}"
    assert client.post("/reviews", json={"target": target, "action": "task_force_approved"}, headers=ig).status_code == 200
    assert "No gang is waiting" in ask(client, ig, "which gangs are waiting for my decision")["answer"]
    assert ask(client, ig, "list gangs")["answer"].startswith("1 gang detected")


def test_unclear_question_says_so_and_offers_examples(client, ig):
    a = ask(client, ig, "what is the weather")
    assert "could not tell" in a["answer"] and a["suggestions"] and not a["rows"]


def test_questions_are_audited(client, ig):
    ask(client, ig, "cases with car glass break")
    audit = client.get("/audit", headers=as_role(client, "admin")).json()
    assert any(a["action"] == "Asked the assistant" and a["target"] == "cases with car glass break" for a in audit)
