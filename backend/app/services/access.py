"""权限辅助函数。"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db import models


def can_user_see_project(user: models.User, project: models.Project, db: Session) -> bool:
    if project.user_id == user.id:
        return True
    if project.team_id:
        if project.team.owner_id == user.id:
            return True
        m = (
            db.query(models.TeamMember)
            .filter_by(team_id=project.team_id, user_id=user.id)
            .first()
        )
        return m is not None
    return False


def can_user_write_project(user: models.User, project: models.Project, db: Session) -> bool:
    if project.user_id == user.id:
        return True
    if project.team_id:
        m = (
            db.query(models.TeamMember)
            .filter_by(team_id=project.team_id, user_id=user.id)
            .first()
        )
        if not m:
            return False
        return m.role in ("owner", "admin", "member")
    return False


def assert_project_access(user: models.User, project: models.Project, db: Session, write: bool = False) -> None:
    fn = can_user_write_project if write else can_user_see_project
    if not fn(user, project, db):
        raise HTTPException(status_code=403, detail="无权访问此项目")


def can_user_see_requirement(user: models.User, requirement: models.Requirement, db: Session) -> bool:
    if requirement.project:
        return can_user_see_project(user, requirement.project, db)
    conv = requirement.conversation
    return conv.user_id == user.id


def assert_requirement_access(user: models.User, requirement: models.Requirement, db: Session) -> None:
    if not can_user_see_requirement(user, requirement, db):
        raise HTTPException(status_code=403, detail="无权访问此需求")


def can_user_see_conversation(user: models.User, conv: models.Conversation, db: Session) -> bool:
    if conv.user_id == user.id:
        return True
    if conv.project_id:
        p = db.get(models.Project, conv.project_id)
        if p and can_user_see_project(user, p, db):
            return True
    return False


def assert_conversation_access(user: models.User, conv: models.Conversation, db: Session) -> None:
    if not can_user_see_conversation(user, conv, db):
        raise HTTPException(status_code=403, detail="无权访问此对话")