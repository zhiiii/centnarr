# Tasks

按顺序实施，3 个 Phase。

---

## Phase 1：LLM 客户端 + 状态机改造

### Task 1: LLM 客户端支持自定义 base_url
- [ ] 1.1 在 `app/core/config.py` 加 `llm_base_url: str = ""` 字段
- [ ] 1.2 在 `app/core/llm.py` 的 `LLMClient.__init__` 读 `settings.llm_base_url`
- [ ] 1.3 改 `_openai_text` 传 `base_url=self.base_url or None` 给 `AsyncOpenAI`
- [ ] 1.4 改 `_openai_stream` 同样传 `base_url`
- [ ] 1.5 配置 `.env.example` 加 `LLM_BASE_URL=`
- [ ] 1.6 在 `.env` 写入用户给的 `https://api.minimaxi.com/v1` + `LLM_PROVIDER=openai` + `LLM_MODEL=MiniMax-Text-01`（`LLM_API_KEY` 留空占位让用户填）

### Task 2: 状态机移除自动 CONFIRMING
- [ ] 2.1 在 `app/core/state_machine.py` 的 `transition("integrated")` 中，**不再**因 `completion >= COMPLETION_THRESHOLD` 跳 CONFIRMING
- [ ] 2.2 改为统一跳回 ASKING（让业务人员继续对话或主动结束）
- [ ] 2.3 `tests/test_state_machine.py` 中 `test_low_completion_loops_back` 仍 PASSED（这个本来就期望跳 ASKING）
- [ ] 2.4 新增 `test_integrated_stays_in_asking`：即使 completion=85，`integrated` 后 state 应为 ASKING
- [ ] 2.5 跑 `pytest tests/` 验证 7/7 PASSED

---

## Phase 2：后端 SSE 流式端点

### Task 3: 新增流式端点 `/api/conversation/message/stream`
- [ ] 3.1 在 `app/api/routes.py` 加 `post_message_stream`
- [ ] 3.2 用 `StreamingResponse` 包装 async generator
- [ ] 3.3 调用 `call_scene_identification`（非流式，但产生 AI 反问）
- [ ] 3.4 调 `call_question_generation`（这个可流式）
- [ ] 3.5 SSE 格式：`data: {"type": "delta", "content": "..."}\n\n`
- [ ] 3.6 流末尾 `data: {"type": "done", "state": "asking", "doc": {...}, "questions": [...]}\n\n`
- [ ] 3.7 错误时 `data: {"type": "error", "message": "..."}\n\n`

### Task 4: 新增流式端点 `/api/conversation/respond/stream`
- [ ] 4.1 在 `app/api/routes.py` 加 `post_respond_stream`
- [ ] 4.2 类似 Task 3，但走 `call_info_integration` + `call_question_generation` 路径
- [ ] 4.3 SSE 输出 user_facing_summary（可流式）+ 末尾 done 含 questions

### Task 5: 新增手动结束端点 `/api/conversation/finish`
- [ ] 5.1 在 `app/api/routes.py` 加 `post_finish`
- [ ] 5.2 显式把 state 设为 `CONFIRMING`
- [ ] 5.3 返回 `{state: "confirming", doc: ...}`

---

## Phase 3：前端 SSE 接收 + UI 改造

### Task 6: 前端 SSE 接收器
- [ ] 6.1 在 `lib/api.ts` 加 `streamConversation()` 函数（用 `fetch` + `ReadableStream`，不能用 EventSource 因为 POST）
- [ ] 6.2 解析 `data: {...}` 格式，yield 解析后的 JSON 对象
- [ ] 6.3 区分 `delta`（流式累加）和 `done`（最终结果）

### Task 7: 对话页用流式
- [ ] 7.1 在 `app/conversation/[id]/page.tsx` 把 `run()` 改为 `runStream()`
- [ ] 7.2 提交消息后，立即在对话流插入一个"空的 AI 消息气泡"
- [ ] 7.3 监听 SSE `delta` 事件，逐字 append 到该气泡
- [ ] 7.4 监听 SSE `done` 事件，保存 questions + doc + 触发 refetch
- [ ] 7.5 错误时在气泡内显示错误条 + 重试按钮

### Task 8: "我聊够了"按钮
- [ ] 8.1 在对话页底部右下方加按钮（次要样式，跟"发送"按钮并列）
- [ ] 8.2 点击后调 `api.finishConversation()`
- [ ] 8.3 成功后状态机跳到 CONFIRMING，前端重新拉数据，右侧显示"待签收"
- [ ] 8.4 提示：state 已是 confirming 时按钮变为"已聊完"且 disabled

### Task 9: 兼容性保留
- [ ] 9.1 旧 `sendFirstMessage` / `respond` 端点继续工作（V1 的非流式）
- [ ] 9.2 新增 `streamFirstMessage` / `streamRespond` 调用流式端点
- [ ] 9.3 验证旧 V1 验证脚本仍 PASSED

---

## Phase 4：端到端验证

### Task 10: 真实 LLM 联调
- [ ] 10.1 用户在 `.env` 填入 API Key
- [ ] 10.2 重启后端
- [ ] 10.3 跑完整 E2E 流程，验证 AI 真实输出（不是 mock）
- [ ] 10.4 验证 delta 是真 LLM 输出（不是 fallback）

### Task 11: 流式输出验证
- [ ] 11.1 浏览器打开对话页
- [ ] 11.2 发一条消息，肉眼可见"AI 正在打字"
- [ ] 11.3 Network 面板看 SSE chunk 到达
- [ ] 11.4 Network 面板看首字延迟 < 1 秒

### Task 12: 手动结束对话验证
- [ ] 12.1 respond 3 轮，completion=85%
- [ ] 12.2 验证 state 仍是 asking（不是 confirming）
- [ ] 12.3 点"我聊够了"按钮
- [ ] 12.4 验证 state 跳到 confirming
- [ ] 12.5 验证业务确认稿可签收

---

## Task Dependencies

- Task 1（LLM 客户端）独立
- Task 2（状态机）独立
- Task 3/4/5（后端流式端点）依赖 Task 1
- Task 6/7/8/9（前端）依赖 Task 3/4/5
- Task 10/11/12（验证）依赖所有 Task

## 关键路径

Task 1（LLM 客户端）→ Task 3/4/5（后端流式）→ Task 7/8（前端 UI）→ Task 10/11/12（验证）