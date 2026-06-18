"""End-to-end conversation flow smoke test.

覆盖完整对话链路:
  1. start conversation with initial
  2. stream first message → 收到 state / delta / questions / scene_analysis
  3. respond to first question
  4. stream respond → 收到 state / delta / integration
  5. 多次对话后达到 completion 阈值
  6. finish → state=confirming
  7. confirm → state=prd_generating → completed

如果任何一步失败, raise AssertionError。
"""
from __future__ import annotations

import asyncio
import json
import sys
import time
import uuid
from typing import Any

import httpx


BASE = "http://127.0.0.1:8001/api"
TIMEOUT = httpx.Timeout(60.0, read=120.0)


def log(label: str, msg: Any) -> None:
    print(f"  [{label}] {msg}", flush=True)


async def start_conversation(client: httpx.AsyncClient, initial: str) -> str:
    r = await client.post(f"{BASE}/conversation/start", json={"initial": initial})
    r.raise_for_status()
    data = r.json()
    assert "conversation_id" in data, f"no conversation_id: {data}"
    log("start", f"conv_id={data['conversation_id']} state={data['state']}")
    return data["conversation_id"]


async def stream_message(
    client: httpx.AsyncClient,
    conv_id: str,
    content: str,
    is_async: bool = False,
) -> list[dict]:
    """Send a message via streaming endpoint and collect all SSE events."""
    events: list[dict] = []
    async with client.stream(
        "POST",
        f"{BASE}/conversation/message/stream",
        json={
            "conversation_id": conv_id,
            "content": content,
            "is_async_supplement": is_async,
            "input_type": "text",
            "meta": None,
        },
    ) as resp:
        assert resp.status_code == 200, f"stream failed: {resp.status_code}"
        async for line in resp.aiter_lines():
            line = line.strip()
            if not line.startswith("data: "):
                continue
            payload = line[len("data: "):]
            try:
                ev = json.loads(payload)
                events.append(ev)
            except json.JSONDecodeError:
                log("warn", f"non-JSON SSE payload: {payload[:100]}")
    return events


async def stream_respond(
    client: httpx.AsyncClient,
    conv_id: str,
    content: str,
    is_async: bool = False,
) -> list[dict]:
    events: list[dict] = []
    async with client.stream(
        "POST",
        f"{BASE}/conversation/respond/stream",
        json={
            "conversation_id": conv_id,
            "content": content,
            "is_async_supplement": is_async,
            "input_type": "text",
            "meta": None,
        },
    ) as resp:
        assert resp.status_code == 200, f"respond stream failed: {resp.status_code}"
        async for line in resp.aiter_lines():
            line = line.strip()
            if not line.startswith("data: "):
                continue
            payload = line[len("data: "):]
            try:
                ev = json.loads(payload)
                events.append(ev)
            except json.JSONDecodeError:
                pass
    return events


def event_summary(events: list[dict]) -> dict:
    types = {}
    for e in events:
        t = e.get("type", "?")
        types[t] = types.get(t, 0) + 1
    return types


async def get_conversation(client: httpx.AsyncClient, conv_id: str) -> dict:
    r = await client.get(f"{BASE}/conversation/{conv_id}")
    r.raise_for_status()
    return r.json()


async def edit_doc(client: httpx.AsyncClient, conv_id: str, path: str, value: Any) -> dict:
    r = await client.patch(
        f"{BASE}/conversation/{conv_id}/doc",
        json={"field_path": path, "value": value},
    )
    r.raise_for_status()
    return r.json()


async def finish_conversation(client: httpx.AsyncClient, conv_id: str) -> dict:
    r = await client.post(
        f"{BASE}/conversation/finish",
        json={"conversation_id": conv_id},
    )
    r.raise_for_status()
    return r.json()


async def confirm_conversation(client: httpx.AsyncClient, conv_id: str) -> dict:
    r = await client.post(
        f"{BASE}/conversation/confirm",
        json={"conversation_id": conv_id, "confirmed_doc": {}},
    )
    r.raise_for_status()
    return r.json()


async def generate_prd(client: httpx.AsyncClient, conv_id: str) -> dict:
    r = await client.post(
        f"{BASE}/prd/generate",
        json={"conversation_id": conv_id},
    )
    r.raise_for_status()
    return r.json()


def assert_event_types_present(events: list[dict], required: list[str], step: str) -> None:
    types = {e.get("type") for e in events}
    missing = [t for t in required if t not in types]
    if missing:
        types_summary = event_summary(events)
        raise AssertionError(f"[{step}] 缺少事件: {missing} | 收到: {types_summary}")


async def main() -> int:
    print("=" * 70)
    print("  对话流程端到端测试")
    print("=" * 70)
    print()

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # 1. start
        print("1. 启动对话")
        conv_id = await start_conversation(
            client, "客户天天打电话骂我们发货慢，经理让我来提需求"
        )

        # 2. stream first message
        print("\n2. 发送首条消息 (SSE)")
        t0 = time.time()
        events = await stream_message(client, conv_id, "")
        elapsed = time.time() - t0
        log("first_msg", f"耗时 {elapsed:.1f}s, 事件数 {len(events)}, 摘要 {event_summary(events)}")
        assert_event_types_present(events, ["state", "delta", "questions", "done"], "first_message")
        # scene_analysis 是可选的(异步路径),不强制要求

        # 3. 验证 state 走到 asking
        conv = await get_conversation(client, conv_id)
        log("get_conv", f"state={conv['state']} round={conv['current_round']} completion={conv['completion']}")
        assert conv["state"] == "asking", f"expected 'asking', got {conv['state']}"

        # 4. 回答第一组问题
        print("\n3. 回答 AI 反问 (SSE respond)")
        events = await stream_respond(
            client,
            conv_id,
            "是仓库发货环节出错。每月大概 3-5 次。客户收货时发现数量对不上，有时候少几台有时候多几台。",
        )
        log("respond_1", f"事件数 {len(events)}, 摘要 {event_summary(events)}")
        assert_event_types_present(events, ["state", "integration", "done"], "respond")

        # 5. 看看 doc 是否更新
        conv = await get_conversation(client, conv_id)
        log("get_conv", f"state={conv['state']} round={conv['current_round']} completion={conv['completion']}")
        log("doc", f"pain_points={len(conv['doc'].get('pain_points', []))} roles={len(conv['doc'].get('roles', []))}")
        assert conv["completion"] >= 20, f"completion should rise after respond, got {conv['completion']}"

        # 6. 直接编辑 doc（用户手动补充）
        print("\n4. 手动编辑 doc (PATCH)")
        edit_resp = await edit_doc(
            client,
            conv_id,
            "background",
            "业务背景: 仓库人员疏忽 + 客户当面拆包验收。每天发货 50-100 台手机等电子产品,出问题影响客户复购。",
        )
        log("edit_doc", f"old_value={edit_resp.get('old_value', '')[:30]}... new_field=updated")
        assert edit_resp["doc"]["background"].startswith("业务背景")

        # 7. 反复对话几轮以提高 completion
        print("\n5. 继续对话以达到确认阈值")
        for i in range(3):
            conv = await get_conversation(client, conv_id)
            if conv["completion"] >= 70:
                log("skip_round", f"已足够 (completion={conv['completion']})")
                break
            events = await stream_respond(
                client,
                conv_id,
                f"补充信息第 {i+1} 轮: 出错时由客户经理跟进,联系仓库主管,要求 24 小时内补发或者退款。出错成本大约每单 200-500 元。",
            )
            log(f"respond_{i+2}", f"事件数 {len(events)}, 摘要 {event_summary(events)}")
            conv = await get_conversation(client, conv_id)
            log("get_conv", f"completion={conv['completion']}")

        # 8. 验证 state 还合理(可能还在 asking 也可能到 confirming)
        conv = await get_conversation(client, conv_id)
        log("state_before_finish", conv["state"])

        # 9. 触发 finish
        print("\n6. 用户结束对话 (POST finish)")
        try:
            finish_resp = await finish_conversation(client, conv_id)
            log("finish", f"state={finish_resp.get('state')}")
            assert finish_resp["state"] == "confirming", f"expected 'confirming', got {finish_resp['state']}"
        except httpx.HTTPStatusError as e:
            err = e.response.json()
            log("finish_err", err.get("detail", err))
            # 可能 finish 要求 state != confirming,如果是直接 confirm 测试
            raise

        # 10. confirm
        print("\n7. 用户签收 (POST confirm)")
        try:
            confirm_resp = await confirm_conversation(client, conv_id)
            log("confirm", f"state={confirm_resp.get('state')}")
        except httpx.HTTPStatusError as e:
            err = e.response.json()
            log("confirm_err", err.get("detail", err))
            raise

        # 10b. generate PRD
        print("\n7b. 生成 PRD (POST generate_prd)")
        try:
            prd_resp = await generate_prd(client, conv_id)
            log("generate_prd", f"prd_id={prd_resp.get('prd_id', '?')[:8]}...")
        except httpx.HTTPStatusError as e:
            err = e.response.json()
            log("generate_prd_err", err.get("detail", err))
            raise

        # 11. 等待 PRD 生成(可能耗时)
        print("\n8. 等待 PRD 生成")
        for i in range(20):
            await asyncio.sleep(2)
            conv = await get_conversation(client, conv_id)
            log("polling", f"state={conv['state']} has_prd={conv.get('has_prd')}")
            if conv.get("has_prd"):
                break

        # 12. 最终断言
        print("\n9. 最终状态")
        conv = await get_conversation(client, conv_id)
        log("final", f"state={conv['state']} completion={conv['completion']} has_prd={conv.get('has_prd')}")
        assert conv.get("has_prd"), "PRD 未生成"
        assert conv["state"] in ("prd_generating", "completed"), f"unexpected final state: {conv['state']}"

    print("\n" + "=" * 70)
    print("  ✅ 所有端到端步骤通过")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))