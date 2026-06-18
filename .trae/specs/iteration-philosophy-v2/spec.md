# 迭代 Spec：AI 反问哲学 v2 + 流式技术 6 点

## Why

跑 3 场景测试时发现一个根本问题：**AI 反问的"灵魂"不对**。

当前反问是"机械问 5 个维度"——业务人员感觉"AI 在套模板"，不知道"AI 真懂我没"。

**用户的设计哲学**：
> AI 反问必须"带着产品经理的理解去提问"，不是固定模板。
> 核心思想：根据用户的大白话，给出**经过思考的翻译版大白话**进行反问。
> 不要太专业，尽量减少用户决策成本。

同时，**反问内容必须和需求文档中提到的方法论有相关性**（Spec 里讲"AI 主导翻译和结构化，人主导信息采集和决策"），不能是孤立问题。

## What Changes

### 4 个 Prompt 全部重写（产品经理式改造）

| Prompt | 之前 | 之后 |
|--------|------|------|
| **1 场景识别** | 输出 scene/roles/pain_points/emotional_signal 字段 | 增加 `businessperson_insight`（产品经理的洞察）、`likely_implications`（可能的延伸）、`translation_quality`（翻译质量自评）|
| **2 反问生成** | 5 个固定维度 + 4 个原则 | **核心哲学**：听懂潜台词 → 翻译成大白话回问；输出格式从"问题+why+examples"变成"我的理解+确认+引导"三段式；**永远不出现 A/B/C/D 选项**；emotional_care 从"温情安抚"变成"用产品经理的视角指出问题本质"|
| **3 信息整合** | 单纯整合 + delta | 增加"产品经理视角的隐含信息识别"（AI 主动说出业务人员没说的内容）；user_facing_summary 改成"我的理解是 X，对吗？"的反问式 |
| **4 PRD 翻译** | 8 章节直译 | 增加"业务诉求 → 产品方案"对应表，每个功能说明"为什么这样做" |

### 6 个技术点按顺序迭代

| # | 点 | 改造 |
|---|----|------|
| ① 流式内容来源 | 当前先 JSON 后重写（调 2 次 LLM）| **直接流式 LLM token**：去除 response_format，prompt 引导 LLM 输出可流式 JSON 片段，单次调用 |
| ② 页面流式 UI | 气泡内逐字 | **分块流式**：开场白/情绪安抚流式，反问卡片静态展示（5 个问题一眼看全），业务确认稿章节骨架先出+逐章填 |
| ③ 取消流 | 切页面不取消 | **AbortController + 90s 超时**：切页面/重发消息时取消，90s 兜底超时 |
| ④ 错误处理 | 流中断+错误条+重试按钮 | **保留输入+一键重试+静默重试 1 次**：失败时 textarea 保留用户输入，重试按钮一键重发；网络抖动时静默重试 1 次 |
| ⑤ 状态同步 | SSE state 事件（已实现）| **精细化**：answering（等 LLM）/ integrating（LLM 已返回）/ delta 流式（AI 在写）/ asking（流式完成） |
| ⑥ 多端点 vs 单端点 | 当前单端点 | **单端点 + 内部流**：保持单端点，**内部**按 ① 改造为流式 LLM token |

## Impact

- **4 个 Prompt 文件**全部重写
- **后端**：`app/services/ai_engine.py`（流式化）、`app/api/routes.py`（取消流、超时、错误重试）
- **前端**：`app/conversation/[id]/page.tsx`（AbortController、错误重试、分块 UI）、`components/DocPanel.tsx`（骨架先出）、新增 `components/QuestionsCard.tsx`（静态反问卡片）
- **不破坏**：8 个状态机、9 个旧 API 端点、`tests/test_state_machine.py` 11 个单测

---

## ADDED Requirements

### Requirement: AI 反问哲学 v2

系统 SHALL 让 AI 反问"带着产品经理的理解"——听懂潜台词，翻译成大白话回问。

#### Scenario: 听懂潜台词
- **WHEN** 业务人员说"仓库发货老是出错，我也没办法，经理让我来提个需求"
- **THEN** AI **不** 机械问"出错的频率是多少？"
- **AND** 而是用"我理解成 X"的方式：
  > "听起来这事反复出现，但具体每次是怎么出的错，是发错东西了，还是发漏了，还是发晚了？这几种处理起来不太一样。"

#### Scenario: 减少决策成本
- **WHEN** AI 反问时
- **THEN** 永远不出现 "A. 流程问题 B. 系统问题 C. 人的问题" 这种选择题
- **AND** 用开放问题引导业务人员主动描述：
  > "你印象里最深的一次出错是怎么发生的？当时客户怎么发现的？"

#### Scenario: 引用方法论
- **WHEN** AI 整合信息时
- **THEN** 隐性引用 Spec 的"AI 主导翻译和结构化，人主导信息采集和决策"哲学
- **AND** 用大白话告诉业务人员"我把你说的整理成 X，你看下对不对"

#### Scenario: 一致的产品视角
- **WHEN** 业务人员情绪是"焦虑"或"愤怒"
- **THEN** emotional_care **不**是"听起来挺头疼的"
- **AND** 是用产品经理的视角指出问题本质：
  > "这种'客户自己发现'的处理方式确实被动——你这边还没意识到问题，客户就已经在打电话投诉了。咱们把'怎么让内部先知道'搞清楚，问题就好处理一半。"

### Requirement: 直接流式 LLM token

系统 SHALL 在 respond 流式端点中**直接流式 LLM token**——首字延迟 < 2 秒。

#### Scenario: 单次 LLM 调用
- **WHEN** 业务人员发回答
- **THEN** 后端**只调 1 次 LLM**（不调 2 次）
- **AND** LLM 用 `stream=True` 模式输出
- **AND** prompt 引导 LLM 输出可流式 JSON 片段（如 `{"text":"...","meta":null}{"text":"...","meta":null}`）
- **AND** 后台 parser 在流里识别 `{}` 边界

#### Scenario: 首字延迟
- **WHEN** 业务人员发回答后
- **THEN** 第 1 个 SSE delta 事件在 **2 秒内** 到达浏览器
- **AND** 后续 token 间隔 < 300ms

### Requirement: 分块流式 UI

系统 SHALL 把 AI 回复拆成"流式"和"静态"两类分别渲染。

#### Scenario: 流式渲染
- **WHEN** AI 回复含"开场白"或"情绪安抚"
- **THEN** 用气泡逐字追加（流式）

#### Scenario: 静态反问卡片
- **WHEN** AI 生成反问列表
- **THEN** 用**反问卡片**组件一次性展示所有问题
- **AND** 不逐字显示（避免"问题列表反直觉"）
- **AND** 卡片可勾选"已回答"（业务人员标记自己回答过了）

#### Scenario: 业务确认稿骨架
- **WHEN** AI 整合信息后更新右侧文档
- **THEN** **先**显示 7 个章节的骨架（标题占位）
- **AND** **再**逐章填内容（流式）
- **AND** 业务人员能"看 AI 怎么组织我的大白话"

### Requirement: 取消流 + 超时

系统 SHALL 业务人员切页面/重发消息时取消流式请求，90 秒未完成自动超时。

#### Scenario: 切页面取消
- **WHEN** 业务人员从对话页跳到历史库
- **THEN** useEffect cleanup 触发 AbortController.abort()
- **AND** 后端 generator 收到 abort 信号后停止 yield
- **AND** 业务人员回到对话页能拿到已 commit 的状态

#### Scenario: 重发取消
- **WHEN** 业务人员流式响应中点"发送"再次发消息
- **THEN** 前一个流的 AbortController.abort() 触发
- **AND** 新的流建立（业务人员输入保留）

#### Scenario: 90 秒超时
- **WHEN** 流式响应超过 90 秒未完成
- **THEN** 自动 abort + 显示"AI 想得有点久，已经自动取消，点这里重试"
- **AND** 业务人员输入保留

### Requirement: 错误处理保留输入

系统 SHALL 流式失败时保留业务人员输入，支持一键重试 + 静默重试 1 次。

#### Scenario: 网络抖动静默重试
- **WHEN** 流式失败原因是网络抖动（timeout / connection reset）
- **THEN** 前端静默重试 1 次（业务人员无感）
- **AND** 重试失败才显示错误条

#### Scenario: 业务错误显示重试
- **WHEN** 流式失败原因是 LLM 错误（4xx/5xx）
- **THEN** textarea 保留用户输入
- **AND** 显示错误条 "AI 没想明白，重试一下？" + 重试按钮
- **AND** 重试时**不发空请求**，复用 lastSubmitRef

#### Scenario: 流中断保留内容
- **WHEN** 流式响应在中间某 token 失败
- **THEN** 气泡内已流出的内容保留
- **AND** 错误条显示在内容下方
- **AND** 重试按钮可点

### Requirement: 状态机同步精细化

SSE state 事件 SHALL 包含 4 种细分状态供前端显示。

#### Scenario: 4 种状态显示
- **WHEN** 流式响应进行中
- **THEN** 状态栏右侧实时显示：
  - `answering`（业务人员发完消息，AI 在想）→ 显示"AI 在想..."
  - `integrating`（AI 整合信息）→ 显示"AI 正在整理..."
  - 流式 delta 输出时 → 显示"AI 在写..."
  - `done` 后 → 状态栏清空

### Requirement: 单端点 + 内部流

系统 SHALL 保持单端点 `/api/conversation/respond/stream`，**内部**用 async generator 串联多个 LLM 调用，前端只看到一条流。

#### Scenario: 内部串联
- **WHEN** 业务人员发回答
- **THEN** 端点内 async generator 顺序：
  1. `yield state=answering`
  2. 直接流式 LLM 调用（调 1 次而非 2 次）
  3. `yield state=integrating`
  4. 流式 LLM token 解析为 JSON 片段
  5. `yield delta=<text>`
  6. `yield state=asking`
  7. `yield done={...}`

#### Scenario: 前端只看到一条流
- **WHEN** 业务人员前端看 Network 面板
- **THEN** 只看到 1 个 `/respond/stream` 连接
- **AND** 不暴露内部 LLM 调用细节

---

## 移除 / 调整

### 调整：`stream_questions_as_text` / `stream_summary_as_text` 函数
- **原**：先调非流式拿 JSON，再调流式 LLM 翻译
- **新**：直接流式 LLM token，prompt 引导输出可流式 JSON 片段

### 调整：Prompt 2（反问生成）输出格式
- **原**：`{questions: [{id, dimension, question, why, examples}]}`
- **新**：`{questions: [{id, dimension, my_understanding, confirm_with_businessperson, guide_to_say_more}], emotional_care}`
- 字段语义变化：
  - `my_understanding`：AI 用产品经理视角"翻译"业务人员的大白话
  - `confirm_with_businessperson`：用大白话回问"我理解成 X，对吗？"
  - `guide_to_say_more`：引导业务人员主动说更多细节（不是给选择题）

### 不变
- 8 个状态机转移
- 9 个旧 API 端点
- state_machine.py 11 个单测
- 整体架构（后端 FastAPI + 前端 Next.js）

---

## Out of Scope（明确不做）

- 不做"AI 模型选择"功能
- 不做"管理员后台"
- 不做 PRD 章节编辑（v1.1 再做）
- 不做多语言
- 不做移动端
