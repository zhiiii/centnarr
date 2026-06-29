"""团队 API。"""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db import models
from app.db.session import get_db

router = APIRouter(prefix="/api/teams", tags=["teams"])

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$")


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if not base:
        base = "team"
    return base[:64]


class CreateTeamRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    slug: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=500)


class UpdateTeamRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)


class AddMemberRequest(BaseModel):
    email: EmailStr
    role: str = Field(default="member", pattern=r"^(admin|member|viewer)$")


class UpdateMemberRoleRequest(BaseModel):
    role: str = Field(pattern=r"^(admin|member|viewer)$")


class TeamMemberView(BaseModel):
    user_id: str
    email: str
    display_name: str
    avatar_color: str
    role: str
    joined_at: str


class TeamView(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None
    owner_id: str
    my_role: str
    member_count: int
    project_count: int
    created_at: str


class TeamDetailView(TeamView):
    members: list[TeamMemberView]


def _role_of(team: models.Team, user: models.User) -> str | None:
    if team.owner_id == user.id:
        return "owner"
    for m in team.members:
        if m.user_id == user.id:
            return m.role
    return None


def _ensure_member(team: models.Team, user: models.User) -> str:
    role = _role_of(team, user)
    if not role:
        raise HTTPException(status_code=403, detail="你不是该团队成员")
    return role


def _ensure_owner_or_admin(team: models.Team, user: models.User) -> str:
    role = _ensure_member(team, user)
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="需要 owner 或 admin 权限")
    return role


def _team_view(team: models.Team, role: str) -> dict:
    return {
        "id": team.id,
        "name": team.name,
        "slug": team.slug,
        "description": team.description,
        "owner_id": team.owner_id,
        "my_role": role,
        "member_count": len(team.members),
        "project_count": len(team.projects),
        "created_at": team.created_at.isoformat(),
    }


def _member_view(m: models.TeamMember) -> dict:
    return {
        "user_id": m.user_id,
        "email": m.user.email,
        "display_name": m.user.display_name,
        "avatar_color": m.user.avatar_color,
        "role": m.role,
        "joined_at": m.joined_at.isoformat(),
    }


def _ensure_owner(team: models.Team, user: models.User) -> None:
    if team.owner_id != user.id:
        raise HTTPException(status_code=403, detail="仅 owner 可执行此操作")


@router.get("")
def list_teams(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    owned = db.query(models.Team).filter(models.Team.owner_id == user.id).all()
    member_of = (
        db.query(models.Team)
        .join(models.TeamMember)
        .filter(models.TeamMember.user_id == user.id)
        .all()
    )
    seen: dict[str, models.Team] = {}
    for t in owned + member_of:
        seen[t.id] = t
    items = []
    for t in sorted(seen.values(), key=lambda x: x.created_at, reverse=True):
        items.append(_team_view(t, _role_of(t, user) or "member"))
    return {"items": items, "total": len(items)}


@router.post("")
def create_team(
    req: CreateTeamRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="团队名不能为空")
    slug = (req.slug or _slugify(name)).strip().lower()
    if not SLUG_RE.match(slug):
        raise HTTPException(status_code=400, detail="slug 格式: 小写字母数字和 -, 2-64 位")

    if db.query(models.Team).filter(models.Team.slug == slug).first():
        raise HTTPException(status_code=409, detail="slug 已被占用")

    team = models.Team(
        name=name,
        slug=slug,
        description=(req.description or "").strip() or None,
        owner_id=user.id,
    )
    db.add(team)
    db.commit()
    db.refresh(team)
    return _team_view(team, "owner")


@router.get("/{team_id}")
def get_team(
    team_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")
    role = _ensure_member(team, user)
    members = [_member_view(m) for m in team.members]
    if team.owner_id == user.id and not any(m.user_id == user.id for m in team.members):
        members.insert(
            0,
            {
                "user_id": team.owner_id,
                "email": user.email,
                "display_name": user.display_name,
                "avatar_color": user.avatar_color,
                "role": "owner",
                "joined_at": team.created_at.isoformat(),
            },
        )
    return _team_view(team, role) | {"members": members}


@router.patch("/{team_id}")
def update_team(
    team_id: str,
    req: UpdateTeamRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")
    _ensure_owner(team, user)
    if req.name is not None:
        name = req.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="团队名不能为空")
        team.name = name
    if req.description is not None:
        team.description = req.description.strip() or None
    db.commit()
    db.refresh(team)
    return _team_view(team, "owner")


@router.delete("/{team_id}")
def delete_team(
    team_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")
    _ensure_owner(team, user)
    if team.projects:
        raise HTTPException(status_code=400, detail="请先转移或删除团队下的项目")
    db.delete(team)
    db.commit()
    return {"id": team_id, "deleted": True}


@router.post("/{team_id}/members")
def add_member(
    team_id: str,
    req: AddMemberRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")
    _ensure_owner_or_admin(team, user)

    invitee = db.query(models.User).filter(models.User.email == req.email.lower()).first()
    if not invitee:
        raise HTTPException(status_code=404, detail="该邮箱未注册")

    if invitee.id == team.owner_id:
        raise HTTPException(status_code=400, detail="不能重复添加 owner")
    existing = (
        db.query(models.TeamMember)
        .filter_by(team_id=team.id, user_id=invitee.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="该成员已在团队中")

    m = models.TeamMember(team_id=team.id, user_id=invitee.id, role=req.role)
    db.add(m)
    db.commit()
    db.refresh(m)
    return _member_view(m)


@router.patch("/{team_id}/members/{user_id}")
def update_member_role(
    team_id: str,
    user_id: str,
    req: UpdateMemberRoleRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")
    if user_id == team.owner_id:
        raise HTTPException(status_code=400, detail="不能修改 owner 角色")
    _ensure_owner_or_admin(team, user)

    m = (
        db.query(models.TeamMember)
        .filter_by(team_id=team.id, user_id=user_id)
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="成员不存在")
    m.role = req.role
    db.commit()
    db.refresh(m)
    return _member_view(m)


@router.delete("/{team_id}/members/{user_id}")
def remove_member(
    team_id: str,
    user_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")
    if user_id == team.owner_id:
        raise HTTPException(status_code=400, detail="不能移除 owner")
    is_self = user_id == user.id
    if not is_self:
        _ensure_owner_or_admin(team, user)

    m = (
        db.query(models.TeamMember)
        .filter_by(team_id=team.id, user_id=user_id)
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="成员不存在")
    db.delete(m)
    db.commit()
    return {"team_id": team.id, "user_id": user_id, "removed": True}