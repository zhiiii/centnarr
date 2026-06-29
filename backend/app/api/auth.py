"""认证相关 API。"""

from __future__ import annotations

import re
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.security import (
    clear_session_cookie,
    get_current_user,
    hash_password,
    make_token,
    set_session_cookie,
    verify_password,
)
from app.db import models
from app.db.session import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def _validate_email(email: str) -> str:
    email = email.strip().lower()
    if not EMAIL_RE.match(email) or len(email) > 254:
        raise HTTPException(status_code=400, detail="邮箱格式不正确")
    return email


def _validate_password(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="密码至少 8 位")
    if len(password) > 128:
        raise HTTPException(status_code=400, detail="密码过长")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="密码需包含字母和数字")


AVATAR_COLORS = [
    "#5E6AD2", "#22A06B", "#AD48DD", "#D99642", "#D96666",
    "#5BA8D9", "#8B6F47", "#9C4A8E", "#3B7DD8", "#6E7AD6",
]


def _pick_avatar_color() -> str:
    return secrets.choice(AVATAR_COLORS)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserView(BaseModel):
    id: str
    email: str
    display_name: str
    avatar_color: str
    created_at: str


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    avatar_color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=128)


class AuthResponse(BaseModel):
    user: UserView


def _to_view(u: models.User) -> UserView:
    return UserView(
        id=u.id,
        email=u.email,
        display_name=u.display_name,
        avatar_color=u.avatar_color,
        created_at=u.created_at.isoformat(),
    )


@router.post("/register", response_model=AuthResponse)
def register(req: RegisterRequest, response: Response, db: Session = Depends(get_db)) -> dict:
    email = _validate_email(req.email)
    _validate_password(req.password)
    display_name = req.display_name.strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="昵称不能为空")

    existing = db.query(models.User).filter(models.User.email == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="该邮箱已注册")

    user = models.User(
        email=email,
        password_hash=hash_password(req.password),
        display_name=display_name,
        avatar_color=_pick_avatar_color(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = make_token(user.id, user.email)
    set_session_cookie(response, token)
    return {"user": _to_view(user).model_dump()}


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, response: Response, db: Session = Depends(get_db)) -> dict:
    email = _validate_email(req.email)
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="账号已停用")

    user.last_login_at = datetime.utcnow()
    db.commit()
    db.refresh(user)

    token = make_token(user.id, user.email)
    set_session_cookie(response, token)
    return {"user": _to_view(user).model_dump()}


@router.post("/logout")
def logout(response: Response, _user: models.User = Depends(get_current_user)) -> dict:
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserView)
def get_me(user: models.User = Depends(get_current_user)) -> dict:
    return _to_view(user).model_dump()


@router.patch("/me", response_model=UserView)
def update_me(
    req: UpdateProfileRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if req.display_name is not None:
        name = req.display_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="昵称不能为空")
        user.display_name = name
    if req.avatar_color is not None:
        user.avatar_color = req.avatar_color
    db.commit()
    db.refresh(user)
    return _to_view(user).model_dump()


@router.post("/me/password")
def change_password(
    req: ChangePasswordRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not verify_password(req.old_password, user.password_hash):
        raise HTTPException(status_code=401, detail="原密码错误")
    _validate_password(req.new_password)
    user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"ok": True}