from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def _column_exists(engine: Engine, table: str, column: str) -> bool:
    with engine.connect() as conn:
        if engine.dialect.name == "sqlite":
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            return any(r[1] == column for r in rows)
        else:
            rows = conn.execute(
                text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_name=:t AND column_name=:c"
                ),
                {"t": table, "c": column},
            ).fetchall()
            return bool(rows)


def _table_exists(engine: Engine, table: str) -> bool:
    with engine.connect() as conn:
        if engine.dialect.name == "sqlite":
            rows = conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' AND name=:t"),
                {"t": table},
            ).fetchall()
            return bool(rows)
        else:
            rows = conn.execute(
                text("SELECT 1 FROM information_schema.tables WHERE table_name=:t"),
                {"t": table},
            ).fetchall()
            return bool(rows)


def run_migrations(engine: Engine) -> None:
    """Idempotent schema migrations for new columns/tables added after MVP1.0."""
    from app.db import models  # noqa: F401
    from app.db.session import Base, SessionLocal
    from app.db.models import Project

    Base.metadata.create_all(bind=engine)

    with engine.begin() as conn:
        if _table_exists(engine, "requirements") and not _column_exists(engine, "requirements", "project_id"):
            logger.info("migration: add requirements.project_id")
            conn.execute(text("ALTER TABLE requirements ADD COLUMN project_id VARCHAR"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_requirements_project_id ON requirements(project_id)"))

        if _table_exists(engine, "conversations") and not _column_exists(engine, "conversations", "project_id"):
            logger.info("migration: add conversations.project_id")
            conn.execute(text("ALTER TABLE conversations ADD COLUMN project_id VARCHAR"))

        if _table_exists(engine, "prds") and not _column_exists(engine, "prds", "spec_content"):
            logger.info("migration: add prds.spec_content / spec_version / spec_updated_at")
            conn.execute(text("ALTER TABLE prds ADD COLUMN spec_content TEXT"))
            conn.execute(text("ALTER TABLE prds ADD COLUMN spec_version VARCHAR(20)"))
            conn.execute(text("ALTER TABLE prds ADD COLUMN spec_updated_at DATETIME"))

        if _table_exists(engine, "projects") and not _column_exists(engine, "projects", "team_id"):
            logger.info("migration: add projects.team_id")
            conn.execute(text("ALTER TABLE projects ADD COLUMN team_id VARCHAR"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_projects_team_id ON projects(team_id)"))

    _migrate_anonymous_data(engine)


def _migrate_anonymous_data(engine) -> None:
    """把 user_id='anonymous' 的旧数据迁移到默认账号。

    启动时检查：如果用户表为空且有匿名数据,自动创建一个 default@local 账号并归并。
    """
    from sqlalchemy.orm import Session
    from app.core.security import hash_password
    from app.db import models

    with Session(engine) as s:
        has_user = s.query(models.User).count() > 0
        if has_user:
            return

        anon_count = s.query(models.Conversation).filter_by(user_id="anonymous").count()
        if anon_count == 0:
            return

        existing_default = s.query(models.User).filter_by(email="default@local").first()
        if existing_default:
            default = existing_default
        else:
            default = models.User(
                email="default@local",
                password_hash=hash_password("default-migrate-password-change-me"),
                display_name="Default Account (迁移数据)",
                avatar_color="#5E6AD2",
            )
            s.add(default)
            s.flush()

        s.query(models.Conversation).filter_by(user_id="anonymous").update(
            {"user_id": default.id}
        )
        s.query(models.Project).filter_by(user_id="anonymous").update(
            {"user_id": default.id}
        )
        s.commit()
        logger.warning(
            "migration: %d 条匿名对话/项目已归并到 default@local, 请尽快登录并修改密码",
            anon_count,
        )

    db = SessionLocal()
    try:
        default_project = db.query(Project).filter(Project.name == "默认项目").first()
        if not default_project:
            default_project = Project(name="默认项目", description="迁移前自动创建的默认项目")
            db.add(default_project)
            db.commit()
            db.refresh(default_project)
            logger.info("migration: created default project id=%s", default_project.id)

        updated = db.execute(
            text("UPDATE requirements SET project_id = :pid WHERE project_id IS NULL"),
            {"pid": default_project.id},
        )
        if updated.rowcount:
            logger.info("migration: backfilled %d requirements with default project", updated.rowcount)
            db.commit()
    finally:
        db.close()
