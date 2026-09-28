"""Jurisdiction and permissions are enforced by the API, not only by the UI."""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def as_role(client, role):
    token = client.post("/auth/login", json={"user_id": "123", "password": "123"}).json()["token"]
    token = client.post("/auth/role", json={"role": role}, headers={"Authorization": f"Bearer {token}"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_login_rejects_wrong_password(client):
    assert client.post("/auth/login", json={"user_id": "123", "password": "nope"}).status_code == 401


def test_endpoints_need_a_token(client):
    assert client.get("/snapshot").status_code == 401
    assert client.get("/fir").status_code == 401


def test_sho_sees_only_own_station(client):
    firs = client.get("/fir", headers=as_role(client, "sho")).json()
    assert firs and {f["police_station"] for f in firs} == {"Navrangpura"}


def test_si_sees_only_assigned_cases(client):
    firs = client.get("/fir", headers=as_role(client, "si")).json()
    assert firs and {f["investigating_officer"]["name"] for f in firs} == {"Bhargav"}


def test_ig_sees_whole_state_and_nothing_else(client):
    firs = client.get("/fir", headers=as_role(client, "ig")).json()
    assert {f["state"] for f in firs} == {"Gujarat"}
    assert len({f["district"] for f in firs}) > 3


def test_constable_and_admin_get_no_case_data(client):
    for role in ("constable", "admin"):
        h = as_role(client, role)
        assert client.get("/fir", headers=h).status_code == 403
        snap = client.get("/snapshot", headers=h).json()
        assert snap["firs"] == [] and snap["matches"] == []


def test_linked_fir_outside_jurisdiction_is_reference_only(client):
    h = as_role(client, "sho")
    snap = client.get("/snapshot", headers=h).json()
    outside = [f for f in snap["firs"] if f.get("redacted")]
    assert outside, "the Navrangpura theft is linked to FIRs in other districts"
    for f in outside:
        assert f["police_station"] != "Navrangpura"
        assert f["narrative"] == "" and f["complainant"]["name"] == "" and f["mo_summary"] == ""
        assert client.get(f"/fir/{f['fir_reg_no']}", headers=h).status_code == 403


def test_matches_carry_a_full_breakdown(client):
    h = as_role(client, "sho")
    snap = client.get("/snapshot", headers=h).json()
    own = {f["fir_reg_no"] for f in snap["firs"] if not f.get("redacted")}
    linked = next(m for m in snap["matches"] if m["verdict"] == "linked")
    mine = linked["a"] if linked["a"] in own else linked["b"]
    body = client.get(f"/fir/{mine}/matches", headers=h).json()
    m = next(x for x in body["matches"] if x["verdict"] == "linked")
    assert set(m["components"]) == {"name", "moTags", "moText", "temporal"}
    assert abs(sum(m["weights"][k] * m["components"][k] for k in m["components"]) - m["score"]) < 1e-9
    assert m["bestName"]["method"] and m["other"]["redacted"]


def test_station_trend_stays_inside_jurisdiction(client):
    h = as_role(client, "sho")
    trend = client.get("/station/Navrangpura/trend", headers=h).json()
    assert trend["total"] == len(client.get("/fir", headers=h).json())
    assert len(trend["monthly"]) == 12 and trend["summary"]
    assert any("repeat-offender signature" in s for s in trend["summary"])
    assert client.get("/station/Balagarh/trend", headers=h).status_code == 404


def test_review_permissions(client):
    snap = client.get("/snapshot", headers=as_role(client, "si")).json()
    key = next(m["key"] for m in snap["matches"] if m["verdict"] == "linked")
    body = {"target": key, "action": "confirmed", "label": "test"}
    assert client.post("/reviews", json=body, headers=as_role(client, "sho")).status_code == 403
    assert client.post("/reviews", json=body, headers=as_role(client, "si")).status_code == 200
    assert client.get("/snapshot", headers=as_role(client, "si")).json()["reviews"][key]["by"] == "SI Bhargav"
    assert client.post("/reviews", json={**body, "action": "rejected"}, headers=as_role(client, "si")).status_code == 200
    snap = client.get("/snapshot", headers=as_role(client, "si")).json()
    assert [s["action"] for s in snap["steps"][key]] == ["rejected"]
    assert client.post("/reviews", json={**body, "target": "no~such"}, headers=as_role(client, "si")).status_code == 404


def test_decisions_on_a_gang_build_a_chain_the_ig_can_see(client):
    sho, dysp, ig = (as_role(client, r) for r in ("sho", "dysp", "ig"))
    net = client.get("/networks", headers=sho).json()[0]
    target = f"net:{net['firs'][0]}"
    assert client.post("/reviews", json={"target": target, "action": "task_force_approved"}, headers=sho).status_code == 403
    assert client.post("/reviews", json={"target": target, "action": "escalated"}, headers=sho).status_code == 200
    assert client.post("/reviews", json={"target": target, "action": "linkage_approved"}, headers=dysp).status_code == 200
    assert client.post("/reviews", json={"target": target, "action": "task_force_approved"}, headers=ig).status_code == 200
    snap = client.get("/snapshot", headers=ig).json()
    assert [s["action"] for s in snap["steps"][target]] == ["escalated", "linkage_approved", "task_force_approved"]
    assert snap["steps"][target][-1]["by"] == "IG Aastha Thakker"
    outside = [f for f in snap["firs"] if f.get("redacted")]
    assert outside and all(f["lat"] and f["lng"] and f["occurrence"]["place"] == "" for f in outside)


def test_only_admin_changes_scoring_and_weights_must_sum_to_one(client):
    cfg = client.get("/config", headers=as_role(client, "sp")).json()
    assert client.put("/config", json=cfg, headers=as_role(client, "sp")).status_code == 403
    bad = {**cfg, "weights": {**cfg["weights"], "name": 0.9}}
    assert client.put("/config", json=bad, headers=as_role(client, "admin")).status_code == 422
    assert client.put("/config", json=cfg, headers=as_role(client, "admin")).status_code == 200
    assert client.get("/audit", headers=as_role(client, "sho")).status_code == 403
    assert any(a["action"] == "Updated scoring configuration" for a in client.get("/audit", headers=as_role(client, "admin")).json())


def test_ingest_links_a_new_fir_to_an_existing_gang(client):
    h = as_role(client, "sho")
    fir = {
        "fir_id": "0999/2026", "fir_reg_no": "24191021260999", "state": "Gujarat", "district": "Ahmedabad City", "police_station": "Navrangpura",
        "date_of_fir": "2026-09-02T10:00:00", "occurrence": {"date": "2026-09-01", "time_period": "Pahar 4 (12:00-15:00 hrs)", "place": "Swastik Cross Roads, Navrangpura"},
        "acts_sections": ["BNS 303(2) - Theft", "BNS 324(4) - Mischief causing damage"],
        "accused": [{"name": "Vikrambhai Solanky", "relative_name": "", "address": ""}],
        "narrative": "Complainant withdrew cash from the bank and parked his car in the afternoon. Two men on a motorcycle who followed him from the bank broke the window glass and took the cash bag.",
        "investigating_officer": {"name": "Bhargav", "rank": "Police Sub-Inspector"},
    }
    before = len(client.get("/fir", headers=h).json())
    r = client.post("/fir/ingest", json={"firs": [fir, {"fir_id": "bad"}]}, headers=h).json()
    assert r["added"] == 1 and len(r["errors"]) == 1
    assert len(client.get("/fir", headers=h).json()) == before + 1
    matches = client.get(f"/fir/{fir['fir_reg_no']}/matches", headers=h).json()["matches"]
    assert sum(m["verdict"] == "linked" for m in matches) == 5

    elsewhere = {**fir, "fir_reg_no": "32699007260999", "police_station": "Balagarh", "district": "Hooghly", "state": "West Bengal"}
    assert client.post("/fir/ingest", json={"firs": [elsewhere]}, headers=h).status_code == 403
    assert client.post("/fir/ingest", json={"firs": [fir]}, headers=as_role(client, "si")).status_code == 403
