"""项目 ↔ 团队关联的回归测试。

覆盖:
- 创建团队项目 (POST /api/projects 带 team_id)
- 列表时回填 team_id/team_name
- 非成员尝试创建团队项目 → 403
- PATCH 项目时不影响 team_id
"""

import pytest
import uuid
from fastapi.testclient import TestClient

from app.db import models
from app.db.session import SessionLocal


@pytest.fixture
def client():
    from app.main import app
    with TestClient(app) as c:
        yield c
    with SessionLocal() as s:
        s.query(models.TeamMember).filter(
            models.TeamMember.user_id.in_(
                s.query(models.User.id).filter(
                    models.User.email.in_(["test_pt_owner@x.com", "test_pt_outsider@x.com"])
                )
            )
        ).delete(synchronize_session=False)
        s.query(models.Project).filter(
            models.Project.user_id.in_(
                s.query(models.User.id).filter(
                    models.User.email.in_(["test_pt_owner@x.com", "test_pt_outsider@x.com"])
                )
            )
        ).delete(synchronize_session=False)
        s.query(models.Team).filter(models.Team.slug.like("test-pt-%")).delete(
            synchronize_session=False
        )
        s.query(models.User).filter(
            models.User.email.in_(["test_pt_owner@x.com", "test_pt_outsider@x.com"])
        ).delete(synchronize_session=False)
        s.commit()


def _register(c, email: str):
    r = c.post(
        "/api/auth/register",
        json={"email": email, "password": "Passw0rd!", "display_name": email.split("@")[0]},
    )
    assert r.status_code == 200, r.text
    return r.json()["user"]["id"]


def _login(c, email: str):
    c.post("/api/auth/logout")
    r = c.post("/api/auth/login", json={"email": email, "password": "Passw0rd!"})
    if r.status_code == 401:
        # 用户还没注册 (某些测试场景),先注册再登录
        reg = c.post(
            "/api/auth/register",
            json={"email": email, "password": "Passw0rd!", "display_name": email.split("@")[0]},
        )
        assert reg.status_code == 200, reg.text
        c.post("/api/auth/logout")
        r = c.post("/api/auth/login", json={"email": email, "password": "Passw0rd!"})
    assert r.status_code == 200, r.text


def test_create_personal_project_no_team_id(client):
    _register(client, "test_pt_owner@x.com")
    r = client.post("/api/projects", json={"name": "我的项目"})
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["team_id"] is None
    assert p["team_name"] is None


def test_create_team_project_returns_team_info(client):
    owner_id = _register(client, "test_pt_owner@x.com")
    suffix = uuid.uuid4().hex[:6]
    team = client.post("/api/teams", json={"name": f"研发{suffix}"}).json()
    r = client.post(
        "/api/projects", json={"name": "团队项目", "team_id": team["id"]},
    )
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["team_id"] == team["id"]
    assert p["team_name"] == f"研发{suffix}"


def test_list_projects_fills_team_name(client):
    _register(client, "test_pt_owner@x.com")
    suffix = uuid.uuid4().hex[:6]
    team = client.post("/api/teams", json={"name": f"产品{suffix}"}).json()
    client.post("/api/projects", json={"name": "团队A", "team_id": team["id"]})
    client.post("/api/projects", json={"name": "个人B"})

    r = client.get("/api/projects")
    assert r.status_code == 200
    items = r.json()
    by_name = {p["name"]: p for p in items}
    assert by_name["团队A"]["team_id"] == team["id"]
    assert by_name["团队A"]["team_name"] == f"产品{suffix}"
    assert by_name["个人B"]["team_id"] is None
    assert by_name["个人B"]["team_name"] is None


def test_non_member_cannot_create_project_in_team(client):
    """不是团队成员,带别人的 team_id 创建项目 → 403。"""
    _register(client, "test_pt_owner@x.com")
    suffix = uuid.uuid4().hex[:6]
    team = client.post("/api/teams", json={"name": f"私密{suffix}"}).json()

    # 第二个用户加入 → 登出 → 第三个新用户
    _login(client, "test_pt_outsider@x.com")
    r = client.post(
        "/api/projects", json={"name": "外贼", "team_id": team["id"]},
    )
    assert r.status_code == 403, r.text
    assert "成员" in r.json()["detail"]


def test_outsider_cannot_see_team_project_in_list(client):
    """非成员的团队项目不应出现在 list 中。"""
    _register(client, "test_pt_owner@x.com")
    suffix = uuid.uuid4().hex[:6]
    team = client.post("/api/teams", json={"name": f"禁地{suffix}"}).json()
    client.post("/api/projects", json={"name": "机密项目", "team_id": team["id"]})

    _login(client, "test_pt_outsider@x.com")
    items = client.get("/api/projects").json()
    assert all(p["name"] != "机密项目" for p in items)


def test_get_team_project_as_member(client):
    """加入团队后,非 owner 成员也能 GET 团队项目。"""
    _register(client, "test_pt_owner@x.com")
    suffix = uuid.uuid4().hex[:6]
    team = client.post("/api/teams", json={"name": f"开放{suffix}"}).json()
    p = client.post(
        "/api/projects", json={"name": "团队项目", "team_id": team["id"]},
    ).json()

    _login(client, "test_pt_outsider@x.com")
    # owner 加 outsider 进团队
    _login(client, "test_pt_owner@x.com")
    client.post(
        f"/api/teams/{team['id']}/members", json={"email": "test_pt_outsider@x.com", "role": "member"},
    )
    # 切回 outsider 测访问
    _login(client, "test_pt_outsider@x.com")

    r = client.get(f"/api/project/{p['id']}")
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["name"] == "团队项目"


def test_patch_project_keeps_team_id(client):
    """PATCH 改名字不应清空 team_id。"""
    _register(client, "test_pt_owner@x.com")
    suffix = uuid.uuid4().hex[:6]
    team = client.post("/api/teams", json={"name": f"组{suffix}"}).json()
    p = client.post(
        "/api/projects", json={"name": "原名", "team_id": team["id"]},
    ).json()

    r = client.patch(f"/api/project/{p['id']}", json={"name": "新名"})
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["name"] == "新名"
    assert updated["team_id"] == team["id"], "team_id 不应被 PATCH 改没"