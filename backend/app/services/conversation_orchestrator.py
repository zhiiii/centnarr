"""conversation_orchestrator 模块:LLM 调用的"安全包装器"。

把 ai_engine.call_* 的 try/except + 兜底逻辑集中到这里,让 routes
只关心状态机和 SSE 事件,不再在多个 endpoint 里复制 try/except。
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from app.services import ai_engine

logger = logging.getLogger(__name__)


async def safe_scene_identification(content: str) -> dict:
    """包装 call_scene_identification,失败时返回最小可用兜底。"""
    try:
        return await ai_engine.call_scene_identification(content)
    except Exception as e:
        logger.exception("Scene identification failed: %s", e)
        return {
            "scene": content[:30] or "未识别场景",
            "roles": [],
            "pain_points": [
                {"description": content[:80], "frequency": "未知", "severity": "严重"}
            ],
            "expected_outcomes": [{"description": "解决问题", "explicit": False}],
            "emotional_signal": "平静",
            "urgency": "中",
            "summary": content[:100],
        }


async def safe_question_generation(
    scene_or_doc: dict,
    dialogue_history: list[dict],
    round: int,
) -> dict:
    """包装 call_question_generation,失败时返回 3 个兜底问题。"""
    try:
        return await ai_engine.call_question_generation(scene_or_doc, dialogue_history, round)
    except Exception as e:
        logger.exception("Question generation failed: %s", e)
        return {
            "questions": [
                {"id": "q1", "dimension": "关键场景", "question": "能详细说说具体场景吗?", "why": "了解场景细节", "examples": []},
                {"id": "q2", "dimension": "期望效果", "question": "你希望解决到什么程度?", "why": "明确期望", "examples": []},
                {"id": "q3", "dimension": "责任方", "question": "现在是谁在处理?", "why": "了解现状", "examples": []},
            ],
            "emotional_care": None,
            "should_continue": True,
            "reason_to_continue": "兜底问题,等待业务人员回答",
        }


async def safe_info_integration(
    previous_doc: dict,
    user_content: str,
    last_questions: list,
    round: int,
) -> dict:
    """包装 call_info_integration,失败时返回 fallback_integration 兜底。"""
    try:
        return await ai_engine.call_info_integration(
            previous_doc, user_content, last_questions, round
        )
    except Exception as e:
        logger.exception("Info integration failed: %s", e)
        return ai_engine.fallback_integration(previous_doc, user_content)