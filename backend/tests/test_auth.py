import pytest
from fastapi.testclient import TestClient

from app.core.security import hash_password, verify_password, make_token, decode_token
from app.db import models


@pytest.fixture
def client():
    from app.main import app
    from app.db.session import SessionLocal

    with TestClient(app) as c:
        yield c

    with SessionLocal() as s:
        s.query(models.TeamMember).filter(
            models.TeamMember.user_id.in_(
                s.query(models.User.id).filter(models.User.email.like("test_%@x.com"))
            )
        ).delete(synchronize_session=False)
        s.query(models.Conversation).filter(
            models.Conversation.user_id.in_(
                s.query(models.User.id).filter(models.User.email.like("test_%@x.com"))
            )
        ).delete(synchronize_session=False)
        s.query(models.Project).filter(
            models.Project.user_id.in_(
                s.query(models.User.id).filter(models.User.email.like("test_%@x.com"))
            )
        ).delete(synchronize_session=False)
        s.query(models.Team).filter(models.Team.slug.like("test-%")).delete(synchronize_session=False)
        s.query(models.Team).filter(models.Team.name.like("Acme%")).delete(synchronize_session=False)
        s.query(models.Team).filter(models.Team.name.like("Z%")).delete(synchronize_session=False)
        s.query(models.Team).filter(models.Team.name.like("Group%")).delete(synchronize_session=False)
        s.query(models.Team).filter(models.Team.name.like("RoleTeam%")).delete(synchronize_session=False)
        s.query(models.Team).filter(models.Team.name.like("Del%")).delete(synchronize_session=False)
        s.query(models.User).filter(models.User.email.like("test_%@x.com")).delete(synchronize_session=False)
        s.commit()


def test_password_hash_and_verify():
    h = hash_password("hello-world-123")
    assert h != "hello-world-123"
    assert verify_password("hello-world-123", h)
    assert not verify_password("wrong", h)


def test_jwt_roundtrip():
    tok = make_token("uid-123", "x@y.com")
    payload = decode_token(tok)
    assert payload["sub"] == "uid-123"
    assert payload["email"] == "x@y.com"


def test_register_login_me_logout(client):
    r = client.post(
        "/api/auth/register",
        json={"email": "test_reg@x.com", "password": "Passw0rd!", "display_name": "Reg"},
    )
    assert r.status_code == 200, r.text
    user = r.json()["user"]
    assert user["email"] == "test_reg@x.com"
    assert user["display_name"] == "Reg"

    r = client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == "test_reg@x.com"

    r = client.post("/api/auth/logout")
    assert r.status_code == 200

    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_register_duplicate_email(client):
    r1 = client.post(
        "/api/auth/register",
        json={"email": "test_dup@x.com", "password": "Passw0rd!", "display_name": "U1"},
    )
    assert r1.status_code == 200
    r2 = client.post(
        "/api/auth/register",
        json={"email": "test_dup@x.com", "password": "Passw0rd!", "display_name": "U2"},
    )
    assert r2.status_code == 409


def test_register_weak_password(client):
    r = client.post(
        "/api/auth/register",
        json={"email": "test_weak@x.com", "password": "12345678", "display_name": "U"},
    )
    assert r.status_code == 400
    assert "字母" in r.json()["detail"] or "数字" in r.json()["detail"]


def test_login_bad_password(client):
    client.post(
        "/api/auth/register",
        json={"email": "test_bad@x.com", "password": "Passw0rd!", "display_name": "U"},
    )
    client.post("/api/auth/logout")
    r = client.post(
        "/api/auth/login",
        json={"email": "test_bad@x.com", "password": "wrong"},
    )
    assert r.status_code == 401


def test_update_profile(client):
    client.post(
        "/api/auth/register",
        json={"email": "test_prof@x.com", "password": "Passw0rd!", "display_name": "Old"},
    )
    r = client.patch(
        "/api/auth/me",
        json={"display_name": "New", "avatar_color": "#22A06B"},
    )
    assert r.status_code == 200
    assert r.json()["display_name"] == "New"
    assert r.json()["avatar_color"] == "#22A06B"


def test_change_password(client):
    client.post(
        "/api/auth/register",
        json={"email": "test_pw@x.com", "password": "Passw0rd!", "display_name": "U"},
    )
    r = client.post(
        "/api/auth/me/password",
        json={"old_password": "Passw0rd!", "new_password": "NewPass99"},
    )
    assert r.status_code == 200

    client.post("/api/auth/logout")
    r = client.post(
        "/api/auth/login",
        json={"email": "test_pw@x.com", "password": "NewPass99"},
    )
    assert r.status_code == 200


def test_unauthenticated_access_blocked(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401
    r = client.get("/api/projects")
    assert r.status_code == 401


def test_team_crud(client):
    client.post(
        "/api/auth/register",
        json={"email": "test_team@x.com", "password": "Passw0rd!", "display_name": "Boss"},
    )

    r = client.post("/api/teams", json={"name": "Acme", "description": "团队A"})
    assert r.status_code == 200, r.text
    team = r.json()
    assert team["my_role"] == "owner"
    assert team["slug"] == "acme"

    r = client.get("/api/teams")
    assert r.status_code == 200
    assert len(r.json()["items"]) == 1

    r = client.get(f"/api/teams/{team['id']}")
    assert r.status_code == 200
    assert len(r.json()["members"]) == 1

    r = client.patch(
        f"/api/teams/{team['id']}",
        json={"description": "改"},
    )
    assert r.status_code == 200
    assert r.json()["description"] == "改"


def test_team_member_role_update(client):
    client.post(
        "/api/auth/register",
        json={"email": "test_admin@x.com", "password": "Passw0rd!", "display_name": "A"},
    )
    r = client.post("/api/teams", json={"name": "Group"})
    team_id = r.json()["id"]
    r2 = client.post(
        "/api/auth/register",
        json={"email": "test_m@x.com", "password": "Passw0rd!", "display_name": "M"},
    )
    member_id = r2.json()["user"]["id"]
    client.post("/api/auth/logout")
    client.post(
        "/api/auth/login",
        json={"email": "test_admin@x.com", "password": "Passw0rd!"},
    )
    client.post(
        f"/api/teams/{team_id}/members",
        json={"email": "test_m@x.com", "role": "member"},
    )
    r = client.patch(
        f"/api/teams/{team_id}/members/{member_id}",
        json={"role": "admin"},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


def test_team_remove_self(client):
    client.post(
        "/api/auth/register",
        json={"email": "test_owner2@x.com", "password": "Passw0rd!", "display_name": "O"},
    )
    r = client.post("/api/teams", json={"name": "Group2"})
    team_id = r.json()["id"]
    r2 = client.post(
        "/api/auth/register",
        json={"email": "test_rm@x.com", "password": "Passw0rd!", "display_name": "X"},
    )
    member_id = r2.json()["user"]["id"]
    client.post("/api/auth/logout")
    client.post(
        "/api/auth/login",
        json={"email": "test_owner2@x.com", "password": "Passw0rd!"},
    )
    client.post(
        f"/api/teams/{team_id}/members",
        json={"email": "test_rm@x.com", "role": "member"},
    )
    client.post("/api/auth/logout")
    client.post(
        "/api/auth/login",
        json={"email": "test_rm@x.com", "password": "Passw0rd!"},
    )
    r = client.delete(f"/api/teams/{team_id}/members/{member_id}")
    assert r.status_code == 200
    r = client.get(f"/api/teams/{team_id}")
    assert r.status_code == 403


def test_team_invite_and_role(client):
    client.post(
        "/api/auth/register",
        json={"email": "test_owner@x.com", "password": "Passw0rd!", "display_name": "Owner"},
    )
    r = client.post("/api/teams", json={"name": "RoleTeam"})
    team_id = r.json()["id"]
    client.post("/api/auth/logout")

    client.post(
        "/api/auth/register",
        json={"email": "test_invitee@x.com", "password": "Passw0rd!", "display_name": "Invitee"},
    )
    r = client.post(
        f"/api/teams/{team_id}/members",
        json={"email": "test_owner@x.com", "role": "admin"},
    )
    assert r.status_code == 403
    client.post("/api/auth/logout")

    client.post(
        "/api/auth/login",
        json={"email": "test_owner@x.com", "password": "Passw0rd!"},
    )
    r = client.post(
        f"/api/teams/{team_id}/members",
        json={"email": "test_invitee@x.com", "role": "member"},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "member"

    r = client.get(f"/api/teams/{team_id}")
    members = r.json()["members"]
    assert len(members) == 2
    roles = {m["user_id"]: m["role"] for m in members}
    assert roles[r.json()["owner_id"]] == "owner"


def test_team_delete_blocked_with_projects(client):
    client.post(
        "/api/auth/register",
        json={"email": "test_team2@x.com", "password": "Passw0rd!", "display_name": "U"},
    )
    r = client.post("/api/teams", json={"name": "Del"})
    team_id = r.json()["id"]
    r = client.post(
        "/api/projects",
        json={"name": "P", "team_id": team_id},
    )
    assert r.status_code == 200
    r = client.delete(f"/api/teams/{team_id}")
    assert r.status_code == 400