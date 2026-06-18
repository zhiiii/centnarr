from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.utcnow()


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String, default="anonymous")
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    state: Mapped[str] = mapped_column(String(50), default="idle")
    current_round: Mapped[int] = mapped_column(Integer, default=0)
    completion: Mapped[int] = mapped_column(Integer, default=0)
    project_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("projects.id"), nullable=True)
    last_active_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    messages: Mapped[list["Message"]] = relationship(back_populates="conversation", cascade="all, delete-orphan")
    doc_versions: Mapped[list["DocVersion"]] = relationship(back_populates="conversation", cascade="all, delete-orphan")
    requirement: Mapped[Optional["Requirement"]] = relationship(back_populates="conversation", cascade="all, delete-orphan", uselist=False)
    project: Mapped[Optional["Project"]] = relationship()


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    conversation_id: Mapped[str] = mapped_column(String, ForeignKey("conversations.id"))
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    input_type: Mapped[str] = mapped_column(String(20), default="text")
    meta: Mapped[Optional[dict]] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class DocVersion(Base):
    __tablename__ = "doc_versions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    conversation_id: Mapped[str] = mapped_column(String, ForeignKey("conversations.id"))
    round: Mapped[int] = mapped_column(Integer, default=0)
    doc: Mapped[dict] = mapped_column(JSON)
    delta: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    communication_kind: Mapped[str] = mapped_column(String(20), default="ai_ask")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    conversation: Mapped[Conversation] = relationship(back_populates="doc_versions")


class Requirement(Base):
    __tablename__ = "requirements"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    conversation_id: Mapped[str] = mapped_column(String, ForeignKey("conversations.id"), unique=True)
    project_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("projects.id"), nullable=True)
    confirmed_doc: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(50), default="confirmed")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    conversation: Mapped[Conversation] = relationship(back_populates="requirement")
    project: Mapped[Optional["Project"]] = relationship(back_populates="requirements")
    prds: Mapped[list["Prd"]] = relationship(back_populates="requirement", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    user_id: Mapped[str] = mapped_column(String, default="anonymous")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    requirements: Mapped[list["Requirement"]] = relationship(back_populates="project")


class Prd(Base):
    __tablename__ = "prds"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    requirement_id: Mapped[str] = mapped_column(String, ForeignKey("requirements.id"))
    content: Mapped[str] = mapped_column(Text)
    version: Mapped[str] = mapped_column(String(20), default="v1.0")
    acceptance_state: Mapped[Optional[dict]] = mapped_column(JSON, default=dict, nullable=True)
    spec_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    spec_version: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    spec_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=_now, onupdate=_now)

    requirement: Mapped[Requirement] = relationship(back_populates="prds")