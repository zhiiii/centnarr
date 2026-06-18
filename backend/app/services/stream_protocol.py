"""stream_protocol 模块:LLM 流式输出的"文本片段 + JSON 事件"解析器。

封装 buffer / marker / safety-prefix 状态机,让调用方只关心:
    for chunk in llm_stream:
        for ev in protocol.feed(chunk):
            ... yield ev

调用方负责:
    1. 决定 parsed dict 怎样转成 event(`make_event` 回调)
    2. 流末尾如何处理 (`flush_final` 回调)
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional, Union

JSON_FENCE_START = "```json"
JSON_FENCE_END = "```"


ParsedDict = dict
EventDict = dict
MakeEventFn = Callable[[ParsedDict], Optional[EventDict]]
FlushFinalFn = Callable[[str], Optional[EventDict]]


@dataclass
class StreamProtocol:
    """LLM 流 → 文本片段 + JSON 事件的协议解析器。

    协议:
        LLM 输出 = <开场白文字> + ```json + <JSON 块> + ``` + <可选尾部文字>

    Usage:
        proto = StreamProtocol(make_event=lambda p: {"type": "questions", **(p or {})})
        async for chunk in llm_stream:
            for ev in proto.feed(chunk):
                yield ev
        final = proto.flush_final()
        if final:
            yield final
    """

    make_event: MakeEventFn
    flush_final: Optional[FlushFinalFn] = None
    event_emitted: bool = False

    def __post_init__(self) -> None:
        self._pre = ""
        self._json = ""
        self._seen = False
        self._safety_prefix = JSON_FENCE_START[: len(JSON_FENCE_START) - 1]

    def feed(self, chunk: str) -> list[EventDict]:
        """处理一段 LLM 增量输出,返回 0-N 个事件。"""
        out: list[EventDict] = []
        if not chunk:
            return out

        if not self._seen:
            self._pre += chunk
            idx = self._pre.find(JSON_FENCE_START)
            if idx >= 0:
                opening = self._pre[:idx]
                if opening:
                    out.append({"type": "delta", "content": opening})
                self._json = self._pre[idx + len(JSON_FENCE_START):]
                self._pre = ""
                self._seen = True
                events = self._try_close_json()
                out.extend(events)
            else:
                safe_at = max(0, len(self._pre) - len(self._safety_prefix))
                if safe_at > 0:
                    out.append({"type": "delta", "content": self._pre[:safe_at]})
                    self._pre = self._pre[safe_at:]
        else:
            self._json += chunk
            events = self._try_close_json()
            out.extend(events)

        return out

    def _try_close_json(self) -> list[EventDict]:
        """在 _json buffer 里尝试找到 JSON_FENCE_END 并 yield 事件。"""
        out: list[EventDict] = []
        idx = self._json.find(JSON_FENCE_END)
        if idx < 0:
            return out
        json_str = self._json[:idx]
        remainder = self._json[idx + len(JSON_FENCE_END):]
        if json_str.strip() and not self.event_emitted:
            parsed = _safe_parse_json(json_str)
            if parsed:
                ev = self.make_event(parsed)
                if ev:
                    self.event_emitted = True
                    out.append(ev)
        self._seen = False
        self._json = ""
        cleaned = remainder.strip()
        if cleaned and "```" not in cleaned and not cleaned.startswith("{"):
            out.append({"type": "delta", "content": remainder})
        return out

    def flush_final(self) -> Optional[EventDict]:
        """流结束后调用一次:尝试把残留的 pre / json buffer 转化为事件。"""
        if self.flush_final:
            if self._pre.strip():
                _ = self._pre
            return self.flush_final(self._json or self._pre)
        if self.event_emitted:
            return None
        if self._json.strip():
            parsed = _safe_parse_json(self._json)
            if parsed:
                ev = self.make_event(parsed)
                if ev:
                    return ev
        return None


def _safe_parse_json(text: str) -> Optional[dict]:
    """尝试从字符串解析 JSON,失败返回 None。"""
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for prefix in ("", "```json", "```"):
        for suffix in ("", "```"):
            candidate = text.strip()
            if prefix and not candidate.startswith(prefix):
                continue
            if suffix and not candidate.endswith(suffix):
                continue
            stripped = candidate
            if prefix:
                stripped = stripped[len(prefix):]
            if suffix:
                stripped = stripped[: -len(suffix)] if stripped.endswith(suffix) else stripped
            stripped = stripped.strip()
            try:
                return json.loads(stripped)
            except json.JSONDecodeError:
                continue
    return None