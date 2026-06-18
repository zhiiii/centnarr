"""persistence 模块:Conversation / DocVersion / Message 的持久化辅助。

只做"保存 + 加载 doc"的薄包装。所有函数 commit 之后立即 refresh,
返回 ORM 实例供调用方继续使用。
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.db import models
from app.services import ai_engine


def get_latest_doc(conv: models.Conversation) -> dict:
    """返回 conversation 的最新 doc 字典。无 doc 时返回空 doc。"""
    if conv.doc_versions:
        latest = max(conv.doc_versions, key=lambda d: (d.round, d.created_at))
        return latest.doc or {}
    return ai_engine._empty_doc()


def save_doc_version(
    db: Session,
    conv: models.Conversation,
    doc: dict,
    delta: dict,
    round: int,
    communication_kind: str = "ai_ask",
) -> models.DocVersion:
    version = models.DocVersion(
        conversation_id=conv.id,
        round=round,
        doc=doc,
        delta=delta,
        communication_kind=communication_kind,
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return version


def save_message(
    db: Session,
    conv: models.Conversation,
    role: str,
    content: str,
    input_type: str = "text",
    meta: Optional[dict] = None,
) -> models.Message:
    msg = models.Message(
        conversation_id=conv.id,
        role=role,
        content=content,
        input_type=input_type,
        meta=meta,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg