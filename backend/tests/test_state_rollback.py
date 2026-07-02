"""测试 stream 失败时状态会回滚到上一个合法态。

bug: 之前 post_respond_stream 调 LLM 前就把 answering 状态 commit 了,
    stream 异常/timeout/client abort 时状态永远卡在 answering,
    下次 respond 直接 400 'Cannot respond in state answering'。

fix: 在 commit 前记录 previous_state/previous_round,
     event_generator 失败 + timeout_wrapped 超时分支都调用 _rollback。
"""

import pytest
from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.db import models
from app.db.session import SessionLocal


@pytest.fixture
def client():
    from app.main import app
    with TestClient(app) as c:
        yield c
    with SessionLocal() as s:
        s.query(models.Conversation).filter(
            models.Conversation.user_id.in_(
                s.query(models.User.id).filter(models.User.email == "test_rb@x.com")
            )
        ).delete(synchronize_session=False)
        s.query(models.User).filter(models.User.email == "test_rb@x.com").delete(synchronize_session=False)
        s.commit()


def _register(client):
    r = client.post(
        "/api/auth/register",
        json={"email": "test_rb@x.com", "password": "Passw0rd!", "display_name": "RB"},
    )
    assert r.status_code == 200


def _create_asking_conversation(client):
    r = client.post("/api/conversation/start", json={})
    conv_id = r.json()["conversation_id"]

    with SessionLocal() as s:
        conv = s.get(models.Conversation, conv_id)
        conv.state = "asking"
        s.commit()
    return conv_id


def _state(conv_id: str) -> str:
    with SessionLocal() as s:
        c = s.get(models.Conversation, conv_id)
        return c.state


def _patch_safe_llm(monkeypatch, routes_mod):
    """info_integration + question_generation 走兜底,只让 LLM stream 抛异常用。"""

    async def ok_call(*args, **kwargs):
        return {
            "delta": {"added": [], "modified": [], "confirmed": [], "product_perspective": ""},
            "updated_doc": {},
            "user_facing_summary": "我把你说的记下了。",
            "completion_percentage": 0,
            "should_continue": True,
            "product_manager_inference": "",
        }

    async def ok_qg(*args, **kwargs):
        return {"questions": [], "emotional_care": None}

    monkeypatch.setattr(routes_mod.ai_engine, "call_info_integration", ok_call)
    monkeypatch.setattr(routes_mod.ai_engine, "call_question_generation", ok_qg)


def test_rollback_on_stream_exception(client, monkeypatch):
    """stream_question_text 抛异常时,事件生成器捕获后必须回滚到 asking。"""
    _register(client)
    conv_id = _create_asking_conversation(client)
    assert _state(conv_id) == "asking"

    from app.api import routes as routes_mod

    _patch_safe_llm(monkeypatch, routes_mod)

    async def boom_q(*args, **kwargs):
        raise RuntimeError("simulated LLM crash")
        yield  # 让它成为 async generator

    monkeypatch.setattr(routes_mod.ai_engine, "stream_question_text", boom_q)

    r = client.post(
        "/api/conversation/respond/stream",
        json={"conversation_id": conv_id, "content": "随便说一句"},
    )
    body = r.text
    assert "error" in body.lower()
    assert _state(conv_id) == "asking", f"状态应该回滚到 asking,实际 {_state(conv_id)}"


def test_rollback_on_stream_timeout(client, monkeypatch):
    """stream idle timeout 时必须回滚状态。"""
    _register(client)
    conv_id = _create_asking_conversation(client)

    from app.api import routes as routes_mod

    _patch_safe_llm(monkeypatch, routes_mod)

    async def hang_q(*args, **kwargs):
        import asyncio
        await asyncio.sleep(60)
        if False:
            yield ""

    monkeypatch.setattr(routes_mod.ai_engine, "stream_question_text", hang_q)
    monkeypatch.setattr(routes_mod, "STREAM_TIMEOUT_SECONDS", 3)

    r = client.post(
        "/api/conversation/respond/stream",
        json={"conversation_id": conv_id, "content": "再发一条"},
    )
    body = r.text
    assert "error" in body.lower()
    assert _state(conv_id) == "asking", f"超时后状态应回滚到 asking,实际 {_state(conv_id)}"


def test_rollback_on_second_respond_after_error(client, monkeypatch):
    """回滚后,用户可以再发一条新消息而不被 400 拒绝。"""
    _register(client)
    conv_id = _create_asking_conversation(client)

    from app.api import routes as routes_mod

    _patch_safe_llm(monkeypatch, routes_mod)

    async def boom_q(*args, **kwargs):
        raise RuntimeError("crash once")
        yield

    monkeypatch.setattr(routes_mod.ai_engine, "stream_question_text", boom_q)
    r = client.post(
        "/api/conversation/respond/stream",
        json={"conversation_id": conv_id, "content": "第 1 条"},
    )
    assert "error" in r.text.lower()

    assert _state(conv_id) == "asking"

    # 恢复:再发一条,这次 LLM 不挂
    monkeypatch.undo()
    _patch_safe_llm(monkeypatch, routes_mod)

    async def ok_q(*args, **kwargs):
        if False:
            yield {}
        return
        yield  # pragma: no cover

    async def ok_stream(*args, **kwargs):
        yield {"type": "delta", "content": "x"}
        yield {"type": "done"}

    monkeypatch.setattr(routes_mod.ai_engine, "stream_question_text", ok_stream)

    r = client.post(
        "/api/conversation/respond/stream",
        json={"conversation_id": conv_id, "content": "第 2 条"},
    )
    assert r.status_code == 200, f"第 2 条 respond 应成功,实际 {r.status_code}: {r.text[:200]}"


def test_400_on_stuck_answering(client):
    """如果状态已经卡在 answering(模拟历史遗留),仍要 400 而不是 500。"""
    _register(client)
    conv_id = _create_asking_conversation(client)

    with SessionLocal() as s:
        c = s.get(models.Conversation, conv_id)
        c.state = "answering"
        s.commit()

    r = client.post(
        "/api/conversation/respond/stream",
        json={"conversation_id": conv_id, "content": "卡了再发"},
    )
    assert r.status_code == 400
    assert "answering" in r.json()["detail"]