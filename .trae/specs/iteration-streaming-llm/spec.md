# 迭代 Spec：真实 LLM 接入 + 流式输出 + 手动结束对话

## Why

MVP 1.0 跑通后，3 个核心体验问题被用户发现：

1. **流式对话是"假的"**：mock LLM 用 `asyncio.sleep` 模拟逐字输出，业务人员感觉不到"AI 真的在思考"
2. **大模型没用起来**：`.env` 仍是 `LLM_PROVIDER=mock`，4 个 Prompt 走 fallback_integration
3. **对话被自动结束**：respond 后 `completion ≥ 80%` 就自动跳 `CONFIRMING`，业务人员失去控制感

按真实场景（minimax-m3 走 OpenAI 协议，base_url=`https://api.minimaxi.com/v1`），让 AI 真正接入、流式输出、对话由业务人员主动结束。

## What Changes

**改 4 个模块**：

- **后端 LLM 客户端** — 读 `LLM_BASE_URL` 环境变量，OpenAI 调用支持自定义 base_url；`stream_text` 改用 `client.chat.completions.create(stream=True)` 真正 token-by-token 输出
- **后端对话 API** — 新增 `/api/conversation/message/stream` 和 `/api/conversation/respond/stream` 两个 SSE 端点（保留旧端点兼容），用 `StreamingResponse` 包装 generator
- **前端对话流** — 用 `fetch` + `ReadableStream` 接收 SSE（不能用 EventSource，因为 POST），实时逐字 append 到 AI 消息气泡
- **状态机 + UI** — 移除 respond 后自动跳 CONFIRMING 的逻辑；对话页左下角加"我聊够了"按钮，点击后显式触发 confirm

## Impact

- **后端文件**：`app/core/llm.py`、`app/core/config.py`、`app/api/routes.py`、`app/main.py`
- **前端文件**：`app/conversation/[id]/page.tsx`、`lib/api.ts`
- **配置**：`.env.example` 加 `LLM_BASE_URL` 字段
- **状态机**：`StateMachine.transition("integrated")` 不再因 `completion ≥ 80%` 自动跳 CONFIRMING

## ADDED Requirements

### Requirement: 真实 LLM 接入

系统 SHALL 在 `LLM_PROVIDER=openai` 且 `LLM_API_KEY` 非空时，真正调用 LLM（不再走 mock）。

#### Scenario: 配置正确
- **WHEN** `.env` 中 `LLM_PROVIDER=openai` + `LLM_API_KEY=sk-...` + `LLM_BASE_URL=https://api.minimaxi.com/v1`
- **THEN** 业务人员发消息后，后端真正调 minimax-m3 模型
- **AND** 响应包含真实 LLM 生成的 scene / roles / pain_points

#### Scenario: API Key 缺失
- **WHEN** `LLM_API_KEY` 为空
- **THEN** 后端返回明确错误："LLM_API_KEY 未配置，请在 backend/.env 设置"
- **AND** 不调用 mock 兜底（避免静默失败）

### Requirement: 真实流式输出

系统 SHALL 用 SSE（Server-Sent Events）逐字输出 AI 回复，前端实时显示打字效果。

#### Scenario: 流式渲染
- **WHEN** 业务人员发消息后等待 AI 反问
- **THEN** AI 第一个字在 1 秒内到达浏览器
- **AND** 后续 token 间隔 < 300ms
- **AND** UI 消息气泡逐字追加，无需等完整响应

#### Scenario: 流式格式
- **WHEN** 后端用 SSE 输出
- **THEN** 格式为 `data: {"type": "delta", "content": "你"}\n\n`，每行以 `\n\n` 分隔
- **AND** 流末尾发送 `data: {"type": "done", "questions": [...]}\n\n`

### Requirement: 手动结束对话

系统 SHALL 把"对话结束"从"自动跳 CONFIRMING"改为"业务人员点'我聊够了'按钮"。

#### Scenario: 业务人员主动结束
- **WHEN** 业务人员在对话页点"我聊够了"按钮
- **THEN** 后端调 `POST /api/conversation/finish` 端点，把 state 设为 `CONFIRMING`
- **AND** 前端跳到业务确认稿详情页（或在右侧显示"待签收"）

#### Scenario: 不会自动结束
- **WHEN** 业务人员已 respond 3 轮，completion=85%
- **THEN** state 仍是 `ASKING`（不是 `CONFIRMING`）
- **AND** UI 仍显示对话输入框和"我聊够了"按钮

### Requirement: 状态机改造

状态机 SHALL 在 `integrated` 转移后保持 `ASKING` 状态（移除自动跳 `CONFIRMING`）。

#### Scenario: 多轮对话不自动结束
- **WHEN** respond 触发 `integrated` 转移
- **THEN** `sm.state` 保持 `ASKING`（不因 `completion ≥ 80%` 跳 `CONFIRMING`）
- **AND** 业务人员必须显式触发 `confirm` 才进入 `CONFIRMING`

### Requirement: 兼容旧端点

旧端点（`/api/conversation/message` 和 `/api/conversation/respond`）仍可调用，用于非流式场景。

#### Scenario: 旧端点保持兼容
- **WHEN** 客户端用旧端点（不传 `?stream=true`）
- **THEN** 走非流式 JSON 响应（旧逻辑）
- **AND** 流式端点独立（`/stream` 后缀）

## 移除 / 调整

### 调整：`StateMachine.transition("integrated")` 行为
- **原**：completion ≥ 80% 时跳 CONFIRMING
- **新**：保持 ASKING，由显式的 `confirm` 端点跳 CONFIRMING
- **迁移**：UI 加"我聊够了"按钮触发 confirm

### 调整：Mock LLM 行为
- **原**：`LLM_PROVIDER=mock` 时走 `_mock_text` 假装调 LLM
- **新**：`LLM_PROVIDER=mock` 时仍走 mock（开发兜底），但 `.env.example` 默认推荐 `LLM_PROVIDER=openai`