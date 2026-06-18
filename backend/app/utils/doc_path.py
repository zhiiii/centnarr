"""doc_path 模块:业务确认稿 doc 字典的字段路径操作与版本管理。

所有函数都是纯函数,零 HTTP / DB 依赖,可独立测试。
"""
from __future__ import annotations

import re
from typing import Any

FORBIDDEN_KEYS = {"__proto__", "constructor", "prototype"}


def set_field_by_path(doc: dict, field_path: str, value: Any) -> Any:
    """按字段路径(支持 a.b[0].c 形式)设置 doc 中对应位置,并返回旧值。

    路径示例:
        - "background"
        - "pain_points[0].description"
        - "roles[1].name"
    """
    if not field_path or not isinstance(field_path, str):
        raise ValueError("field_path 必须是非空字符串")

    if not re.fullmatch(r"[A-Za-z0-9_\-\.\[\]]+", field_path):
        raise ValueError(f"field_path 含非法字符: {field_path}")

    for k in re.findall(r"[A-Za-z_][A-Za-z0-9_]*", field_path):
        if k in FORBIDDEN_KEYS:
            raise ValueError(f"field_path 含保留字段: {k}")

    tokens: list[tuple[str, str]] = []
    for segment in field_path.split("."):
        if not segment:
            raise ValueError(f"field_path 存在空段: {field_path}")
        buf = ""
        i = 0
        while i < len(segment):
            ch = segment[i]
            if ch == "[":
                if buf:
                    tokens.append(("key", buf))
                    buf = ""
                close = segment.find("]", i)
                if close < 0:
                    raise ValueError(f"field_path 缺少 ']': {field_path}")
                idx_str = segment[i + 1:close]
                if not idx_str.isdigit():
                    raise ValueError(f"field_path 索引必须为非负整数: {field_path}")
                tokens.append(("index", idx_str))
                i = close + 1
            else:
                buf += ch
                i += 1
        if buf:
            tokens.append(("key", buf))
    if not tokens:
        raise ValueError("field_path 至少包含一段")

    cursor: Any = doc
    for i, (kind, val) in enumerate(tokens[:-1]):
        if kind == "key":
            if not isinstance(cursor, dict):
                raise ValueError(f"字段路径在第 {i} 段需要 dict")
            if val not in cursor:
                cursor[val] = [] if tokens[i + 1][0] == "index" else {}
            cursor = cursor[val]
        else:
            idx = int(val)
            if not isinstance(cursor, list):
                raise ValueError(f"字段路径在第 {i} 段需要 list")
            while len(cursor) <= idx:
                cursor.append({})
            cursor = cursor[idx]

    last_kind, last_val = tokens[-1]
    if last_kind == "key":
        if not isinstance(cursor, dict):
            raise ValueError("末段需要 dict 才能用 key 写入")
        old = cursor.get(last_val)
        cursor[last_val] = value
        return old
    else:
        idx = int(last_val)
        if not isinstance(cursor, list):
            raise ValueError("末段需要 list 才能用 index 写入")
        while len(cursor) <= idx:
            cursor.append(None)
        old = cursor[idx]
        cursor[idx] = value
        return old


def bump_prd_version(current: str) -> str:
    """将 v1.0 自增为 v1.1/v1.2;若格式异常则落到 v1.1。"""
    if not current:
        return "v1.1"
    m = re.match(r"^v(\d+)\.(\d+)$", current)
    if not m:
        return "v1.1"
    major = int(m.group(1))
    minor = int(m.group(2)) + 1
    return f"v{major}.{minor}"


def derive_to_confirm(doc: dict) -> list[str]:
    """根据 doc 当前内容,推断还有哪些维度待确认。"""
    candidates: list[str] = []
    if not doc.get("pain_points"):
        candidates.append("出错类型")
    pain_points = doc.get("pain_points") or []
    if not pain_points or not any((p.get("frequency") or "").strip() for p in pain_points):
        candidates.append("发生频率")
    if not doc.get("roles"):
        candidates.append("责任方")
    if not doc.get("expected_outcomes"):
        candidates.append("期望效果")
    if not doc.get("key_scenarios"):
        candidates.append("关键场景")
    return candidates