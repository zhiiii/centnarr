# Checklist

## Phase 1：LLM 客户端 + 状态机

- [ ] `app/core/config.py` 有 `llm_base_url: str = ""` 字段
- [ ] `app/core/llm.py` 的 `LLMClient.__init__` 读 `settings.llm_base_url`
- [ ] `_openai_text` / `_openai_stream` 传 `base_url` 给 `AsyncOpenAI`
- [ ] `.env.example` 含 `LLM_BASE_URL=`
- [ ] `.env` 当前 `LLM_PROVIDER=openai` + `LLM_BASE_URL=https://api.minimaxi.com/v1` + `LLM_MODEL=MiniMax-Text-01`
- [ ] `StateMachine.transition("integrated")` 不再因 `completion >= 80%` 跳 CONFIRMING
- [ ] `test_integrated_stays_in_asking` 新单测 PASSED
- [ ] `pytest tests/` 7/7 PASSED

## Phase 2：后端流式

- [ ] `POST /api/conversation/message/stream` 存在并返回 SSE
- [ ] `POST /api/conversation/respond/stream` 存在并返回 SSE
- [ ] `POST /api/conversation/finish` 存在并显式跳 CONFIRMING
- [ ] SSE 格式正确：`data: {"type": "delta", "content": "..."}\n\n` + 末尾 `done`
- [ ] 错误时 `data: {"type": "error", "message": "..."}\n\n`
- [ ] curl 测试流式响应有 `transfer-encoding: chunked` 或多个 `data:` 行

## Phase 3：前端流式

- [ ] `lib/api.ts` 的 `streamConversation` 函数能解析 SSE
- [ ] 对话页提交后立即插入空 AI 消息气泡
- [ ] 监听 `delta` 事件逐字 append
- [ ] 监听 `done` 事件保存 questions + 触发 refetch
- [ ] 错误时气泡内显示错误条 + 重试按钮
- [ ] 旧非流式端点继续兼容
- [ ] TypeScript 0 错误

## Phase 4：UI 改造

- [ ] 对话页底部右下方有"我聊够了"按钮
- [ ] 按钮点击后调 `api.finishConversation()`
- [ ] 成功后 state 跳 confirming，右侧显示"待签收"
- [ ] state 已是 confirming 时按钮 disabled

## Phase 5：真实 LLM 联调

- [ ] 用户在 `.env` 填入 API Key
- [ ] 重启后端
- [ ] 跑完整 E2E 流程，AI 真实输出
- [ ] delta 含真实 LLM 内容（不是 fallback）

## Phase 6：流式输出验证

- [ ] 浏览器肉眼可见"AI 正在打字"
- [ ] Network 面板看 SSE chunk
- [ ] 首字延迟 < 1 秒
- [ ] token 间隔 < 300ms

## Phase 7：手动结束验证

- [ ] respond 3 轮，completion=85%，state 仍是 asking
- [ ] 点"我聊够了"按钮
- [ ] state 跳 confirming
- [ ] 业务确认稿可签收

## 回归

- [ ] 7 个 state machine 单测 PASSED
- [ ] V1 验证脚本 27 项 PASSED
- [ ] 旧非流式端点（不带 /stream）仍工作
- [ ] 4 个旧 Prompt 仍能调通（不再走 fallback）