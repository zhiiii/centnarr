from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, AsyncIterator, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


JSON_RETRY_HINT = "\n\n注意：上次输出不是合法 JSON，请严格按 JSON 格式输出，不要任何多余文字，不要用 ```json 包裹。"


class LLMClient:
    def __init__(self):
        self.provider = settings.llm_provider
        self.api_key = settings.llm_api_key
        self.model = settings.llm_model
        self.base_url = settings.llm_base_url
        self.fallback_to_mock = settings.llm_fallback_to_mock

    def _require_api_key(self) -> None:
        if not self.api_key or not self.api_key.strip():
            raise RuntimeError(
                "LLM_API_KEY 未配置，请在 backend/.env 设置 LLM_API_KEY 后重启服务"
            )

    async def complete_json(
        self,
        system: str,
        user: str,
        *,
        max_retries: int = 2,
        temperature: float = 0.4,
        context: Optional[dict] = None,
    ) -> dict:
        last_err: Optional[Exception] = None
        current_user = user
        current_context = context
        for attempt in range(max_retries):
            try:
                raw = await self._complete_text(
                    system, current_user, temperature=temperature, context=current_context
                )
                result = self._parse_json(raw)
                if result is not None:
                    return result
                last_err = ValueError("LLM output is not valid JSON")
            except Exception as e:  # noqa: BLE001
                last_err = e
                logger.warning("LLM call failed (attempt %s): %s", attempt + 1, e)
            current_user = user + JSON_RETRY_HINT
            current_context = context
        raise RuntimeError(f"LLM failed after retries: {last_err}")

    async def complete_text(
        self,
        system: str,
        user: str,
        *,
        temperature: float = 0.7,
        context: Optional[dict] = None,
    ) -> str:
        return await self._complete_text(system, user, temperature=temperature, context=context)

    async def stream_text(
        self,
        system: str,
        user: str,
        *,
        temperature: float = 0.7,
        context: Optional[dict] = None,
    ) -> AsyncIterator[str]:
        async for chunk in self._stream_text(system, user, temperature=temperature, context=context):
            yield chunk

    async def _complete_text(
        self,
        system: str,
        user: str,
        *,
        temperature: float,
        context: Optional[dict] = None,
    ) -> str:
        if self.provider == "mock":
            return await self._mock_text(system, user, context=context)

        if self.provider == "openai":
            return await self._openai_text(system, user, temperature)

        if self.provider == "anthropic":
            return await self._anthropic_text(system, user, temperature)

        raise RuntimeError(f"Unknown LLM provider: {self.provider}")

    async def _stream_text(
        self,
        system: str,
        user: str,
        *,
        temperature: float,
        context: Optional[dict] = None,
    ) -> AsyncIterator[str]:
        if self.provider == "mock":
            text = await self._mock_text(system, user, context=context)
            for word in text.split(" "):
                await asyncio.sleep(0.02)
                yield word + " "
            return

        if self.provider == "openai":
            async for chunk in self._openai_stream(system, user, temperature):
                yield chunk
            return

        if self.provider == "anthropic":
            async for chunk in self._anthropic_stream(system, user, temperature):
                yield chunk
            return

        raise RuntimeError(f"Unknown LLM provider: {self.provider}")

    def _parse_json(self, raw: str) -> Optional[dict]:
        if not raw:
            return None
        cleaned = raw.strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        try:
            obj = json.loads(cleaned)
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if match:
            try:
                obj = json.loads(match.group(0))
                if isinstance(obj, dict):
                    return obj
            except json.JSONDecodeError:
                pass
        return None

    async def _openai_text(self, system: str, user: str, temperature: float) -> str:
        try:
            from openai import AsyncOpenAI
        except ImportError as e:
            raise RuntimeError("openai package not installed") from e

        self._require_api_key()
        client_kwargs: dict[str, Any] = {"api_key": self.api_key}
        if self.base_url:
            client_kwargs["base_url"] = self.base_url
        client = AsyncOpenAI(**client_kwargs)
        resp = await client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
        )
        return (resp.choices[0].message.content or "").strip()

    async def _openai_stream(self, system: str, user: str, temperature: float):
        from openai import AsyncOpenAI

        self._require_api_key()
        client_kwargs: dict[str, Any] = {"api_key": self.api_key}
        if self.base_url:
            client_kwargs["base_url"] = self.base_url
        client = AsyncOpenAI(**client_kwargs)
        stream = await client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            stream=True,
        )
        async for event in stream:
            delta = event.choices[0].delta.content if event.choices else None
            if delta:
                yield delta

    async def _anthropic_text(self, system: str, user: str, temperature: float) -> str:
        try:
            from anthropic import AsyncAnthropic
        except ImportError as e:
            raise RuntimeError("anthropic package not installed") from e

        client = AsyncAnthropic(api_key=self.api_key)
        resp = await client.messages.create(
            model=self.model,
            system=system,
            messages=[{"role": "user", "content": user}],
            temperature=temperature,
            max_tokens=2048,
        )
        return (resp.content[0].text or "").strip()

    async def _anthropic_stream(self, system: str, user: str, temperature: float):
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=self.api_key)
        async with client.messages.stream(
            model=self.model,
            system=system,
            messages=[{"role": "user", "content": user}],
            temperature=temperature,
            max_tokens=2048,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    def _wants_json(self, system: str, user: str) -> bool:
        return "JSON" in (system + user).upper()

    async def _mock_text(
        self,
        system: str,
        user: str,
        *,
        context: Optional[dict] = None,
    ) -> str:
        await asyncio.sleep(0.05)

        prompt_id = self._detect_prompt(system + "\n" + user)
        ctx = context or {}

        if prompt_id == "scene_identification":
            return self._mock_scene_identification(ctx.get("business_input") or user)
        if prompt_id == "question_generation":
            return self._mock_question_generation(user, ctx)
        if prompt_id == "info_integration":
            return self._mock_info_integration(ctx)
        if prompt_id == "prd_translation":
            return self._mock_prd_translation(ctx)

        return '{"ok": true}'

    def _detect_prompt(self, text: str) -> str:
        if "资深业务分析师" in text or "scene_identification" in text:
            return "scene_identification"
        if "资深产品经理" in text and "反问" in text:
            return "question_generation"
        if "资深文档整理专家" in text:
            return "info_integration"
        if "翻译成 PRD" in text or "PRD" in text and "翻译" in text:
            return "prd_translation"
        return "unknown"

    def _extract_user_business_input(self, user: str) -> str:
        m = re.search(r"业务人员这一轮说的所有话[：:]\s*(.+)$", user, re.S)
        return m.group(1).strip() if m else user

    def _mock_scene_identification(self, text: str) -> str:
        text = (text or "").strip()
        scene = text[:30] if text else "未识别场景"

        roles = []
        for kw, role in [
            ("仓库", "仓库"),
            ("客户", "客户"),
            ("客服", "客服"),
            ("经理", "经理"),
            ("用户", "用户"),
            ("订单", "客户"),
            ("开发", "开发"),
            ("老板", "经理"),
        ]:
            if kw in text and not any(r["name"] == role for r in roles):
                roles.append({"name": role, "responsibility": f"在场景中涉及的角色（{kw}）", "confidence": "medium"})

        if not roles:
            roles = [{"name": "业务人员", "responsibility": "提出需求的人", "confidence": "high"}]

        pain_points = []
        if text:
            pain_points.append({"description": text[:80], "frequency": "未知", "severity": "严重"})

        emotional_signal = "无奈"
        if any(k in text for k in ["着急", "焦虑", "不行", "投诉", "投诉了", "催"]):
            emotional_signal = "焦虑"
        if any(k in text for k in ["气", "骂", "差评", "投诉"]):
            emotional_signal = "愤怒"

        return json.dumps(
            {
                "scene": scene,
                "roles": roles,
                "pain_points": pain_points,
                "expected_outcomes": [{"description": "解决问题", "explicit": False}],
                "emotional_signal": emotional_signal,
                "urgency": "中",
                "summary": text[:100] if text else "",
            },
            ensure_ascii=False,
        )

    def _mock_question_generation(self, user: str, context: dict) -> str:
        prev = context.get("previous_analysis") or {}
        emotional_signal = prev.get("emotional_signal") if isinstance(prev, dict) else None

        questions = [
            {
                "id": "q1",
                "my_understanding": "客户先发现错——说明内部没监测到，只能等客户来报。",
                "question": "如果你是那个客户，第一次发现货对不上会怎么办？",
                "why_matters": "客户的反应路径决定系统入口该放在哪。",
            },
            {
                "id": "q2",
                "my_understanding": "这事不知道是天天发生还是偶尔大促爆雷。",
                "question": "这错误是日常偶发还是大促集中爆？",
                "why_matters": "不同爆发模式对应两套完全不同的架构。",
            },
        ]
        result: dict[str, Any] = {
            "questions": questions,
            "should_continue": False,
        }
        return json.dumps(result, ensure_ascii=False)

    def _mock_info_integration(self, context: dict) -> str:
        new_text = (context.get("new_input") or "").strip()
        prev_doc = context.get("previous_doc") or {}

        updated = dict(prev_doc)
        if new_text:
            pain_points = list(updated.get("pain_points") or [])
            if not pain_points:
                pain_points.append({"description": new_text[:80], "frequency": "中频", "severity": "严重"})
            else:
                pain_points[0]["description"] = (pain_points[0].get("description") or "") + "；" + new_text[:60]
                pain_points[0]["frequency"] = pain_points[0].get("frequency") or "中频"
            updated["pain_points"] = pain_points

            if not updated.get("background"):
                updated["background"] = new_text[:120]
            if not updated.get("scene"):
                updated["scene"] = new_text[:30]

        added: list[dict] = []
        if new_text:
            added.append({"field": "pain_points", "content": new_text[:80], "source": "业务人员这一轮新说"})

        completion = self._calc_mock_completion(updated)

        to_confirm: list[str] = []
        if not updated.get("pain_points") or len(updated["pain_points"]) < 2:
            to_confirm.append("出错类型")
        if not updated.get("roles"):
            to_confirm.append("责任方")
        if not updated.get("expected_outcomes"):
            to_confirm.append("期望效果")
        if not updated.get("key_scenarios"):
            to_confirm.append("关键场景")
        if not updated.get("background"):
            to_confirm.append("背景")

        updated["to_confirm"] = to_confirm

        return json.dumps(
            {
                "delta": {"added": added, "modified": [], "confirmed": []},
                "updated_doc": updated,
                "user_facing_summary": "我把你说的都记下来了。",
                "should_continue": completion < 80,
                "completion_percentage": completion,
            },
            ensure_ascii=False,
        )

    def _calc_mock_completion(self, doc: dict) -> int:
        score = 0
        if doc.get("scene"):
            score += 20
        if doc.get("background"):
            score += 15
        if doc.get("roles"):
            score += 15
        if doc.get("pain_points"):
            score += 20
        if doc.get("expected_outcomes"):
            score += 15
        if doc.get("key_scenarios"):
            score += 15
        return min(100, score)

    def _mock_prd_translation(self, context: dict) -> str:
        doc = context.get("confirmed_doc") or {}
        if not doc:
            return "# PRD：未命名需求\n\n> 来源：业务确认稿（兜底输出）\n"

        title = doc.get("scene") or "未命名需求"
        background = doc.get("background") or ""
        pain_points = doc.get("pain_points") or []
        roles = doc.get("roles") or []
        expected_outcomes = doc.get("expected_outcomes") or []
        key_scenarios = doc.get("key_scenarios") or []

        pain_md = "\n".join(f"- {p.get('description','')}（频率：{p.get('frequency','未知')}，严重程度：{p.get('severity','一般')}）" for p in pain_points)
        role_table = "\n".join(f"| {r.get('name','')} | {r.get('responsibility','')} |" for r in roles) or "| - | - |"
        expected_md = "\n".join(f"- {e.get('description','')}" for e in expected_outcomes)

        scenario_md = "\n".join(
            f"- **{s.get('description','')}**：" + (s.get("example") or "无具体例子") for s in key_scenarios
        ) or "- 暂无具体场景"

        md = f"""# PRD：{title}

> 来源：业务确认稿（业务人员已签收）
> 创建时间：自动生成

## 1. 需求背景

### 1.1 业务背景
{background or "（来自业务确认稿 - 待补充）"}

### 1.2 核心痛点
{pain_md or "- （来自业务确认稿 - 待补充）"}

### 1.3 业务价值
[AI 补充]
- 减少业务摩擦，提升团队效率
- 沉淀可复用的需求结构

## 2. 需求目标
{expected_md or "- （来自业务确认稿 - 待补充）"}

## 3. 用户角色与场景

### 3.1 角色定义
| 角色 | 主要职责 |
|------|---------|
{role_table}

### 3.2 关键场景
{scenario_md}

## 4. 功能需求

### 4.1 功能列表
[AI 补充 - 基于业务确认稿拆分]
1. 主功能：解决 {title}（来自业务确认稿）
2. 配套功能：异常处理与通知（AI 补充）

### 4.2 详细功能描述
[AI 补充]

## 5. 异常处理
[来自业务确认稿的边界情况]

## 6. 验收标准
[AI 根据业务确认稿生成]
- [ ] 业务人员能在合理时间内完成需求提交流程
- [ ] 文档输出结构完整、内容可读

## 7. 非功能需求（AI 补充）
- 性能：单次响应 < 10s
- 安全：用户数据加密存储
- 兼容性：主流浏览器 + 移动端

## 8. 待评估事项
- 与现有系统的对接方案
- 用户角色与权限模型
"""
        return md


_llm_client: Optional[LLMClient] = None


def get_llm() -> LLMClient:
    global _llm_client
    if _llm_client is None:
        _llm_client = LLMClient()
    return _llm_client