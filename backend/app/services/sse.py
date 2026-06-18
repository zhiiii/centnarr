"""sse 模块:Server-Sent Events 协议层。

把"事件 → 字符串"的格式化逻辑从 routes 抽出来,让 SSE 协议层与
HTTP 路由层彻底分离。所有函数返回完整的 SSE 帧(以 \\n\\n 结尾)。
"""
from __future__ import annotations

import json
from typing import Any


def sse_delta(content: str) -> str:
    """SSE delta 事件:{"type": "delta", "content": ...}"""
    return f"data: {json.dumps({'type': 'delta', 'content': content}, ensure_ascii=False)}\n\n"


def sse_error(message: str) -> str:
    """SSE 错误事件:{"type": "error", "message": ...}"""
    return f"data: {json.dumps({'type': 'error', 'message': message}, ensure_ascii=False)}\n\n"


def sse_state(state: str) -> str:
    """SSE 状态事件:{"type": "state", "state": "..."} — 让前端实时看到状态机变化"""
    return f"data: {json.dumps({'type': 'state', 'state': state}, ensure_ascii=False)}\n\n"


def sse_event(payload: dict) -> str:
    """SSE 通用事件:{"type": "<payload.type>", ...payload}"""
    return f"data: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"


def sse_done(payload: dict) -> str:
    """SSE done 事件:{"type": "done", ...payload}"""
    body = {"type": "done", **payload}
    return f"data: {json.dumps(body, ensure_ascii=False, default=str)}\n\n"


async def stream_with_timeout(gen, timeout_s: float):
    """为异步 generator 增加 idle timeout。

    如果两次 yield 间隔超过 timeout_s,抛出 asyncio.TimeoutError。
    让前端能感知"AI 卡住了"。
    """
    while True:
        try:
            chunk = await asyncio.wait_for(anext(gen), timeout=timeout_s)
        except StopAsyncIteration:
            return
        yield chunk


import asyncio  # noqa: E402  (放在文件下方以保持上面工具函数的纯净)