"""doc_factory 模块:业务确认稿 doc 字典的构造工厂。

集中所有"初始 doc 长这样 / 待确认列表是什么"的逻辑,让 routes
不再在多个 endpoint 里重复硬编码。

也包含 doc 相关的纯字符串格式化工具(AI message meta / AI response 文本),
这些工具仅依赖 doc 字典,适合放在这里。
"""
from __future__ import annotations

from typing import Optional

from app.utils.doc_path import derive_to_confirm


def empty_initial_doc(
    *,
    business_input: str = "",
    scene_analysis: Optional[dict] = None,
    previous_doc: Optional[dict] = None,
) -> dict:
    """构造一个空的"业务确认稿"初始 doc。

    优先级:
        1. previous_doc(继续编辑已存在的 doc)
        2. 从 scene_analysis 提取字段
        3. 用 business_input 填充 background 兜底

    to_confirm 字段由 derive_to_confirm 自动计算,调用方无需再覆盖。
    """
    scene = (scene_analysis or {}).get("scene", "")
    base = {
        "scene": scene or (previous_doc or {}).get("scene", ""),
        "background": (scene_analysis or {}).get("summary") or business_input[:120],
        "roles": (scene_analysis or {}).get("roles") or (previous_doc or {}).get("roles") or [],
        "pain_points": (scene_analysis or {}).get("pain_points") or (previous_doc or {}).get("pain_points") or [],
        "expected_outcomes": (scene_analysis or {}).get("expected_outcomes") or (previous_doc or {}).get("expected_outcomes") or [],
        "key_scenarios": (previous_doc or {}).get("key_scenarios") or [],
        "to_confirm": [],
    }
    base["to_confirm"] = derive_to_confirm(base)
    return base


def ai_message_meta(questions: list[dict], emotional_care: Optional[str]) -> dict:
    """组装 assistant message 的 meta 字段,前端用它渲染问题卡。"""
    return {"questions": questions, "emotional_care": emotional_care}


def format_ai_response(qg: dict) -> str:
    """把 question_generation 的结构化输出格式化成可显示的纯文本。"""
    parts: list[str] = []
    if qg.get("emotional_care"):
        parts.append(qg["emotional_care"])
        parts.append("")
    qs = qg.get("questions") or []
    for i, q in enumerate(qs, 1):
        text = f"{i}. {q.get('question','')}"
        if q.get("examples"):
            text += f"\n   (可选答案:{' / '.join(q['examples'][:3])})"
        parts.append(text)
    return "\n".join(parts)


def fallback_prd(confirmed_doc: dict) -> str:
    """当 PRD 生成 LLM 失败时的兜底输出。"""
    title = confirmed_doc.get("scene") or "未命名需求"
    return (
        f"# PRD:{title}\n\n"
        f"> 来源:业务确认稿(兜底输出)\n\n"
        f"## 1. 需求背景\n\n{confirmed_doc.get('background','')}\n\n"
        f"## 2. 待评估\n\n请联系产品经理完善。\n"
    )