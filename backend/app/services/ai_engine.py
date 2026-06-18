from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, AsyncIterator, Optional

from app.core.llm import get_llm
from app.core.state_machine import calc_completion
from app.services import stream_protocol as stream_protocol_lib

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


JSON_START_MARKER = "<<<JSON>>>"
JSON_END_MARKER = "<<</JSON>>>"

JSON_FENCE_START = "```json"
JSON_FENCE_END = "```"


def _load_prompt(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8")


def _render(template: str, variables: dict[str, Any]) -> str:
    out = template
    for k, v in variables.items():
        out = out.replace("{{" + k + "}}", str(v))
    return out


def _extract_doc_fields(raw: dict) -> dict:
    return {
        "scene": raw.get("scene") or "",
        "background": raw.get("background") or "",
        "roles": raw.get("roles") or [],
        "pain_points": raw.get("pain_points") or [],
        "expected_outcomes": raw.get("expected_outcomes") or [],
        "key_scenarios": raw.get("key_scenarios") or [],
        "to_confirm": raw.get("to_confirm") or [],
    }


def _empty_doc() -> dict:
    return {
        "scene": "",
        "background": "",
        "roles": [],
        "pain_points": [],
        "expected_outcomes": [],
        "key_scenarios": [],
        "to_confirm": [],
    }


def _normalize_scene(raw: dict) -> dict:
    return {
        "scene": raw.get("scene") or "",
        "roles": raw.get("roles") or [],
        "pain_points": raw.get("pain_points") or [],
        "expected_outcomes": raw.get("expected_outcomes") or [],
        "emotional_signal": raw.get("emotional_signal") or "平静",
        "urgency": raw.get("urgency") or "中",
        "summary": raw.get("summary") or "",
        "businessperson_insight": raw.get("businessperson_insight") or "",
        "likely_implications": raw.get("likely_implications") or [],
        "translation_quality": raw.get("translation_quality") or "60%",
    }


def _validate_scene(raw: dict) -> None:
    required = ["scene", "roles", "pain_points", "emotional_signal"]
    missing = [f for f in required if not raw.get(f)]
    if missing:
        raise ValueError(f"场景识别缺失必填字段: {missing}")


def _normalize_questions(raw: dict) -> dict:
    qs = raw.get("questions") or []
    if len(qs) > 5:
        qs = qs[:5]
    return {
        "questions": qs,
        "emotional_care": raw.get("emotional_care"),
        "should_continue": bool(raw.get("should_continue", True)),
        "reason_to_continue": raw.get("reason_to_continue"),
    }


def _generate_title(scene: str, background: str) -> str:
    text = scene.strip() or background.strip()
    text = text.replace("\n", " ")
    if len(text) > 30:
        text = text[:30] + "..."
    return text or "新需求"


def _try_extract_json_from_buffer(buffer: str) -> Optional[dict]:
    """从累积的文本 buffer 中尝试提取 JSON（多种策略）。"""
    if not buffer:
        return None
    parsed = _safe_parse_json(buffer)
    if parsed:
        return parsed
    m = re.search(r"\{[\s\S]*\}", buffer)
    if m:
        parsed = _safe_parse_json(m.group(0))
        if parsed:
            return parsed
    return None


def _safe_parse_json(s: str) -> Optional[dict]:
    if not s:
        return None
    cleaned = s.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        obj = json.loads(cleaned)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass
    return None


async def call_scene_identification(business_input: str) -> dict:
    template = _load_prompt("scene_identification")
    user = _render(template, {"business_input": business_input})
    system = "你严格按要求的 JSON Schema 输出，不要任何多余文字。"

    raw = await get_llm().complete_json(system, user, context={"business_input": business_input})
    _validate_scene(raw)
    return _normalize_scene(raw)


async def call_question_generation(
    previous_analysis: dict,
    dialogue_history: list[dict],
    current_round: int,
) -> dict:
    """非流式版本（保留兼容）。流式版本见 stream_question_text。"""
    template = _load_prompt("question_generation")
    user = _render(
        template,
        {
            "previous_analysis": json.dumps(previous_analysis, ensure_ascii=False, indent=2),
            "dialogue_history": json.dumps(dialogue_history, ensure_ascii=False, indent=2),
            "current_round": current_round,
        },
    )
    system = "你严格按要求的 JSON Schema 输出，不要任何多余文字。"

    raw = await get_llm().complete_json(system, user, context={"previous_analysis": previous_analysis})
    return _normalize_questions(raw)


async def call_info_integration(
    previous_doc: dict,
    new_input: str,
    questions: list[dict],
    current_round: int,
) -> dict:
    """非流式版本（保留兼容）。流式版本见 stream_summary_text。"""
    template = _load_prompt("info_integration")
    user = _render(
        template,
        {
            "previous_doc": json.dumps(previous_doc, ensure_ascii=False, indent=2),
            "new_input": new_input,
            "questions": json.dumps(questions, ensure_ascii=False, indent=2),
            "current_round": current_round,
        },
    )
    system = "你严格按要求的 JSON Schema 输出，不要任何多余文字。"

    raw = await get_llm().complete_json(system, user, context={"new_input": new_input, "previous_doc": previous_doc})

    delta = raw.get("delta") or {}
    updated_doc = raw.get("updated_doc") or previous_doc

    if not updated_doc:
        updated_doc = _empty_doc()

    summary = raw.get("user_facing_summary") or "我把你说的都记下来了，咱们继续。"
    completion = int(raw.get("completion_percentage") or calc_completion(updated_doc))
    should_continue = bool(raw.get("should_continue", True))

    return {
        "delta": {
            "added": delta.get("added") or [],
            "modified": delta.get("modified") or [],
            "confirmed": delta.get("confirmed") or [],
            "product_perspective": delta.get("product_perspective") or "",
        },
        "updated_doc": _extract_doc_fields(updated_doc),
        "user_facing_summary": summary,
        "completion_percentage": completion,
        "should_continue": should_continue,
        "product_manager_inference": raw.get("product_manager_inference") or "",
    }


async def call_prd_translation(confirmed_doc: dict) -> str:
    template = _load_prompt("prd_translation")
    user = _render(
        template,
        {
            "confirmed_doc": json.dumps(confirmed_doc, ensure_ascii=False, indent=2),
            "business_person_confirmed": True,
        },
    )
    system = "你严格按要求的 PRD 模板输出 Markdown 文档。"

    return await get_llm().complete_text(
        system, user, temperature=0.4, context={"confirmed_doc": confirmed_doc}
    )


async def call_spec_translation(prd_content: str) -> str:
    template = _load_prompt("spec_translation")
    user = _render(
        template,
        {
            "prd_content": prd_content,
        },
    )
    system = "你严格按要求的 Spec 模板输出 Markdown 文档。"

    return await get_llm().complete_text(
        system, user, temperature=0.3, context={"prd_content": prd_content}
    )


def fallback_integration(previous_doc: dict, new_input: str) -> dict:
    updated = dict(previous_doc or _empty_doc())

    if new_input:
        if not updated.get("background"):
            updated["background"] = new_input[:120]
        if not updated.get("scene"):
            updated["scene"] = new_input[:30]

        pain_points = list(updated.get("pain_points") or [])
        if not pain_points:
            pain_points.append(
                {"description": new_input[:80], "frequency": "未知", "severity": "严重"}
            )
        updated["pain_points"] = pain_points

    completion = calc_completion(updated)
    return {
        "delta": {"added": [], "modified": [], "confirmed": [], "product_perspective": ""},
        "updated_doc": _extract_doc_fields(updated),
        "user_facing_summary": "我先记下你说的，咱们继续聊。",
        "completion_percentage": completion,
        "should_continue": completion < 80,
        "product_manager_inference": "",
    }


def detect_async_supplement(content: str) -> bool:
    keywords = ["我想补充", "补充一下", "补一句", "对了", "还有", "另外", "还有一件事"]
    return any(k in content for k in keywords)


def to_doc_view(doc: dict) -> dict:
    return _extract_doc_fields(doc or {})


QUESTION_STREAM_INSTRUCTION = """
【严格按以下顺序输出，不要遗漏任何部分】

1. **开场白**（1-3 句、不超过 60 字、必须直接接住业务人员刚说的话）。

   **禁止套路开头**：
   - ❌ "听起来..." / "感觉..." / "我理解..." / "让我帮你捋一捋" —— 这是复读机/客服腔，业务人员一眼识破
   - ❌ "这事挺头疼的，咱们一起解决" —— 空洞温情，没接住具体内容
   - ❌ "我先帮你分析一下" —— 居高临下

   **必须做到**：从业务人员**原话里抽一个具体词/具体场景**作为切入点，**让人感觉你真的在听他说话**。下面是 4 种接话风格，**每轮随机选一种，不要重复套路**：

   - 风格 A「抓住他原话里的具体动作」：业务人员说"仓库发货老是出错，客户收到货对不上，经理让我来提需求" → 「发货出错、客户先发现——这比"出错"本身更麻烦，出了问题你可能还不知道。」
   - 风格 B「指出他话里没说出口的那层关系」：业务人员说"经理让我来提个需求，我自己也不太懂该咋说" → 「经理让来提，但自己说不清楚——这事你八成不是核心用户，但你是最清楚现场的人。」
   - 风格 C「点出他原话里隐含的悖论/反直觉点」：业务人员说"我希望能管起来，别再出错了" → 「'别再出错'这事听上去简单——你回忆一下，过去半年里这个事真的有彻底解决过吗？还是一直在兜圈子？」
   - 风格 D「接住他具体的情绪信号」：业务人员说"客户天天打电话骂我们" → 「客户天天打电话——这事不只影响发货，已经在烧你们客服的工时了。」

2. 然后**必须**输出 markdown 代码块标记（独占一行）：```json

3. 然后**必须**输出**严格 JSON**（不要任何注释）：
{
  "emotional_care": "如果情绪是焦虑/愤怒，先用产品经理视角指出问题本质（30-60 字）；平静就 null",
  "questions": [
    {
      "id": "q1",
      "dimension": "关键场景/责任方/期望效果/边界情况/补全信息（任选最贴近的一个）",
      "my_understanding": "AI 用产品经理视角翻译业务人员的话（一句话，10-30 字）",
      "confirm_with_businessperson": "用大白话回问'我理解成 X，对吗？'（15-40 字）",
      "guide_to_say_more": "引导业务人员主动说更多细节（30-80 字，不引导二选一）",
      "why": "为什么问这个问题（一句话，给开发看的）"
    }
  ],
  "should_continue": true,
  "reason_to_continue": "..."
}

4. 然后**必须**单独输出一行（markdown 代码块结束标记）：```

5. 输出 ``` 后立即结束，不要再写任何东西

6. **永远不要**出现 "A. xxx B. xxx C. xxx" 这种选择题
7. **永远不要**用"听起来"、"感觉是"、"让我帮你捋一捋"等空话开头
"""


INTEGRATION_STREAM_INSTRUCTION = """
【严格按以下顺序输出，不要遗漏任何部分】

1. 先用 1-3 句大白话开场，要求是「我理解成 X，对吗？」的反问式（30-60 字）。例：「我理解成咱们想解决的是让内部比客户先知道问题，对吗？」

2. 然后**必须**输出 markdown 代码块标记（独占一行）：```json

3. 然后**必须**输出**严格 JSON**（不要任何注释）：
{
  "delta": {
    "added": [{"field": "字段名", "content": "新增的内容", "source": "业务人员第 X 轮说的"}],
    "modified": [{"field": "字段名", "before": "修改前", "after": "修改后", "reason": "为什么改"}],
    "confirmed": [{"field": "字段名", "content": "确认无误的内容"}],
    "product_perspective": "【产品经理视角】业务人员没说但产品经理从这一轮里'听出来'的内容（30-60 字）"
  },
  "updated_doc": {},
  "completion_percentage": 0,
  "should_continue": true,
  "product_manager_inference": "【产品经理推断】基于业务人员这一轮说的话，产品经理推断出的隐含信息（50-100 字）"
}

4. 然后**必须**单独输出一行（markdown 代码块结束标记）：```

5. 输出 ``` 后立即结束，不要再写任何东西
"""


async def stream_question_text(
    previous_analysis: dict,
    dialogue_history: list[dict],
    current_round: int,
) -> AsyncIterator[dict]:
    """流式 LLM：1 次调用输出「开场白 + 反问 JSON」。

    yield dict:
      - {"type": "delta", "content": "..."}     多次：开场白逐字流式
      - {"type": "questions", "questions": [...], "emotional_care": "..."}  一次：解析后的 JSON
      - {"type": "error", "message": "..."}     出错时
    """
    template = _load_prompt("question_generation")
    user = _render(
        template,
        {
            "previous_analysis": json.dumps(previous_analysis, ensure_ascii=False, indent=2),
            "dialogue_history": json.dumps(dialogue_history, ensure_ascii=False, indent=2),
            "current_round": current_round,
        },
    )
    system = "你严格按要求的输出格式输出中文自然语言 + JSON。\n\n" + QUESTION_STREAM_INSTRUCTION
    user = user + "\n\n" + QUESTION_STREAM_INSTRUCTION

    def _on_parsed(parsed: dict):
        return _questions_event_from_parsed(parsed)

    def _on_flush_final(remainder: str):
        if remainder.strip() and not remainder.strip().startswith("```"):
            return {"type": "delta", "content": remainder}
        return None

    proto = stream_protocol_lib.StreamProtocol(
        make_event=_on_parsed,
        flush_final=lambda r: (
            {"type": "delta", "content": r} if r.strip() and not r.strip().startswith("```") else None
        ),
    )

    try:
        async for chunk in get_llm().stream_text(system, user, temperature=0.5):
            for ev in proto.feed(chunk):
                yield ev
        if not proto.event_emitted:
            yield {
                "type": "questions",
                "questions": [],
                "emotional_care": None,
                "should_continue": True,
                "reason_to_continue": "流式未输出有效 JSON",
            }
    except Exception as e:  # noqa: BLE001
        logger.exception("stream_question_text failed: %s", e)
        yield {"type": "error", "message": f"反问生成失败：{_truncate(str(e))}"}


def _questions_event_from_parsed(parsed: dict) -> dict:
    qs = parsed.get("questions") or []
    if len(qs) > 5:
        qs = qs[:5]
    return {
        "type": "questions",
        "questions": qs,
        "emotional_care": parsed.get("emotional_care"),
        "should_continue": bool(parsed.get("should_continue", True)),
        "reason_to_continue": parsed.get("reason_to_continue"),
    }


async def stream_summary_text(
    previous_doc: dict,
    new_input: str,
    questions: list[dict],
    current_round: int,
) -> AsyncIterator[dict]:
    """流式 LLM：1 次调用输出「反问式总结 + 整合 JSON」。

    yield dict:
      - {"type": "delta", "content": "..."}            多次：反问式总结逐字流式
      - {"type": "integration", "delta": {...}, "updated_doc": {...}, ...}  一次：解析后的 JSON
      - {"type": "error", "message": "..."}            出错时
    """
    template = _load_prompt("info_integration")
    user = _render(
        template,
        {
            "previous_doc": json.dumps(previous_doc, ensure_ascii=False, indent=2),
            "new_input": new_input,
            "questions": json.dumps(questions, ensure_ascii=False, indent=2),
            "current_round": current_round,
        },
    )
    system = "你严格按要求的输出格式输出中文自然语言 + JSON。\n\n" + INTEGRATION_STREAM_INSTRUCTION
    user = user + "\n\n" + INTEGRATION_STREAM_INSTRUCTION

    proto = stream_protocol_lib.StreamProtocol(
        make_event=lambda parsed: _integration_event_from_parsed(parsed, previous_doc),
        flush_final=lambda r: (
            {"type": "delta", "content": r} if r.strip() and not r.strip().startswith("```") else None
        ),
    )

    try:
        async for chunk in get_llm().stream_text(system, user, temperature=0.5):
            for ev in proto.feed(chunk):
                yield ev
        if not proto.event_emitted:
            fb = fallback_integration(previous_doc, new_input)
            yield {"type": "integration", **fb}
    except Exception as e:  # noqa: BLE001
        logger.exception("stream_summary_text failed: %s", e)
        yield {"type": "error", "message": f"信息整合失败：{_truncate(str(e))}"}


def _integration_event_from_parsed(parsed: dict, previous_doc: dict) -> dict:
    delta = parsed.get("delta") or {}
    updated_doc = parsed.get("updated_doc") or previous_doc
    if not updated_doc:
        updated_doc = _empty_doc()

    summary = parsed.get("user_facing_summary") or "我把你说的都记下来了，咱们继续。"
    completion = int(parsed.get("completion_percentage") or calc_completion(updated_doc))
    should_continue = bool(parsed.get("should_continue", True))

    return {
        "type": "integration",
        "delta": {
            "added": delta.get("added") or [],
            "modified": delta.get("modified") or [],
            "confirmed": delta.get("confirmed") or [],
            "product_perspective": delta.get("product_perspective") or "",
        },
        "updated_doc": _extract_doc_fields(updated_doc),
        "user_facing_summary": summary,
        "completion_percentage": completion,
        "should_continue": should_continue,
        "product_manager_inference": parsed.get("product_manager_inference") or "",
    }


def _truncate(text: str, n: int = 240) -> str:
    if not text:
        return ""
    text = str(text)
    return text if len(text) <= n else text[:n] + "..."