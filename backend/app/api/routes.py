from __future__ import annotations

import asyncio
import copy
import json
import logging
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.state_machine import (
    COMPLETION_THRESHOLD,
    MAX_TO_CONFIRM,
    ConversationState,
    StateMachine,
    calc_completion,
)
from app.db import models
from app.db.session import get_db
from app.schemas.models import (
    ConfirmRequest,
    ConfirmResponse,
    ConversationView,
    DocEditRequest,
    DocEditResponse,
    DocView,
    ExportRequest,
    ExportResponse,
    MessageRequest,
    MessageTurn,
    PrdAcceptanceRequest,
    PrdAcceptanceResponse,
    PrdEditRequest,
    PrdEditResponse,
    PrdResponse,
    ProjectAssignRequest,
    ProjectCreateRequest,
    ProjectDetailResponse,
    ProjectResponse,
    ProjectUpdateRequest,
    QuestionGeneration,
    QuestionItem,
    RequirementListItem,
    RequirementListResponse,
    RespondRequest,
    SceneAnalysis,
    SpecResponse,
    StartConversationRequest,
    StartConversationResponse,
    UploadResponse,
)
from app.services import ai_engine
from app.services import conversation_orchestrator, doc_factory, persistence, sse
from app.utils import doc_path as doc_path_utils

logger = logging.getLogger(__name__)

STREAM_TIMEOUT_SECONDS = 90

router = APIRouter(prefix="/api")

UPLOAD_ROOT = Path("/tmp/centnarr_uploads")
ALLOWED_MIME_TYPES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "text/plain": "txt",
    "application/json": "json",
}
MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5MB


def _get_latest_doc(conv: models.Conversation) -> dict:
    return persistence.get_latest_doc(conv)


def _save_doc_version(
    db: Session,
    conv: models.Conversation,
    doc: dict,
    delta: dict,
    round: int,
    communication_kind: str = "ai_ask",
) -> models.DocVersion:
    return persistence.save_doc_version(
        db, conv, doc, delta, round, communication_kind
    )


def _save_message(
    db: Session,
    conv: models.Conversation,
    role: str,
    content: str,
    input_type: str = "text",
    meta: Optional[dict] = None,
) -> models.Message:
    return persistence.save_message(
        db, conv, role, content, input_type, meta
    )


def _ai_message_meta(questions: list[dict], emotional_care: Optional[str]) -> dict:
    return doc_factory.ai_message_meta(questions, emotional_care)


def _format_ai_response(qg: dict) -> str:
    return doc_factory.format_ai_response(qg)


def _fallback_prd(confirmed_doc: dict) -> str:
    return doc_factory.fallback_prd(confirmed_doc)


def _set_field_by_path(doc: dict, field_path: str, value: Any) -> Any:
    return doc_path_utils.set_field_by_path(doc, field_path, value)


def _bump_prd_version(current: str) -> str:
    return doc_path_utils.bump_prd_version(current)


def _derive_to_confirm(doc: dict) -> list[str]:
    return doc_path_utils.derive_to_confirm(doc)


def _sse_delta(content: str) -> str:
    return sse.sse_delta(content)


def _sse_error(message: str) -> str:
    return sse.sse_error(message)


def _sse_state(state: str) -> str:
    return sse.sse_state(state)


def _sse_event(payload: dict) -> str:
    return sse.sse_event(payload)


def _sse_done(payload: dict) -> str:
    return sse.sse_done(payload)


def _stringify_delta_value(v):
    if v is None or isinstance(v, str):
        return v
    if isinstance(v, (int, float, bool)):
        return str(v)
    if isinstance(v, dict):
        desc = v.get("description") or v.get("content") or v.get("name")
        if desc:
            extras = []
            for k in ("frequency", "severity", "example", "responsibility", "explicit"):
                if v.get(k) is not None:
                    extras.append(f"{k}：{v.get(k)}")
            return f"{desc}" + (f"（{'；'.join(extras)}）" if extras else "")
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list):
        return "；".join(_stringify_delta_value(x) or "" for x in v)
    return str(v)


def _normalize_delta(delta):
    if not isinstance(delta, dict):
        return delta
    out = dict(delta)
    for key in ("added", "modified", "confirmed", "edited"):
        items = out.get(key)
        if not isinstance(items, list):
            continue
        normalized = []
        for it in items:
            if not isinstance(it, dict):
                normalized.append(it)
                continue
            nit = dict(it)
            for f in ("content", "before", "after"):
                if f in nit:
                    nit[f] = _stringify_delta_value(nit[f])
            normalized.append(nit)
        out[key] = normalized
    return out


def _serialize_conversation(
    db: Session, conv: models.Conversation, include_messages: bool = True
) -> dict:
    messages = []
    if include_messages:
        for m in conv.messages:
            messages.append(
                MessageTurn(
                    role=m.role,
                    content=m.content,
                    input_type=m.input_type,
                    meta=m.meta,
                    created_at=m.created_at.isoformat(),
                ).model_dump()
            )

    latest_doc = _get_latest_doc(conv)

    cards = []
    for dv in conv.doc_versions:
        cards.append(
            {
                "id": dv.id,
                "round": dv.round,
                "communication_kind": dv.communication_kind,
                "created_at": dv.created_at.isoformat(),
                "delta": _normalize_delta(dv.delta) if dv.delta else None,
            }
        )

    has_prd = bool(conv.requirement and conv.requirement.prds)
    return ConversationView(
        conversation_id=conv.id,
        state=conv.state,
        title=conv.title,
        current_round=conv.current_round,
        completion=conv.completion,
        messages=messages,
        doc=DocView(**latest_doc),
        communication_cards=cards,
        has_prd=has_prd,
        requirement_id=conv.requirement.id if conv.requirement else None,
        requirement_status=conv.requirement.status if conv.requirement else None,
    ).model_dump()


def _get_latest_doc(conv: models.Conversation) -> dict:
    return persistence.get_latest_doc(conv)


@router.post("/conversation/start", response_model=StartConversationResponse)
async def start_conversation(req: StartConversationRequest, db: Session = Depends(get_db)) -> dict:
    project_id: Optional[str] = None
    if req.project_id:
        p = db.get(models.Project, req.project_id)
        if not p:
            raise HTTPException(status_code=404, detail="Project not found")
        project_id = p.id
    conv = models.Conversation(user_id=req.user_id, project_id=project_id)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return StartConversationResponse(
        conversation_id=conv.id,
        state=conv.state,
        title=conv.title,
        created_at=conv.created_at.isoformat(),
    ).model_dump()


@router.get("/conversation/{conversation_id}", response_model=ConversationView)
async def get_conversation(conversation_id: str, db: Session = Depends(get_db)) -> dict:
    conv = db.get(models.Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return _serialize_conversation(db, conv)


@router.post("/conversation/message/stream")
async def post_message_stream(req: MessageRequest, request: Request, db: Session = Depends(get_db)):
    """SSE 流式版本（单端点 + 内部流，并行 LLM 调用）：
    state=answering → 并行启动 scene_identification + stream_question_text → 流式开场白 →
    questions event → state=asking → done。

    优化：scene_identification 和 stream_question_text 并行执行，首字延迟 = max(LLM_TTFB)。

    事件格式:
      - {"type": "state", "state": "answering/integrating/asking"}  多个，状态机变化
      - {"type": "delta", "content": "..."}                          多个，逐字开场白
      - {"type": "questions", "questions":[...], "emotional_care":"..."}  一次：解析后的反问
      - {"type": "scene_analysis", "scene_analysis": {...}}          可选：场景识别完成后
      - {"type": "error", "message": "..."}                          出错时
      - {"type": "done", ...}                                        流末尾，含 doc / state
    """
    conv = db.get(models.Conversation, req.conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    sm = StateMachine(state=conv.state, round=conv.current_round, completion=conv.completion)
    if sm.state not in (ConversationState.IDLE, ConversationState.SCENE_IDENTIFYING):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot post first message in state {sm.state}",
        )

    sm.transition("first_message")
    _save_message(
        db, conv, role="user", content=req.content, input_type=req.input_type, meta=req.meta
    )

    if sm.state == ConversationState.IDLE or sm.state == ConversationState.SCENE_IDENTIFYING:
        sm.transition("scene_identified")

    conv_id = conv.id

    async def event_generator():
        try:
            from app.services.intent_check import check_relevance, build_refusal_message

            yield _sse_state("answering")

            intent = check_relevance(
                req.content,
                context_summary=conv.title or "",
                recent_user_messages=[],
            )
            if not intent.relevant:
                refusal = build_refusal_message(intent.reason, conv.title or "")
                _save_message(
                    db, conv, role="assistant", content=refusal, meta={"intent_refusal": True},
                )
                from sqlalchemy import update as sa_update
                db.execute(
                    sa_update(models.Conversation)
                    .where(models.Conversation.id == conv.id)
                    .values(state="asking")
                )
                db.commit()
                yield _sse_event({
                    "type": "intent_refusal",
                    "message": refusal,
                    "reason": intent.reason,
                    "confidence": intent.confidence,
                })
                yield _sse_done({"state": "asking", "intent_refused": True})
                return
            yield _sse_state("integrating")

            # 并行启动 scene_identification 和 stream_question_text
            async def scene_task():
                try:
                    return await ai_engine.call_scene_identification(req.content), None
                except Exception as e:
                    logger.exception("Scene identification failed: %s", e)
                    return None, f"场景识别失败：{_truncate(str(e))}"

            scene_coro = scene_task()
            question_coro = ai_engine.stream_question_text(
                {},  # scene_analysis 暂为空，LLM 会基于 dialogue history 推断
                [{"role": "user", "content": req.content}],
                sm.round,
            )

            ai_text_parts: list[str] = []
            questions_event: dict = {}
            questions_event_emitted = False
            scene_analysis: dict = {}
            scene_error: str | None = None

            scene_task_obj = asyncio.create_task(scene_coro)

            try:
                async for event in question_coro:
                    if await request.is_disconnected():
                        logger.info("client disconnected, stopping stream")
                        scene_task_obj.cancel()
                        return
                    if event.get("type") == "delta":
                        content = event.get("content") or ""
                        if content:
                            ai_text_parts.append(content)
                            yield _sse_delta(content)
                    elif event.get("type") == "questions":
                        questions_event = event
                        questions_event_emitted = True
                        parsed_qs = event.get("questions") or []
                        yield _sse_event({
                            "type": "questions",
                            "questions": parsed_qs,
                            "emotional_care": event.get("emotional_care"),
                        })
                    elif event.get("type") == "error":
                        yield _sse_error(event.get("message") or "反问生成失败")
                        return
            except Exception as e:
                logger.exception("Stream question text failed: %s", e)
                yield _sse_error(f"流式输出失败：{_truncate(str(e))}")
                return

            scene_result, scene_err = await scene_task_obj
            if scene_err:
                scene_error = scene_err
            else:
                scene_analysis = scene_result or {}

            if scene_error and not questions_event_emitted:
                yield _sse_error(scene_error)
                return

            # 如果之前 scene_analysis 是空的，stream_question_text 没用到 scene 数据
            # 现在 scene 数据到了，yield 给前端作为参考
            if scene_analysis:
                yield _sse_event({"type": "scene_analysis", "scene_analysis": scene_analysis})

            yield _sse_state("asking")

            initial_doc = {
                "scene": scene_analysis.get("scene", ""),
                "background": req.content[:120],
                "roles": scene_analysis.get("roles", []),
                "pain_points": scene_analysis.get("pain_points", []),
                "expected_outcomes": scene_analysis.get("expected_outcomes", []),
                "key_scenarios": [],
                "to_confirm": [
                    "出错类型",
                    "出错处理流程",
                    "责任方",
                    "期望效果",
                    "发生频率",
                ],
            }
            completion = calc_completion(initial_doc)
            initial_doc["to_confirm"] = _derive_to_confirm(initial_doc)

            qg = {
                "questions": questions_event.get("questions") or [],
                "emotional_care": questions_event.get("emotional_care"),
                "should_continue": questions_event.get("should_continue", True),
                "reason_to_continue": questions_event.get("reason_to_continue"),
            }

            # Fallback: 如果流式没出 questions，调用 call_question_generation 兜底（基于完整 scene_analysis）
            if not qg["questions"] and scene_analysis:
                try:
                    fallback_qg = await ai_engine.call_question_generation(
                        scene_analysis,
                        [{"role": "user", "content": req.content}],
                        sm.round,
                    )
                    if fallback_qg.get("questions"):
                        qg = {
                            "questions": fallback_qg["questions"],
                            "emotional_care": fallback_qg.get("emotional_care"),
                            "should_continue": fallback_qg.get("should_continue", True),
                            "reason_to_continue": fallback_qg.get("reason_to_continue", "流式 fallback"),
                        }
                        yield _sse_event({
                            "type": "questions",
                            "questions": qg["questions"],
                            "emotional_care": qg["emotional_care"],
                        })
                except Exception as e:
                    logger.exception("Fallback question generation failed: %s", e)

            ai_text = "".join(ai_text_parts).strip()
            if not questions_event_emitted:
                ai_text = ai_text or _format_ai_response(qg)
            else:
                ai_text = ai_text or f"我把你说的整理成\"{scene_analysis.get('scene','') or '需求'}\"了，问你几个关键问题。"

            # 用 fresh session 写 DB
            from app.db.session import SessionLocal
            with SessionLocal() as fresh_db:
                fresh_conv = fresh_db.get(models.Conversation, conv_id)
                if fresh_conv:
                    _save_doc_version(
                        fresh_db,
                        fresh_conv,
                        doc=initial_doc,
                        delta={
                            "added": [
                                {
                                    "field": "scene",
                                    "content": initial_doc["scene"],
                                    "source": "业务人员第 1 轮",
                                }
                            ],
                            "modified": [],
                            "confirmed": [],
                        },
                        round=sm.round,
                        communication_kind="ai_ask",
                    )
                    fresh_conv.state = sm.state.value
                    fresh_conv.current_round = sm.round
                    fresh_conv.completion = completion
                    fresh_conv.title = ai_engine._generate_title(
                        scene_analysis.get("scene", ""), req.content
                    )

                    _save_message(
                        fresh_db,
                        fresh_conv,
                        role="assistant",
                        content=ai_text,
                        input_type="text",
                        meta=_ai_message_meta(qg.get("questions", []), qg.get("emotional_care")),
                    )
                    fresh_db.commit()

            final_payload = {
                "state": sm.state.value,
                "round": sm.round,
                "scene_analysis": scene_analysis,
                "questions": qg,
                "doc": initial_doc,
                "completion": completion,
                "user_facing_summary": f"我把你说的整理成\"{scene_analysis.get('scene','') or '需求'}\"了，问你几个关键问题。",
            }

            yield _sse_done(final_payload)
        except Exception as e:
            logger.exception("event_generator crashed: %s", e)
            yield _sse_error(f"流式端点异常：{_truncate(str(e))}")

    async def timeout_wrapped():
        try:
            async for chunk in _stream_with_timeout(event_generator(), STREAM_TIMEOUT_SECONDS):
                yield chunk
        except asyncio.TimeoutError:
            logger.warning("stream timeout (%ss)", STREAM_TIMEOUT_SECONDS)
            yield _sse_error(f"AI 想得有点久（>{STREAM_TIMEOUT_SECONDS}s），已经自动取消，点这里重试")

    return StreamingResponse(timeout_wrapped(), media_type="text/event-stream")


async def _stream_with_timeout(gen, timeout_s: float):
    """真正的流式超时：每个 chunk 单独 timeout，不 buffer 整个流。"""
    last_yield = asyncio.get_event_loop().time()
    try:
        async for chunk in gen:
            now = asyncio.get_event_loop().time()
            if now - last_yield > timeout_s:
                logger.warning("stream idle timeout (%ss since last chunk)", timeout_s)
                yield _sse_error(f"AI 长时间没动静（>{timeout_s:.0f}s），已经自动取消，点这里重试")
                return
            last_yield = now
            yield chunk
    except asyncio.CancelledError:
        logger.info("stream cancelled")
        raise


@router.post("/conversation/respond/stream")
async def post_respond_stream(req: RespondRequest, request: Request, db: Session = Depends(get_db)):
    """SSE 流式版本（单端点 + 内部流）：
    state=answering → 直接流式 LLM token（反问式总结 + 整合 JSON，1 次 LLM 调用）
    → state=asking → done。

    事件格式:
      - {"type": "state", "state": "..."}                            状态机变化
      - {"type": "delta", "content": "..."}                           反问式总结逐字流式
      - {"type": "integration", "delta":{...}, "updated_doc":{...}}   一次：解析后的整合 JSON
      - {"type": "questions", "questions":[...]}                       一次：可能的新反问
      - {"type": "error", "message": "..."}                           出错时
      - {"type": "done", ...}                                         流末尾
    """
    conv = db.get(models.Conversation, req.conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    sm = StateMachine(state=conv.state, round=conv.current_round, completion=conv.completion)
    if sm.state not in (ConversationState.ASKING, ConversationState.INTEGRATING):
        raise HTTPException(status_code=400, detail=f"Cannot respond in state {sm.state}")

    sm.transition("user_answered")
    _save_message(
        db, conv, role="user", content=req.content, input_type=req.input_type, meta=req.meta
    )

    # 立即把 ANSWERING 状态保存到 DB
    conv.state = sm.state.value
    db.commit()

    previous_doc = _get_latest_doc(conv)
    last_assistant = (
        db.query(models.Message)
        .filter_by(conversation_id=conv.id, role="assistant")
        .order_by(models.Message.created_at.desc())
        .first()
    )
    last_questions = (last_assistant.meta or {}).get("questions", []) if last_assistant else []
    is_async = req.is_async_supplement or ai_engine.detect_async_supplement(req.content)

    recent_user_msgs = [
        m.content for m in (
            db.query(models.Message)
            .filter_by(conversation_id=conv.id, role="user")
            .order_by(models.Message.created_at.desc())
            .limit(3)
        )
    ]

    conv_id = conv.id

    async def event_generator():
        try:
            from app.services.intent_check import check_relevance, build_refusal_message

            yield _sse_state("answering")

            context_summary = conv.title or ""
            if previous_doc:
                scene = (previous_doc.get("scene") or "").strip()
                if scene:
                    context_summary = f"{context_summary} {scene}" if context_summary else scene
                bg = (previous_doc.get("background") or "").strip()
                if bg:
                    context_summary = f"{context_summary} {bg}" if context_summary else bg

            intent = check_relevance(
                req.content,
                context_summary=context_summary,
                recent_user_messages=recent_user_msgs[:-1],
            )
            if not intent.relevant:
                refusal = build_refusal_message(intent.reason, conv.title or "")
                _save_message(
                    db, conv, role="assistant", content=refusal, meta={"intent_refusal": True},
                )
                db.execute(
                    sa_update(models.Conversation)
                    .where(models.Conversation.id == conv.id)
                    .values(state="asking")
                )
                db.commit()
                yield _sse_event({
                    "type": "intent_refusal",
                    "message": refusal,
                    "reason": intent.reason,
                    "confidence": intent.confidence,
                })
                yield _sse_done({"state": "asking", "intent_refused": True})
                return

            ai_text_parts: list[str] = []
            integration_event: dict = {}
            qg: dict = {}
            updated_doc: dict = {}
            final_payload: dict = {}

            try:
                integration = await ai_engine.call_info_integration(
                    previous_doc, req.content, last_questions, sm.round
                )
                if await request.is_disconnected():
                    logger.info("client disconnected, stopping stream")
                    return
                integration_event = {
                    "delta": integration.get("delta") or {},
                    "updated_doc": integration.get("updated_doc") or {},
                    "user_facing_summary": integration.get("user_facing_summary") or "",
                    "completion_percentage": integration.get("completion_percentage") or 0,
                    "should_continue": integration.get("should_continue", True),
                    "product_manager_inference": integration.get("product_manager_inference") or "",
                }
            except Exception as e:
                logger.exception("Info integration failed: %s", e)
                fb = ai_engine.fallback_integration(previous_doc, req.content)
                integration_event = {
                    "delta": fb["delta"],
                    "updated_doc": fb["updated_doc"],
                    "user_facing_summary": fb["user_facing_summary"],
                    "completion_percentage": fb["completion_percentage"],
                    "should_continue": fb["should_continue"],
                    "product_manager_inference": fb.get("product_manager_inference", ""),
                }

            yield _sse_event({
                "type": "integration",
                "delta": integration_event["delta"],
                "updated_doc": integration_event["updated_doc"],
                "completion_percentage": integration_event["completion_percentage"],
                "user_facing_summary": integration_event["user_facing_summary"],
                "product_manager_inference": integration_event["product_manager_inference"],
            })
            summary_text = integration_event["user_facing_summary"]
            if summary_text:
                yield _sse_event({"type": "summary", "text": summary_text})

            # LLM 返回：ANSWERING → INTEGRATING → ASKING（如果非异步且还有反问）
            sm.transition("llm_returned")
            updated_doc = integration_event["updated_doc"]
            updated_doc["to_confirm"] = _derive_to_confirm(updated_doc)
            sm.transition("integrated")
            sm.completion = int(integration_event["completion_percentage"])

            if sm.state == ConversationState.ASKING and not is_async:
                # 用 fresh session 取对话历史（避免 detached instance）
                from app.db.session import SessionLocal as _SL
                with _SL() as _db:
                    _msgs = (
                        _db.query(models.Message)
                        .filter_by(conversation_id=conv_id)
                        .order_by(models.Message.created_at.asc())
                        .all()
                    )
                    dialogue_history = [{"role": m.role, "content": m.content} for m in _msgs]
                questions_event_emitted = False
                try:
                    async for event in ai_engine.stream_question_text(
                        updated_doc, dialogue_history, sm.round
                    ):
                        if await request.is_disconnected():
                            logger.info("client disconnected, stopping stream")
                            return
                        if event.get("type") == "delta":
                            content = event.get("content") or ""
                            if content:
                                ai_text_parts.append(content)
                                yield _sse_delta(content)
                        elif event.get("type") == "questions":
                            questions_event_emitted = True
                            qg = {
                                "questions": event.get("questions") or [],
                                "emotional_care": event.get("emotional_care"),
                                "should_continue": event.get("should_continue", True),
                                "reason_to_continue": event.get("reason_to_continue"),
                            }
                            yield _sse_event({
                                "type": "questions",
                                "questions": qg["questions"],
                                "emotional_care": qg["emotional_care"],
                            })
                        elif event.get("type") == "error":
                            yield _sse_error(event.get("message") or "反问生成失败")
                            return
                except Exception as e:
                    logger.exception("Stream question text failed: %s", e)
                    yield _sse_error(f"流式输出失败：{_truncate(str(e))}")
                    return

                if not questions_event_emitted:
                    try:
                        fallback_qg = await ai_engine.call_question_generation(
                            updated_doc, dialogue_history, sm.round
                        )
                        if fallback_qg.get("questions"):
                            qg = {
                                "questions": fallback_qg["questions"],
                                "emotional_care": fallback_qg.get("emotional_care"),
                                "should_continue": fallback_qg.get("should_continue", True),
                                "reason_to_continue": fallback_qg.get("reason_to_continue", "流式 fallback"),
                            }
                            yield _sse_event({
                                "type": "questions",
                                "questions": qg["questions"],
                                "emotional_care": qg["emotional_care"],
                            })
                        else:
                            qg = {
                                "questions": [],
                                "emotional_care": None,
                                "should_continue": integration_event["should_continue"],
                                "reason_to_continue": "兜底",
                            }
                    except Exception as e:
                        logger.exception("Fallback question generation failed: %s", e)
                        qg = {
                            "questions": [],
                            "emotional_care": None,
                            "should_continue": integration_event["should_continue"],
                            "reason_to_continue": "兜底",
                        }
            else:
                qg = {
                    "questions": [],
                    "emotional_care": None,
                    "should_continue": integration_event["should_continue"],
                    "reason_to_continue": "异步补充，无需反问",
                }

            yield _sse_state("asking")

            # 用 fresh session 写 DB
            from app.db.session import SessionLocal
            with SessionLocal() as fresh_db:
                fresh_conv = fresh_db.get(models.Conversation, conv_id)
                if fresh_conv:
                    fresh_sm = StateMachine(
                        state=fresh_conv.state,
                        round=fresh_conv.current_round,
                        completion=fresh_conv.completion,
                    )
                    _save_doc_version(
                        fresh_db,
                        fresh_conv,
                        doc=updated_doc,
                        delta=integration_event["delta"],
                        round=sm.round,
                        communication_kind="async_supplement" if is_async else "user_supplement",
                    )
                    fresh_conv.state = sm.state.value
                    fresh_conv.current_round = sm.round
                    fresh_conv.completion = sm.completion
                    fresh_conv.title = fresh_conv.title or ai_engine._generate_title(
                        updated_doc.get("scene", ""), req.content
                    )

                    ai_text = "".join(ai_text_parts).strip() or integration_event["user_facing_summary"]
                    if qg.get("emotional_care"):
                        ai_text = qg["emotional_care"] + "\n\n" + ai_text

                    _save_message(
                        fresh_db,
                        fresh_conv,
                        role="assistant",
                        content=ai_text,
                        input_type="text",
                        meta=_ai_message_meta(qg.get("questions", []), qg.get("emotional_care")),
                    )
                    fresh_db.commit()

            final_payload = {
                "state": sm.state.value,
                "round": sm.round,
                "completion": sm.completion,
                "delta": integration_event["delta"],
                "user_facing_summary": integration_event["user_facing_summary"],
                "questions": qg.get("questions") or [],
                "emotional_care": qg.get("emotional_care"),
                "doc": updated_doc,
                "should_continue": integration_event["should_continue"],
                "product_manager_inference": integration_event.get("product_manager_inference", ""),
            }

            yield _sse_done(final_payload)
        except Exception as e:
            logger.exception("event_generator crashed: %s", e)
            yield _sse_error(f"流式端点异常：{_truncate(str(e))}")

    async def timeout_wrapped():
        try:
            async for chunk in _stream_with_timeout(event_generator(), STREAM_TIMEOUT_SECONDS):
                yield chunk
        except asyncio.TimeoutError:
            logger.warning("stream timeout (%ss)", STREAM_TIMEOUT_SECONDS)
            yield _sse_error(f"AI 想得有点久（>{STREAM_TIMEOUT_SECONDS}s），已经自动取消，点这里重试")

    return StreamingResponse(timeout_wrapped(), media_type="text/event-stream")


@router.post("/conversation/confirm", response_model=ConfirmResponse)
async def post_confirm(req: ConfirmRequest, db: Session = Depends(get_db)) -> dict:
    conv = db.get(models.Conversation, req.conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    sm = StateMachine(state=conv.state, round=conv.current_round, completion=conv.completion)
    if sm.state != ConversationState.CONFIRMING:
        sm.transition("force_confirming")
        conv.state = sm.state.value

    sm.transition("user_confirmed")

    latest_doc = _get_latest_doc(conv)
    latest_doc["to_confirm"] = _derive_to_confirm(latest_doc)

    existing = (
        db.query(models.Requirement).filter_by(conversation_id=conv.id).first()
    )
    if existing:
        existing.confirmed_doc = latest_doc
        existing.status = "confirmed"
        if conv.project_id:
            existing.project_id = conv.project_id
        requirement = existing
    else:
        requirement = models.Requirement(
            conversation_id=conv.id,
            project_id=conv.project_id,
            confirmed_doc=latest_doc,
            status="confirmed",
        )
        db.add(requirement)

    db.commit()
    db.refresh(requirement)

    conv.state = sm.state.value
    db.commit()
    db.refresh(conv)

    _save_message(
        db,
        conv,
        role="assistant",
        content="业务确认稿已签收。接下来可以生成 PRD。",
        input_type="text",
        meta={"event": "confirmed"},
    )

    return ConfirmResponse(
        conversation_id=conv.id,
        requirement_id=requirement.id,
        state=conv.state,
        doc=DocView(**latest_doc),
    ).model_dump()


@router.post("/conversation/finish")
async def post_finish(req: ConfirmRequest, db: Session = Depends(get_db)) -> dict:
    """业务人员主动结束对话：把 state 显式设为 confirming。

    对应 UI 上的"我聊够了"按钮。状态机不再因 completion >= 80 自动跳 confirming。
    """
    conv = db.get(models.Conversation, req.conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    sm = StateMachine(
        state=conv.state, round=conv.current_round, completion=conv.completion
    )
    sm.transition("force_confirming")
    conv.state = sm.state.value

    latest_doc = _get_latest_doc(conv)
    latest_doc["to_confirm"] = _derive_to_confirm(latest_doc)

    db.commit()
    db.refresh(conv)

    _save_message(
        db,
        conv,
        role="assistant",
        content="业务人员已结束对话，可以签收业务确认稿了。",
        input_type="text",
        meta={"event": "user_finished"},
    )

    return {
        "conversation_id": conv.id,
        "state": conv.state,
        "doc": DocView(**latest_doc),
        "completion": conv.completion,
    }


@router.post("/prd/generate", response_model=PrdResponse)
async def post_generate_prd(req: ConfirmRequest, db: Session = Depends(get_db)) -> dict:
    conv = db.get(models.Conversation, req.conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    requirement = (
        db.query(models.Requirement).filter_by(conversation_id=conv.id).first()
    )
    if not requirement:
        raise HTTPException(status_code=400, detail="请先签收业务确认稿")

    try:
        prd_md = await ai_engine.call_prd_translation(requirement.confirmed_doc)
    except Exception as e:
        logger.exception("PRD translation failed: %s", e)
        prd_md = _fallback_prd(requirement.confirmed_doc)

    prd = models.Prd(
        requirement_id=requirement.id,
        content=prd_md,
        version="v1.0",
    )
    db.add(prd)
    requirement.status = "prd_generated"
    db.commit()
    db.refresh(prd)

    sm = StateMachine(state=conv.state)
    sm.transition("force_confirming")  # 直达 PRD_GENERATING 前的状态
    sm.transition("user_confirmed")
    sm.transition("prd_generated")

    conv.state = sm.state.value
    db.commit()
    db.refresh(conv)

    return PrdResponse(
        prd_id=prd.id,
        requirement_id=requirement.id,
        content=prd_md,
        title=conv.title or "未命名需求",
        version=prd.version,
        created_at=prd.created_at.isoformat(),
    ).model_dump()


@router.post("/prd/{prd_id}/spec", response_model=SpecResponse)
async def generate_spec(prd_id: str, db: Session = Depends(get_db)) -> dict:
    prd = db.get(models.Prd, prd_id)
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    if prd.spec_content:
        return SpecResponse(
            prd_id=prd.id,
            spec_content=prd.spec_content,
            spec_version=prd.spec_version or "v1.0",
            updated_at=(prd.spec_updated_at or prd.updated_at or datetime.utcnow()).isoformat(),
        ).model_dump()

    try:
        spec_md = await ai_engine.call_spec_translation(prd.content)
    except Exception as e:
        logger.exception("Spec translation failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Spec 生成失败：{type(e).__name__}")

    prd.spec_content = spec_md
    prd.spec_version = "v1.0"
    prd.spec_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(prd)

    return SpecResponse(
        prd_id=prd.id,
        spec_content=spec_md,
        spec_version=prd.spec_version,
        updated_at=prd.spec_updated_at.isoformat(),
    ).model_dump()


@router.delete("/prd/{prd_id}/spec")
async def delete_spec(prd_id: str, db: Session = Depends(get_db)) -> dict:
    prd = db.get(models.Prd, prd_id)
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")
    prd.spec_content = None
    prd.spec_version = None
    prd.spec_updated_at = None
    db.commit()
    return {"prd_id": prd.id, "spec_deleted": True}


@router.post("/prd/export", response_model=ExportResponse)
async def post_export_prd(req: ExportRequest, db: Session = Depends(get_db)) -> dict:
    prd = db.get(models.Prd, req.prd_id)
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    title_match = re.search(r"# PRD[：:]\s*(.+)", prd.content)
    title = (title_match.group(1).strip() if title_match else "未命名需求")
    safe_title = re.sub(r"[\\/:*?\"<>|]", "_", title)

    if req.format == "markdown":
        version_label = (prd.version or "v1.0").strip() or "v1.0"
        filename = f"PRD_{version_label}_{safe_title}_{prd.created_at.strftime('%Y%m%d')}.md"
        return ExportResponse(filename=filename, content=prd.content, mime_type="text/markdown").model_dump()

    raise HTTPException(status_code=400, detail=f"Unsupported format: {req.format}")


@router.get("/requirements", response_model=RequirementListResponse)
async def list_requirements(
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(models.Requirement)
    if status:
        query = query.filter(models.Requirement.status == status)

    items = query.order_by(models.Requirement.updated_at.desc()).all()
    result_items: list[RequirementListItem] = []
    for req in items:
        conv = req.conversation
        title = conv.title or (req.confirmed_doc.get("scene") if req.confirmed_doc else "") or "未命名需求"
        if q and q.lower() not in title.lower() and q.lower() not in json.dumps(req.confirmed_doc, ensure_ascii=False).lower():
            continue
        result_items.append(
            RequirementListItem(
                id=req.id,
                conversation_id=conv.id,
                title=title,
                status=req.status,
                updated_at=req.updated_at.isoformat(),
            )
        )

    start = (page - 1) * page_size
    end = start + page_size
    return RequirementListResponse(
        items=result_items[start:end],
        total=len(result_items),
        page=page,
        page_size=page_size,
    ).model_dump()


@router.get("/requirement/{requirement_id}")
async def get_requirement(requirement_id: str, db: Session = Depends(get_db)) -> dict:
    req = db.get(models.Requirement, requirement_id)
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")

    prds = [
        {
            "id": p.id,
            "version": p.version,
            "content": p.content,
            "created_at": p.created_at.isoformat(),
            "acceptance_state": p.acceptance_state or {},
            "spec_content": p.spec_content,
            "spec_version": p.spec_version,
            "spec_updated_at": p.spec_updated_at.isoformat() if p.spec_updated_at else None,
        }
        for p in req.prds
    ]
    return {
        "id": req.id,
        "conversation_id": req.conversation_id,
        "project_id": req.project_id,
        "project_name": req.project.name if req.project else None,
        "title": req.conversation.title or "",
        "status": req.status,
        "confirmed_doc": req.confirmed_doc,
        "prds": prds,
        "updated_at": req.updated_at.isoformat(),
    }


@router.post("/requirement/{requirement_id}/archive")
async def archive_requirement(requirement_id: str, db: Session = Depends(get_db)) -> dict:
    req = db.get(models.Requirement, requirement_id)
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")
    if req.status == "archived":
        return {"id": req.id, "status": req.status, "updated_at": req.updated_at.isoformat()}
    req.status = "archived"
    req.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(req)
    return {"id": req.id, "status": req.status, "updated_at": req.updated_at.isoformat()}


@router.post("/requirement/{requirement_id}/unarchive")
async def unarchive_requirement(requirement_id: str, db: Session = Depends(get_db)) -> dict:
    req = db.get(models.Requirement, requirement_id)
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")
    if req.status == "archived":
        if req.prds:
            req.status = "prd_generated"
        else:
            req.status = "confirmed"
        req.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(req)
    return {"id": req.id, "status": req.status, "updated_at": req.updated_at.isoformat()}


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "ts": datetime.utcnow().isoformat()}


@router.get("/projects", response_model=list[ProjectResponse])
async def list_projects(db: Session = Depends(get_db)) -> list[dict]:
    projects = db.query(models.Project).order_by(models.Project.updated_at.desc()).all()
    out: list[dict] = []
    for p in projects:
        req_count = len(p.requirements)
        prd_count = sum(1 for r in p.requirements for _ in r.prds)
        out.append(
            ProjectResponse(
                id=p.id,
                name=p.name,
                description=p.description,
                requirement_count=req_count,
                prd_count=prd_count,
                created_at=p.created_at.isoformat(),
                updated_at=p.updated_at.isoformat(),
            ).model_dump()
        )
    return out


@router.post("/projects", response_model=ProjectResponse)
async def create_project(req: ProjectCreateRequest, db: Session = Depends(get_db)) -> dict:
    name = (req.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="项目名不能为空")
    p = models.Project(name=name, description=(req.description or "").strip() or None)
    db.add(p)
    db.commit()
    db.refresh(p)
    return ProjectResponse(
        id=p.id,
        name=p.name,
        description=p.description,
        requirement_count=0,
        prd_count=0,
        created_at=p.created_at.isoformat(),
        updated_at=p.updated_at.isoformat(),
    ).model_dump()


@router.get("/project/{project_id}", response_model=ProjectDetailResponse)
async def get_project(project_id: str, db: Session = Depends(get_db)) -> dict:
    p = db.get(models.Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    req_items: list[dict] = []
    prd_count = 0
    for r in sorted(p.requirements, key=lambda x: x.updated_at, reverse=True):
        prd_count += len(r.prds)
        req_items.append(
            {
                "id": r.id,
                "title": r.conversation.title or (r.confirmed_doc.get("scene") if r.confirmed_doc else "") or "未命名需求",
                "status": r.status,
                "updated_at": r.updated_at.isoformat(),
                "prd_count": len(r.prds),
            }
        )
    return ProjectDetailResponse(
        id=p.id,
        name=p.name,
        description=p.description,
        requirement_count=len(p.requirements),
        prd_count=prd_count,
        created_at=p.created_at.isoformat(),
        updated_at=p.updated_at.isoformat(),
        requirements=req_items,
    ).model_dump()


@router.patch("/project/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, req: ProjectUpdateRequest, db: Session = Depends(get_db)) -> dict:
    p = db.get(models.Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    if req.name is not None:
        name = req.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="项目名不能为空")
        p.name = name
    if req.description is not None:
        p.description = req.description.strip() or None
    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return ProjectResponse(
        id=p.id,
        name=p.name,
        description=p.description,
        requirement_count=len(p.requirements),
        prd_count=sum(1 for r in p.requirements for _ in r.prds),
        created_at=p.created_at.isoformat(),
        updated_at=p.updated_at.isoformat(),
    ).model_dump()


@router.delete("/project/{project_id}")
async def delete_project(project_id: str, db: Session = Depends(get_db)) -> dict:
    p = db.get(models.Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    if p.requirements:
        raise HTTPException(status_code=400, detail="该项目下还有需求，无法删除")
    db.delete(p)
    db.commit()
    return {"id": project_id, "deleted": True}


@router.post("/requirement/{requirement_id}/project")
async def assign_requirement_to_project(
    requirement_id: str, req: ProjectAssignRequest, db: Session = Depends(get_db)
) -> dict:
    r = db.get(models.Requirement, requirement_id)
    if not r:
        raise HTTPException(status_code=404, detail="Requirement not found")
    if req.project_id:
        p = db.get(models.Project, req.project_id)
        if not p:
            raise HTTPException(status_code=404, detail="Project not found")
        r.project_id = p.id
    else:
        r.project_id = None
    r.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(r)
    return {
        "id": r.id,
        "project_id": r.project_id,
        "updated_at": r.updated_at.isoformat(),
    }


def _format_ai_response(qg: dict) -> str:
    return doc_factory.format_ai_response(qg)


def _set_field_by_path(doc: dict, field_path: str, value: Any) -> Any:
    return doc_path_utils.set_field_by_path(doc, field_path, value)


@router.patch("/conversation/{conversation_id}/doc", response_model=DocEditResponse)
async def patch_conversation_doc(
    conversation_id: str,
    req: DocEditRequest,
    db: Session = Depends(get_db),
) -> dict:
    conv = db.get(models.Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    latest_version = (
        db.query(models.DocVersion)
        .filter_by(conversation_id=conv.id)
        .order_by(models.DocVersion.round.desc(), models.DocVersion.created_at.desc())
        .first()
    )

    base_doc = latest_version.doc if latest_version and latest_version.doc else ai_engine._empty_doc()
    new_doc = copy.deepcopy(base_doc)

    try:
        old_value = _set_field_by_path(new_doc, req.field_path, req.value)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"field_path 非法: {e}")

    new_doc["to_confirm"] = _derive_to_confirm(new_doc)
    new_completion = calc_completion(new_doc)

    delta = {
        "edited": [
            {
                "field": req.field_path,
                "old": old_value,
                "new": req.value,
            }
        ]
    }

    round_val = latest_version.round if latest_version else conv.current_round or 1
    new_version = _save_doc_version(
        db,
        conv,
        doc=new_doc,
        delta=delta,
        round=round_val,
        communication_kind="manual_edit",
    )

    conv.completion = new_completion
    db.commit()
    db.refresh(conv)

    return DocEditResponse(
        doc=DocView(**new_doc),
        completion=new_completion,
        version_id=new_version.id,
    ).model_dump()


@router.post("/conversation/{conversation_id}/upload", response_model=UploadResponse)
async def post_upload(
    conversation_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict:
    conv = db.get(models.Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"不支持的文件类型: {content_type or 'unknown'}，仅支持 {sorted(ALLOWED_MIME_TYPES.keys())}",
        )

    ext = ALLOWED_MIME_TYPES[content_type]
    file_bytes = await file.read()
    size = len(file_bytes)
    if size > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail=f"文件超过 5MB 上限（{size} bytes）")
    if size == 0:
        raise HTTPException(status_code=422, detail="空文件不被接受")

    conv_dir = UPLOAD_ROOT / conversation_id
    conv_dir.mkdir(parents=True, exist_ok=True)

    file_id = str(uuid.uuid4())
    safe_name = f"{file_id}.{ext}"
    target_path = conv_dir / safe_name
    with open(target_path, "wb") as f:
        f.write(file_bytes)

    extracted_text: Optional[str] = None
    if content_type in ("text/plain", "application/json"):
        try:
            extracted_text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            extracted_text = file_bytes.decode("utf-8", errors="replace")

    _save_message(
        db,
        conv,
        role="user",
        content=f"[upload] {file.filename or safe_name}",
        input_type="file",
        meta={
            "file_id": file_id,
            "file_type": content_type,
            "file_url": f"/api/conversation/{conversation_id}/upload/{file_id}",
            "size": size,
            "extracted_text": extracted_text,
        },
    )

    return UploadResponse(
        file_id=file_id,
        file_url=f"/api/conversation/{conversation_id}/upload/{file_id}",
        file_type=content_type,
        extracted_text=extracted_text,
        size=size,
    ).model_dump()


@router.patch("/prd/{prd_id}", response_model=PrdEditResponse)
async def patch_prd(prd_id: str, req: PrdEditRequest, db: Session = Depends(get_db)) -> dict:
    prd = db.get(models.Prd, prd_id)
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    if not req.content or not req.content.strip():
        raise HTTPException(status_code=422, detail="content 不能为空")

    new_version = _bump_prd_version(prd.version)
    prd.content = req.content
    prd.version = new_version
    db.commit()
    db.refresh(prd)

    return PrdEditResponse(
        prd_id=prd.id,
        content=prd.content,
        version=prd.version,
        updated_at=(prd.updated_at or datetime.utcnow()).isoformat(),
    ).model_dump()


@router.patch("/prd/{prd_id}/acceptance", response_model=PrdAcceptanceResponse)
async def patch_prd_acceptance(
    prd_id: str, req: PrdAcceptanceRequest, db: Session = Depends(get_db)
) -> dict:
    prd = db.get(models.Prd, prd_id)
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    current = dict(prd.acceptance_state or {})
    for k, v in req.checks.items():
        current[str(k)] = bool(v)
    prd.acceptance_state = current
    db.commit()
    db.refresh(prd)

    return PrdAcceptanceResponse(
        prd_id=prd.id,
        acceptance_state=prd.acceptance_state or {},
        updated_at=(prd.updated_at or datetime.utcnow()).isoformat(),
    ).model_dump()


def _bump_prd_version(current: str) -> str:
    return doc_path_utils.bump_prd_version(current)


def _derive_to_confirm(doc: dict) -> list[str]:
    return doc_path_utils.derive_to_confirm(doc)


def _fallback_prd(confirmed_doc: dict) -> str:
    return doc_factory.fallback_prd(confirmed_doc)


def _sse_delta(content: str) -> str:
    return sse.sse_delta(content)


def _sse_error(message: str) -> str:
    return sse.sse_error(message)


def _sse_state(state: str) -> str:
    return sse.sse_state(state)


def _sse_event(payload: dict) -> str:
    return sse.sse_event(payload)


def _sse_done(payload: dict) -> str:
    return sse.sse_done(payload)


def _truncate(text: str, n: int = 240) -> str:
    if not text:
        return ""
    text = str(text)
    return text if len(text) <= n else text[:n] + "..."