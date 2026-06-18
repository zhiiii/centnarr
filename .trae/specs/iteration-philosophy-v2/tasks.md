# Tasks：哲学改造 + 6 个技术点

按依赖顺序拆解。**先哲学（4 个 Prompt 重写），后技术（6 个点）**。

---

## Phase 1：产品哲学改造（4 个 Prompt 重写）

### Task 1: 场景识别 Prompt 1 重写
- [ ] 1.1 在 `app/prompts/scene_identification.md` 加产品经理视角
- [ ] 1.2 输出 schema 加 `businessperson_insight`（AI 视角下的潜台词）
- [ ] 1.3 输出 schema 加 `likely_implications`（产品经理会想到的延伸）
- [ ] 1.4 输出 schema 加 `translation_quality`（AI 自评"我听懂了 60%/80%/95%"）
- [ ] 1.5 prompt 强调"听完这段话，我作为产品经理会怎么理解"
- [ ] 1.6 验证：用 centnarr.md 案例重测，输出含新字段

### Task 2: 反问生成 Prompt 2 重写（核心）
- [ ] 2.1 在 `app/prompts/question_generation.md` 重写角色为"业务人员的翻译官"
- [ ] 2.2 核心哲学写进 prompt：
  > 你的任务不是套 5 个维度模板。你的任务是：听懂业务人员的大白话 → 用产品经理的视角翻译成"再大白话" → 反问回去让业务人员"对！你懂我！"
- [ ] 2.3 输出 schema 改：
  - 移除 `examples`（不要给业务人员选择题）
  - 改 `question` 字段为三段式：
    - `my_understanding`：AI 用产品经理视角"翻译"业务人员的大白话（一句话，10-30 字）
    - `confirm_with_businessperson`：用大白话回问"我理解成 X，对吗？"（15-40 字）
    - `guide_to_say_more`：引导业务人员主动说更多细节（不引导二选一）
- [ ] 2.4 反问的"原则"重写：
  - 不用"问题类型/责任方/关键场景/期望效果/边界情况"固定 5 维度作为"必须覆盖"
  - 改为"先听懂业务人员说的事 → 找出他**没说**但**关键**的细节 → 引导他说出来"
  - emotional_care **不**是"温情安抚"——是用产品经理的视角指出问题本质
- [ ] 2.5 prompt 加"方法论引用"：
  > 你在反问时，隐性遵循一个原则：业务人员负责"提供信息"，你负责"翻译和结构化"。所以反问的措辞要让业务人员感觉"我在告诉你事实"，而不是"我在做选择题"。
- [ ] 2.6 验证：用 centnarr.md 案例"仓库发货出错"重测，反问应该：
  - 听懂"客户自己发现"这个潜台词
  - 反问类似"听起来客户是第一个发现的——那内部是什么时候知道的？"
  - 不出现"流程问题/系统问题/人的问题"这种分类问题

### Task 3: 信息整合 Prompt 3 重写
- [ ] 3.1 在 `app/prompts/info_integration.md` 加产品经理视角
- [ ] 3.2 引导 AI 主动识别"业务人员没说但产品经理会想到的"信息（如：业务人员说"客户自己发现"，AI 主动识别"内部响应链路缺失"）
- [ ] 3.3 输出 schema 加 `product_manager_inference`（产品经理推断）
- [ ] 3.4 `user_facing_summary` 改成"我理解成 X，对吗？"的反问式：
  - 之前："我把你说的都记下来了"
  - 之后："听起来是 X 这种情况——我理解成 Y，意思是咱们想解决 Z，对吗？"
- [ ] 3.5 delta 输出加 `product_perspective` 字段（产品经理视角下的解读）

### Task 4: PRD 翻译 Prompt 4 重写
- [ ] 4.1 在 `app/prompts/prd_translation.md` 加"业务诉求 → 产品方案"对应表
- [ ] 4.2 输出 schema 在"功能需求"章节加 `why_this_design` 字段（每个功能说明为什么这样做）
- [ ] 4.3 引导 AI 把"业务人员的大白话"翻译成"产品语言"，但保留业务诉求原话
- [ ] 4.4 非业务部分（性能/安全/兼容性）补"产品经理默认假设"说明

---

## Phase 2：流式技术改造（6 个点）

### Task 5: ① 直接流式 LLM token
- [ ] 5.1 改 `app/services/ai_engine.py`：
  - `call_question_generation` 改成 async generator（替代返回 dict）
  - `call_info_integration` 改成 async generator
  - prompt 引导 LLM 输出可流式 JSON 片段
- [ ] 5.2 加 `parse_streaming_json_fragments` 函数：在 token 流里识别 `{}` 边界
- [ ] 5.3 改 `app/api/routes.py` 的 `post_respond_stream`：
  - 用 `async for fragment in ai_engine.stream_respond(...)` 遍历
  - 每个 fragment yield `data: {type:"delta", content:"..."}`
- [ ] 5.4 验证：首字延迟从 60s 降到 < 2s

### Task 6: ② 分块流式 UI
- [ ] 6.1 改 `app/conversation/[id]/page.tsx`：
  - 区分"流式文案"（开场白/情绪安抚，逐字追加到气泡）
  - 区分"静态卡片"（反问列表，一次性渲染）
- [ ] 6.2 新增 `components/QuestionsCard.tsx`：
  - 显示 5 个反问，每个用卡片样式
  - 每个卡片有"已回答"勾选框
  - 不逐字显示（一次性渲染）
- [ ] 6.3 改 `components/DocPanel.tsx`：
  - "骨架先出"：先显示 7 个章节的标题占位
  - "逐章填"：每个章节内容流式追加
- [ ] 6.4 验证：浏览器肉眼看到"骨架先出+逐章填"

### Task 7: ③ 取消流（AbortController + 90s 超时）
- [ ] 7.1 改 `app/conversation/[id]/page.tsx`：
  - `runStream` 用 `AbortController` 包 `fetch`
  - `useEffect` cleanup 触发 `controller.abort()`
  - 业务人员切页/重发消息时 abort
- [ ] 7.2 后端 `post_respond_stream` 接受 `request.is_disconnected()` 检查，主动停止 yield
- [ ] 7.3 加 90 秒超时：`AbortSignal.timeout(90_000)`
- [ ] 7.4 验证：业务人员切页面再回来，已 commit 的状态保留

### Task 8: ④ 错误处理保留输入
- [ ] 8.1 改 `app/conversation/[id]/page.tsx`：
  - 失败时 textarea 保留用户输入（已有 input state）
  - 错误条显示在气泡下方："AI 没想明白，重试一下？"
  - 重试按钮调 `lastSubmitRef.current` 复用
- [ ] 8.2 加静默重试 1 次：
  - 网络错误 / timeout 自动 retry 1 次
  - 业务人员无感（不显示重试中提示）
- [ ] 8.3 区分网络错误 vs LLM 错误：只有网络错误静默重试
- [ ] 8.4 验证：模拟 5xx 错误，textarea 保留输入 + 重试按钮可见

### Task 9: ⑤ 状态机同步精细化
- [ ] 9.1 后端 `_sse_state` 已在用，前端要细化处理：
  - `answering` → "AI 在想..."
  - `integrating` → "AI 正在整理..."
  - delta 流时 → "AI 在写..."
  - done 后清空
- [ ] 9.2 改前端状态栏 UI：增加 `streamSubState` state
- [ ] 9.3 验证：浏览器肉眼看到 4 种细分状态切换

### Task 10: ⑥ 单端点 + 内部流
- [ ] 10.1 保持单端点 `/api/conversation/respond/stream` 不变
- [ ] 10.2 内部 async generator 串联：
  - state=answering → 直接流式 LLM token → state=integrating → 流式解析 → done
- [ ] 10.3 验证：Network 面板只看到 1 个 /respond/stream 连接

---

## Phase 3：验证

### Task 11: 端到端验证
- [ ] 11.1 跑 3 场景（A/B/C），主流程不坏
- [ ] 11.2 11 个 state machine 单测 PASSED
- [ ] 11.3 业务人员真实用例（仓库发货、客服排队、采购审批）反问质量
- [ ] 11.4 TypeScript 0 错误
- [ ] 11.5 首字延迟 < 2 秒
- [ ] 11.6 LLM 调用次数：1 次/响应（之前 2 次）

### Task 12: 独立验证 Agent
- [ ] 12.1 派独立 Agent 验证反问哲学（用 3 业务案例）
- [ ] 12.2 派独立 Agent 验证流式 6 点
- [ ] 12.3 2 轮验证

---

## Task Dependencies

- Task 1-4（Prompt 重写）独立，可并行
- Task 5（流式 LLM token）依赖 Task 1-4（Prompt 改了流式才有内容）
- Task 6-10（前端）依赖 Task 5（流式改完才能改造前端）
- Task 11-12（验证）依赖全部

## 关键路径

Task 2（反问哲学重写）→ Task 5（流式）→ Task 6（分块 UI）→ Task 7-10（取消/错误/状态/单端点）→ Task 11-12（验证）
