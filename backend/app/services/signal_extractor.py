"""从用户输入文本里提取枚举值（频次、严重度、置信度、显式/隐式）。

不依赖 LLM，纯关键词匹配。每个提取函数返回 (value, evidence, confidence_in_text)。

设计原则:
- 只在文本里**真正出现过**信号词时才打标,绝不默认填值
- evidence 是用户原话里被命中的关键词 (供前端展示来源)
- extracted 是布尔 — 标识是不是从信号词识别出来的 (vs 用户自己填的或 AI 瞎猜的)
"""

from __future__ import annotations

import re
from dataclasses import dataclass


# ===== 频次 =====
# 高频: 每天/天天/经常/频繁/总是/每次/一直/不断/老 (经常出现)
# 中频: 时常/时不时/有时/偶尔/经常
# 低频: 很少/难得/少数/极少/不常/偶尔才有
FREQUENCY_PATTERNS: list[tuple[str, list[str]]] = [
    ("高频", [
        "每天", "天天", "每天都在", "每天都要",
        "经常", "经常出现", "经常发生", "老是", "总是",
        "每次", "每次都", "一直", "不断", "频繁",
        "反复", "一次次", "日复一日",
    ]),
    ("中频", [
        "时常", "时不时", "时不时会", "有时", "有时候",
        "偶尔", "偶尔会", "有时会",
    ]),
    ("低频", [
        "很少", "难得", "偶尔才", "少数", "极少数",
        "极少", "不常", "不常有", "少见",
    ]),
]

# ===== 严重度 =====
# 严重: 直接影响收入/客户/业务/运营/合规; 数字损失; 紧急
# 一般: 有点影响/有些麻烦/不太顺
# 轻微: 还好/可以接受/不算严重/影响不大
SEVERITY_PATTERNS: list[tuple[str, list[str]]] = [
    ("严重", [
        "很", "非常", "极其", "特别",
        "重大", "重大影响", "重大损失",
        "严重影响", "重大损失", "直接损失",
        "很严重", "特别严重", "相当严重",
        "损失", "损失大", "有损失", "造成损失",
        "很大", "很大影响", "很大损失",
        "糟糕", "不行", "不能接受", "受不了",
        "紧急", "马上", "立刻", "致命", "关键",
        "重要", "核心", "首要",
        "很差", "太差", "很难",
        "投诉", "流失", "失去", "丢掉", "取消合作",
        "赔钱", "亏钱", "亏损",
        "影响客户", "影响收入", "影响业务",
        "影响大客户", "影响复购", "影响续费",
        "严重影响运营", "影响合规",
        "复购", "续约", "转投竞品",
    ]),
    ("一般", [
        "有点", "稍微", "一般", "还好", "不算",
        "还是有些", "有一些", "有点影响", "有些麻烦",
        "不太顺", "不太方便", "有时候会",
    ]),
    ("轻微", [
        "轻微", "小问题", "小影响",
        "无所谓", "不严重", "影响不大",
        "可以接受", "能接受", "不算啥",
        "不太要紧", "问题不大", "问题小",
    ]),
]

# ===== 显式 vs 隐式期望 =====
# explicit=true (用户明确说想要): 希望/想要/期待/需要/必须/应该/得/要/一定/务必/一定要
# explicit=false (用户隐含提到/AI 推断): 如果可以/也许/可能/大概/差不多/或许/能/可
EXPLICIT_TRUE_SIGNALS = [
    "希望", "想要", "期待", "需要", "必须", "应该",
    "得", "一定要", "一定得", "务必", "务必要",
    "要求", "必须要", "应该要",
]
EXPLICIT_FALSE_SIGNALS = [
    "如果可以", "如果要", "也许", "或许", "可能", "大概",
    "差不多", "差不多就行", "能", "可", "最好是",
    "要是能", "要是可以", "能更好",
]

# ===== 角色置信度 =====
# high: 用户第一/二人称说出来的 (我是客户经理 / 我们销售团队)
# medium: 用户提到的 (产品经理会想到/有用户反馈) 或上下文明显
# low: AI 推断的, 用户没说也没暗示
SELF_REFERENCES = [
    "我是", "我做", "我负责", "我这边", "我这边做",
    "我们", "我们公司", "我们团队", "我们部门",
    "我们这边", "在我们",
]
ROLE_NAMED_PATTERNS = [
    r"(销售|客户经理|产品经理|业务人员|客服|运营|仓库|管理员|主管|经理|老板|开发|测试|设计师|HR|人事|财务)",
]


@dataclass
class Extracted:
    value: str | bool | None
    evidence: str | None  # 命中关键词 (用户原话里)
    extracted: bool  # True=从信号词识别, False=没识别到


def _match_any(text: str, patterns: list[str]) -> str | None:
    """在 text 中按出现顺序找到第一个匹配的关键词,返回关键词本身。"""
    if not text:
        return None
    earliest = None
    earliest_idx = len(text) + 1
    for pat in patterns:
        idx = text.find(pat)
        if idx >= 0 and idx < earliest_idx:
            earliest = pat
            earliest_idx = idx
    return earliest


def extract_frequency(text: str) -> Extracted:
    """从用户文本提取频次。返回 (高频/中频/低频/未知, 命中词, 是否识别到)。"""
    if not text:
        return Extracted(None, None, False)
    for label, patterns in FREQUENCY_PATTERNS:
        hit = _match_any(text, patterns)
        if hit:
            return Extracted(label, hit, True)
    return Extracted(None, None, False)


def extract_severity(text: str) -> Extracted:
    """从用户文本提取严重度。返回 (严重/一般/轻微, 命中词, 是否识别到)。"""
    if not text:
        return Extracted(None, None, False)
    for label, patterns in SEVERITY_PATTERNS:
        hit = _match_any(text, patterns)
        if hit:
            return Extracted(label, hit, True)
    return Extracted(None, None, False)


def extract_explicit(text: str) -> Extracted:
    """从用户文本判断期望是否明确表达。True=用户明确说想要, False=用户含糊或 AI 推断。"""
    if not text:
        return Extracted(None, None, False)
    true_hit = _match_any(text, EXPLICIT_TRUE_SIGNALS)
    false_hit = _match_any(text, EXPLICIT_FALSE_SIGNALS)
    if true_hit and false_hit:
        if text.find(true_hit) < text.find(false_hit):
            return Extracted(True, true_hit, True)
        return Extracted(False, false_hit, True)
    if true_hit:
        return Extracted(True, true_hit, True)
    if false_hit:
        return Extracted(False, false_hit, True)
    return Extracted(None, None, False)


def extract_role_confidence(role: dict, full_text: str) -> Extracted:
    """从用户文本判断角色置信度。

    high: 用户用第一人称提到这个角色 (我是销售 / 我们客服团队)
    medium: 用户明确提到角色名 (产品经理反馈 / 销售会跟进)
    low: AI 推断 (用户没说)
    """
    if not role:
        return Extracted(None, None, False)

    role_name = (role.get("name") or "").strip()
    if not role_name:
        return Extracted(None, None, False)

    self_hit = _match_any(full_text, SELF_REFERENCES)
    if self_hit:
        return Extracted("high", self_hit, True)

    name_clean = role_name.replace(" ", "").replace("(", "").replace(")", "")
    candidates = []
    if len(name_clean) >= 2:
        candidates.append(name_clean)
    if len(name_clean) >= 3:
        candidates.append(name_clean[:2])
    candidates = list(dict.fromkeys(candidates))

    hit = None
    for kw in candidates:
        idx = full_text.find(kw)
        if idx >= 0:
            if not hit or idx < full_text.find(hit):
                hit = kw
    if hit:
        return Extracted("medium", hit, True)

    return Extracted("low", None, False)


def enrich_doc_tags(updated_doc: dict, user_input: str) -> dict:
    """给业务确认稿里的枚举字段 (frequency / severity / confidence / explicit) 补上信号词识别结果。

    规则:
    1. 如果 AI 已经填了枚举值, 但 evidence 为空 → 用信号词匹配结果覆盖 (除非用户/AI 没给出, 保留为 None)
    2. 如果 AI 没填 (空) → 用信号词匹配结果填充
    3. evidence 字段记录命中的关键词,前端可展示「识别自 XXX」
    4. extracted 字段标记是否从信号词识别 (vs 用户手动填的)
    """
    if not updated_doc or not isinstance(updated_doc, dict):
        return updated_doc

    user_text = user_input or ""
    to_confirm = set(updated_doc.get("to_confirm") or [])

    roles = updated_doc.get("roles") or []
    for i, r in enumerate(roles):
        if not isinstance(r, dict):
            continue
        if to_confirm.intersection({f"roles[{i}]", f"roles[{i}].name", f"roles[{i}].responsibility"}):
            continue
        existing = r.get("confidence")
        existing_ev = r.get("evidence")
        if existing and (existing_ev or existing_ev == ""):
            continue
        ext = extract_role_confidence(r, user_text)
        if ext.extracted:
            r["confidence"] = ext.value
            r["evidence"] = {**(r.get("evidence") or {}), "confidence": ext.evidence}
        elif not existing:
            r["confidence"] = None
            r.setdefault("evidence", {})["confidence"] = None
    updated_doc["roles"] = roles

    pain_points = updated_doc.get("pain_points") or []
    for i, p in enumerate(pain_points):
        if not isinstance(p, dict):
            continue
        if to_confirm.intersection({f"pain_points[{i}]", f"pain_points[{i}].description"}):
            continue
        desc = (p.get("description") or "").strip()
        if not desc:
            continue
        for tag_name, extractor in (("frequency", extract_frequency), ("severity", extract_severity)):
            existing = p.get(tag_name)
            existing_ev = (p.get("evidence") or {}).get(tag_name)
            if existing and existing_ev:
                continue
            ext = extractor(user_text)
            if ext.extracted:
                p[tag_name] = ext.value
                p.setdefault("evidence", {})[tag_name] = ext.evidence
            elif not existing:
                p[tag_name] = None
                p.setdefault("evidence", {})[tag_name] = None
    updated_doc["pain_points"] = pain_points

    outcomes = updated_doc.get("expected_outcomes") or []
    for i, e in enumerate(outcomes):
        if not isinstance(e, dict):
            continue
        if to_confirm.intersection({f"expected_outcomes[{i}]", f"expected_outcomes[{i}].description"}):
            continue
        desc = (e.get("description") or "").strip()
        if not desc:
            continue
        existing = e.get("explicit")
        existing_ev = (e.get("evidence") or {}).get("explicit")
        if isinstance(existing, bool) and existing_ev is not None:
            continue
        ext = extract_explicit(user_text)
        if ext.extracted:
            e["explicit"] = bool(ext.value)
            e.setdefault("evidence", {})["explicit"] = ext.evidence
        elif existing is None:
            e["explicit"] = None
            e.setdefault("evidence", {})["explicit"] = None
    updated_doc["expected_outcomes"] = outcomes

    return updated_doc