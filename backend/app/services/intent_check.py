"""意图识别：判断用户输入是否和当前需求/对话相关。

两层检查：
1. **规则层** (0 延迟): 命中明显的「无关」模式 (闲聊、问候、身份问询、纯测试) 直接拒绝
2. **上下文层** (轻量): 拿用户输入对比前几轮对话,计算关键词重叠度
   - 重叠度低于阈值 → 拒绝
   - 重叠度正常 → 放行

设计原则:
- 严格但不过度严苛,允许用户对需求的澄清/扩展/纠正
- 拒绝时给出明确的话术: 「告诉我这跟当前需求有什么关系」,把主题拉回来
- 命中规则库时 confidence=1.0; 关键词重叠低时 confidence=0.7
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

# 命中即视为「无关」的正则 (大小写不敏感, 全文匹配/前缀匹配)
IRRELEVANT_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("greeting", re.compile(
        r"^(你好|您好|hi|hello|hey|嗨|哈喽|哈啰)[呀啊呢吗？?！!.\s]*$",
        re.IGNORECASE,
    )),
    ("time_greeting", re.compile(
        r"^(早上好|上午好|下午好|晚上好|晚安|早安|各位好|大家好)$",
        re.IGNORECASE,
    )),
    ("identity_question", re.compile(
        r"^你(是谁|叫什么|是什么|能做什么|会什么|有什么用|怎么用|怎么工作|怎么运作|哪个公司|属于谁)",
        re.IGNORECASE,
    )),
    ("identity_question_en", re.compile(
        r"^(who are you|what are you|what can you do|what do you do|who made you)",
        re.IGNORECASE,
    )),
    ("smalltalk_weather", re.compile(
        r"^(今天天气|天气怎么样|会下雨吗|会下雪吗|多少度|外面冷吗|外面热吗)",
        re.IGNORECASE,
    )),
    ("smalltalk_food", re.compile(
        r"^(中午吃什么|晚饭吃什么|早餐吃什么|吃什么好|喝什么|周末去哪|去哪玩)",
        re.IGNORECASE,
    )),
    ("test_input", re.compile(
        r"^(test|testing|测试|试一下|试试|随便打打|随便输输|看看效果|看看能不能用)[呀啊呢吗？?！!.\s]*$",
        re.IGNORECASE,
    )),
    ("gibberish", re.compile(
        r"^(asdf{2,}|qwer{2,}|zxcv{2,}|asdfasdf|qwerqwer|asdqwer|zzz+|xxx+|aaa+|www+|\.{3,}|～+|——+|---+)$",
        re.IGNORECASE,
    )),
    ("pure_punct", re.compile(r"^[\s\W_]+$")),
    ("pure_number_short", re.compile(r"^\d{1,3}[\s\W]*$")),
    ("math_question", re.compile(
        r"^[\d\s\+\-\*\/\=\.\(\)\^]+[\=？\?]?\s*$",
    )),
    ("coding_request", re.compile(
        r"(帮我|给我|写|做|生成).{0,20}(代码|函数|脚本|程序|算法|爬虫|小游戏|贪吃蛇|2048|俄罗斯方块|五子棋|井字棋|计算器|排序|斐波那契)",
    )),
    ("chitchat_feeling", re.compile(
        r"^(我(很|有点|非常)?(无聊|累|困|饿|开心|难过|郁闷|焦虑)|(无聊|累|困|饿)了|想(睡觉|休息))",
    )),
    ("meaningless_emoji_only", re.compile(r"^[\U0001F300-\U0001FAFF\s]+$")),
]

# 中文停用词 (不参与关键词重叠计算)
STOPWORDS_ZH = {
    "的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都", "一", "一个",
    "上", "也", "很", "到", "说", "要", "去", "会", "着", "没有", "看", "好", "自己",
    "这", "那", "些", "什么", "怎么", "为什么", "呢", "吗", "吧", "啊", "嗯", "哦",
    "对", "行", "可以", "应该", "需要", "我们", "你们", "他们", "它", "这个", "那个",
    "你", "他", "她", "但", "而", "或", "如果", "因为", "所以", "虽然", "然后", "还",
    "已经", "正在", "应该", "可能", "也许", "大概", "差不多", "就是", "只是", "其实",
}

# 英文停用词
STOPWORDS_EN = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
    "my", "your", "his", "her", "its", "our", "their",
    "and", "or", "but", "if", "because", "so", "then", "as", "of", "at", "in",
    "on", "for", "to", "from", "by", "with", "about", "this", "that", "these",
    "those", "what", "which", "who", "whom", "do", "does", "did", "can", "could",
    "would", "should", "will", "may", "might", "must", "have", "has", "had",
    "just", "only", "very", "too", "also", "really", "actually", "basically",
}


@dataclass
class IntentCheckResult:
    relevant: bool
    reason: str
    confidence: float
    matched_pattern: Optional[str] = None


def _tokenize(text: str) -> set[str]:
    """粗粒度分词: 中文字符按字, 英文按词."""
    tokens: set[str] = set()
    # 英文单词
    for m in re.finditer(r"[a-zA-Z]{2,}", text):
        word = m.group(0).lower()
        if word not in STOPWORDS_EN and len(word) > 2:
            tokens.add(word)
    # 中文字符 (2字以上算词, 1字过滤)
    for ch in text:
        if "\u4e00" <= ch <= "\u9fff" and ch not in STOPWORDS_ZH:
            tokens.add(ch)
    return tokens


def _is_substantive(text: str) -> bool:
    """判断输入是否有实质内容 (长度 + token 数)."""
    stripped = text.strip()
    if len(stripped) < 4:
        return False
    tokens = _tokenize(stripped)
    return len(tokens) >= 2


def check_relevance(
    user_text: str,
    context_summary: str = "",
    recent_user_messages: Optional[list[str]] = None,
) -> IntentCheckResult:
    """检查用户输入是否和当前需求/对话相关.

    Args:
        user_text: 本轮用户输入
        context_summary: 当前需求标题/主题摘要 (e.g., conv.title + 关键 doc 字段)
        recent_user_messages: 之前 1-3 轮用户消息列表

    Returns:
        IntentCheckResult(relevant, reason, confidence, matched_pattern)
    """
    stripped = user_text.strip()
    if not stripped:
        return IntentCheckResult(
            relevant=False,
            reason="输入为空",
            confidence=1.0,
            matched_pattern="empty",
        )

    # Tier 1: 规则库
    for name, pat in IRRELEVANT_PATTERNS:
        if pat.match(stripped):
            return IntentCheckResult(
                relevant=False,
                reason=f"命中规则库「{name}」",
                confidence=1.0,
                matched_pattern=name,
            )

    # Tier 1.5: 长度 / 实质内容检查 (拒绝 1-3 字无意义输入)
    if not _is_substantive(stripped):
        return IntentCheckResult(
            relevant=False,
            reason="输入过短, 无实质内容",
            confidence=0.8,
            matched_pattern="too_short",
        )

    # Tier 2: 关键词重叠
    # 没有上下文时 (首次对话) 默认放行
    if not context_summary and not recent_user_messages:
        return IntentCheckResult(relevant=True, reason="首次输入, 无上下文可比对", confidence=0.5)

    user_tokens = _tokenize(stripped)
    if not user_tokens:
        return IntentCheckResult(relevant=True, reason="无可比对 token, 放行", confidence=0.4)

    context_text = context_summary + " ".join(recent_user_messages or [])
    context_tokens = _tokenize(context_text)

    if not context_tokens:
        return IntentCheckResult(relevant=True, reason="上下文无有效 token, 放行", confidence=0.4)

    overlap = user_tokens & context_tokens
    overlap_ratio = len(overlap) / max(1, len(user_tokens))
    overlap_pct = f"{overlap_ratio * 100:.0f}%"

    # 至少 1 个共同 token, 或者 30% 以上的 token 重叠
    if len(overlap) >= 1 and overlap_ratio >= 0.15:
        return IntentCheckResult(
            relevant=True,
            reason=f"关键词重叠 {len(overlap)}/{len(user_tokens)} ({overlap_pct})",
            confidence=0.7,
        )

    return IntentCheckResult(
        relevant=False,
        reason=f"关键词重叠低 ({len(overlap)}/{len(user_tokens)} = {overlap_pct}), 跟当前需求不相关",
        confidence=0.7,
    )


def build_refusal_message(reason: str, current_topic: str = "") -> str:
    """构造「拒绝并拉回主题」的话术."""
    if current_topic:
        return (
            f"你刚才说的跟当前需求「{current_topic}」关联不大。\n\n"
            f"我现在的工作是帮你把「{current_topic}」聊清楚——场景、角色、痛点、期望效果。\n\n"
            f"你可以说说跟它相关的事吗？比如：\n"
            f"· 现在用这个系统/流程时哪里不顺？\n"
            f"· 你希望它变成什么样？\n"
            f"· 谁会用、用在什么场景？"
        )
    return (
        "你刚才说的跟当前需求没什么关系。\n\n"
        "我是在帮你梳理一个具体的产品需求——场景、角色、痛点、期望效果。\n\n"
        "说说跟你手头需求相关的事吧？"
    )
