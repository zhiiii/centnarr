# 需求文档 AI 协作系统 MVP Spec

## Why

业务人员不会写需求文档（不会抽象、不会组织语言），但他们掌握"现场感"。现有 AI 工具（Notion AI、飞书智能伙伴、PingCode）要么是"AI 写完人改"的写作工具，要么不会主动问诊，要么一次性输出不可迭代，导致业务人员提不出需求、产品经理拿不到能用的 PRD。

本系统要做的是：**让 AI 像资深产品经理一样主动问诊，把业务人员的大白话实时翻译成结构化的"业务确认稿"，再生成给开发看的 PRD**。AI 主导"翻译和结构化"，人主导"信息采集和决策"。

## What Changes

**全新项目（0-1）**，交付一个可运行的 MVP 系统，包含三大模块：

- **模块 1：AI 问诊引擎** — 多输入接入 + 4 个 Prompt 协作（场景识别 / 反问生成 / 信息整合 / PRD 翻译）+ 状态机管理 + JSON 错误兜底
- **模块 2：实时文档生长** — 左对话右文档布局 + 业务确认稿实时更新 + 沟通记录时间线 + "待确认"标记
- **模块 3：PRD 生成与导出** — 业务确认稿 → PRD 翻译 + 多格式导出（Markdown / 飞书 / 复制）+ 历史需求库

技术栈：Next.js + Tailwind（前端）、FastAPI（后端）、PostgreSQL/Supabase（数据库）、GPT-4 / Claude 3.5（LLM）、Vercel + Fly.io（部署）。

**不在 MVP 范围**：多人协作、权限管理、需求模板、AI 拆解任务、需求评审/评论、跟项目管理工具打通、移动端、多语言、AI 模型选择。

## Impact

- **Affected specs**：无（全新项目）
- **Affected code**：新建项目骨架 `/Users/ai_p/centnarr/`
- **Affected users**：业务人员（主）、产品经理（次）、开发者（终）

---

## ADDED Requirements

### Requirement: 多输入接入

系统 SHALL 提供 4 种输入方式供业务人员描述需求：语音输入（最长 5 分钟）、文字输入、截图 + AI 解读、粘贴文件（聊天记录 / 邮件 / 文档片段）。

#### Scenario: 业务人员语音描述
- **WHEN** 业务人员按住录音按钮说完一段话并松开
- **THEN** 系统在 3 秒内完成语音转文字并送入 AI 协作引擎处理
- **AND** 对话流显示语音时长标签和转写后的文字内容

#### Scenario: 业务人员粘贴聊天记录
- **WHEN** 业务人员粘贴一段聊天记录（含多轮对话）
- **THEN** 系统识别输入类型为"粘贴文件"
- **AND** AI 把整段对话当作一次"业务人员发言"处理

### Requirement: 场景识别（Prompt 1）

系统 SHALL 在业务人员第一次发言后，调用 Prompt 1 识别场景、角色、痛点、期望效果、情绪信号。

#### Scenario: 首次识别
- **WHEN** 业务人员说"我们仓库发货老是出问题，客户收到货对不上"
- **THEN** Prompt 1 输出 JSON：`scene="仓库发货数量对不上"`，roles 含"客户/仓库"，pain_points 含"客户收货对不上"，emotional_signal="无奈"
- **AND** 输出严格符合 JSON Schema，无多余文字

#### Scenario: 字段缺失兜底
- **WHEN** Prompt 1 输出缺少必填字段（scene/roles/pain_points/emotional_signal）
- **THEN** 系统抛错并返回给业务人员"我没理解你的意思，能再说一遍吗？"
- **AND** 不进入下一状态

### Requirement: 主动反问（Prompt 2）

系统 SHALL 在场景识别后或每一轮整合后，调用 Prompt 2 生成 3-5 个反问。问题必须覆盖"问题类型 / 责任方 / 关键场景 / 期望效果 / 边界情况"五个维度中的至少 3 个。

#### Scenario: 业务人员情绪焦虑
- **WHEN** 业务人员情绪信号是"焦虑"或"愤怒"
- **THEN** Prompt 2 在 questions 数组前输出 emotional_care 字段（一句安抚话）
- **AND** 安抚话用业务人员能听懂的语言

#### Scenario: 问题数量超限
- **WHEN** Prompt 2 生成超过 5 个问题
- **THEN** 系统截断到前 5 个
- **AND** 不报错

### Requirement: 信息整合（Prompt 3）

系统 SHALL 在业务人员回答问题后，调用 Prompt 3 整合新信息到业务确认稿，输出 delta（added / modified / confirmed）和 updated_doc。

#### Scenario: 新增信息
- **WHEN** 业务人员说"主要是漏发，每月 3-5 次"
- **THEN** Prompt 3 输出 delta.added 含两条记录
- **AND** updated_doc.pain_points[0].frequency 更新为"高频（每月 3-5 次，旺季更多）"
- **AND** user_facing_summary 用大白话告诉业务人员"这次补全了出错类型和发生频率"

#### Scenario: 修改已有信息
- **WHEN** 业务人员说"有时候不是仓库发错，是客户自己记错订单"
- **THEN** Prompt 3 输出 delta.modified 含一条记录（之前以为是仓库责任，现在多了客户误解情况）
- **AND** 标清楚"为什么改"（业务人员原话）

### Requirement: 业务确认稿实时更新

系统 SHALL 在每轮 Prompt 3 执行后，把 updated_doc 实时同步到右侧文档视图，业务人员能看到自己说的话如何变成文档。

#### Scenario: 实时生长
- **WHEN** 业务人员回答完一组问题
- **THEN** 右侧文档在 2 秒内更新对应章节
- **AND** 新增/修改的字段标"✨新"或"🔄改"
- **AND** 完成度百分比从 30% 提升到 70%

#### Scenario: 待确认标记
- **WHEN** AI 推测某个信息（如"经理角色"）
- **THEN** 文档中标"⚠️ 待确认"
- **AND** 即使 AI 有 90% 把握也必须标记

### Requirement: 状态机管理

系统 SHALL 用状态机管理 8 个状态：IDLE / SCENE_IDENTIFYING / ASKING / ANSWERING / INTEGRATING / CONFIRMING / PRD_GENERATING / COMPLETED。

#### Scenario: 正常流程
- **WHEN** 业务人员进入系统开始描述
- **THEN** 状态从 IDLE → SCENE_IDENTIFYING（Prompt 1）
- **AND** → ASKING（Prompt 2 生成问题）
- **AND** → ANSWERING → INTEGRATING（Prompt 3）
- **AND** 循环 ASKING 直到 completion ≥ 80% 且 to_confirm ≤ 1
- **AND** → CONFIRMING → PRD_GENERATING（Prompt 4）→ COMPLETED

#### Scenario: 异步补充模式
- **WHEN** 业务人员说"我想补充一点"
- **THEN** 系统识别为异步补充模式，跳过反问直接调用 Prompt 3 整合
- **AND** 不增加 ASKING 状态的轮次计数

### Requirement: PRD 翻译（Prompt 4）

系统 SHALL 在业务人员签收业务确认稿后，调用 Prompt 4 翻译成标准化 PRD（Markdown 格式）。

#### Scenario: 标准翻译
- **WHEN** 业务人员点击"签收"按钮
- **THEN** Prompt 4 在 10 秒内生成 PRD
- **AND** PRD 含 8 个章节（需求背景 / 需求目标 / 用户角色与场景 / 功能需求 / 异常处理 / 验收标准 / 非功能需求 / 待评估事项）
- **AND** 每个章节标"来自业务确认稿"或"AI 补充"
- **AND** 验收标准可测试（如"客户上报后 2 小时内必须有工作人员响应"），不写"系统运行正常"这种废话

#### Scenario: 功能忠实于业务
- **WHEN** Prompt 4 输出 PRD
- **THEN** 业务功能必须 1:1 来自业务确认稿，不能多也不能少
- **AND** 非业务部分（性能 / 安全 / 兼容性）AI 主动补充但标"AI 补充"

### Requirement: 沟通记录三层结构

系统 SHALL 用三层结构记录每次沟通：

- **第一层**：业务确认稿（终态文档，给产品/开发看）
- **第二层**：沟通记录（带时间戳的素材库，含业务人员原话 + AI 识别到的关键信息）
- **AND 第三层**：对话历史（完整保留 AI 问的每一个问题和业务人员的每一次回答）

#### Scenario: 独立沟通卡片
- **WHEN** 业务人员隔了 2 天又来补充
- **THEN** 系统生成新的沟通卡片，含时间、方式、时长、状态
- **AND** 不修改历史沟通卡片内容

### Requirement: 多格式导出

系统 SHALL 支持 PRD 导出为 3 种格式：Markdown 文件下载、复制到飞书文档、复制 Markdown 到剪贴板。

#### Scenario: 导出 Markdown
- **WHEN** 业务人员点击"导出 Markdown"
- **THEN** 系统下载一个 .md 文件，文件名格式为"PRD_v1.0_仓库发货异常管理_2024-01-20.md"

#### Scenario: 复制到飞书
- **WHEN** 业务人员点击"复制到飞书"
- **THEN** 系统把 PRD Markdown 复制到剪贴板
- **AND** 提示"已复制，可粘贴到飞书文档"

### Requirement: 历史需求库

系统 SHALL 自动存储所有生成过的需求到历史库，支持列表展示、关键词搜索、详情查看。

#### Scenario: 列表展示
- **WHEN** 业务人员进入"历史需求"页面
- **THEN** 系统按更新时间倒序展示所有需求，显示标题、时间、状态（草稿 / 评审中 / 已确认）

#### Scenario: 关键词搜索
- **WHEN** 业务人员输入"发货"搜索
- **THEN** 系统返回标题或内容含"发货"的所有需求
- **AND** 高亮匹配关键词

### Requirement: 情绪安抚

系统 SHALL 在 Prompt 2 检测到业务人员情绪为"焦虑"或"愤怒"时，先输出安抚话再问问题。

#### Scenario: 情绪安抚
- **WHEN** Prompt 1 输出 emotional_signal="焦虑"
- **THEN** Prompt 2 在 questions 之前输出 emotional_care 字段
- **AND** 安抚话用业务人员原话 + 温和语气（如"听起来这事挺头疼的，咱们一起捋一捋"）

### Requirement: 错误处理与兜底

系统 SHALL 对 LLM 输出异常（JSON 解析失败、必填字段缺失、问题数量不符）做兜底处理。

#### Scenario: JSON 解析失败
- **WHEN** LLM 输出不是合法 JSON
- **THEN** 系统自动重试 1 次，在 prompt 后追加"注意：上次输出不是合法 JSON，请严格按 JSON 格式输出"
- **AND** 仍失败则返回"抱歉，我没理解你的意思，能再说一遍吗？"

#### Scenario: Prompt 3 整合失败
- **WHEN** Prompt 3 校验失败
- **THEN** 系统保留上一版文档不修改
- **AND** 返回 user_facing_summary="我先记下你说的，咱们继续聊。"

### Requirement: LLM 流式输出

系统 SHALL 在 AI 回答时使用 SSE（Server-Sent Events）流式输出，业务人员能逐字看到 AI 在"打字"。

#### Scenario: 流式对话
- **WHEN** 业务人员等待 AI 反问
- **THEN** AI 的反问逐字显示在对话流中
- **AND** 右侧文档等 AI 完整输出后再更新

### Requirement: 完成度评估

系统 SHALL 根据 5 个必选维度（问题类型 / 责任方 / 关键场景 / 期望效果 / 边界情况）的覆盖度计算 completion_percentage。

#### Scenario: 完成度判断
- **WHEN** Prompt 3 输出 updated_doc
- **THEN** completion_percentage 基于 5 个维度是否覆盖计算
- **AND** 5 个维度都覆盖 + to_confirm 为空 = 100%
- **AND** 达到 80% 且 to_confirm ≤ 1 时进入 CONFIRMING 状态

---

## 技术架构（参考）

### 前端（Next.js + Tailwind）
- `/` 历史需求库（列表）
- `/conversation/new` 新建对话（空状态）
- `/conversation/[id]` 对话流 + 实时文档（核心页面）
- `/requirement/[id]` 业务确认稿详情
- `/requirement/[id]/prd` PRD 详情

### 后端（FastAPI）
- `POST /api/conversation/start` — 创建新需求
- `POST /api/conversation/message` — 业务人员发消息（含语音转写后的文字）
- `POST /api/conversation/respond` — 业务人员回答问题
- `POST /api/conversation/confirm` — 签收业务确认稿
- `POST /api/prd/generate` — 生成 PRD
- `POST /api/prd/export` — 导出 PRD
- `GET /api/requirements` — 历史需求列表
- `GET /api/requirements/[id]` — 需求详情

### 数据模型（PostgreSQL）
- `conversations` — 对话会话（id, user_id, title, state, current_round, completion, created_at, updated_at）
- `messages` — 每条消息（id, conversation_id, role, content, input_type, metadata, created_at）
- `doc_versions` — 业务确认稿版本（id, conversation_id, round, doc, delta, created_at）
- `requirements` — 最终需求（id, conversation_id, confirmed_doc, status, created_at）
- `prds` — PRD 详情（id, requirement_id, content, version, created_at）

### 部署
- 前端：Vercel
- 后端：Fly.io / Railway
- 数据库：Supabase（PostgreSQL）
- LLM：OpenAI API 或 Anthropic API

---

## MVP 验证标准

1. **业务人员用得下去**：一个完全不会写需求文档的业务人员，从零开始能独立完成一个需求，完成率 ≥ 80%
2. **业务确认稿质量过关**：产品经理拿到业务确认稿能直接理解业务在说什么，通过率 ≥ 90%
3. **PRD 开发能用**：开发拿到 PRD 能知道要做什么，一次过审率 ≥ 70%
4. **用户回访率**：历史需求库用户回访率 ≥ 30%（说明第二次还会来用）

---

## ADDED Requirements（A4：前端体验打磨 + PRD 增强）

### Requirement: 历史库搜索关键词高亮

系统 SHALL 在历史需求库的标题中把命中的关键词用 `<mark>` 标签高亮（背景使用 warning 黄色 28% 透明 + 圆角 padding），不区分大小写匹配。

#### Scenario: 单关键词命中
- **WHEN** 业务人员在搜索框输入"仓库"
- **AND** 列表中存在标题含"仓库"的需求
- **THEN** 标题中"仓库"二字以黄色背景高亮显示
- **AND** 周边文字保持原色不变

#### Scenario: 搜索无结果
- **WHEN** 业务人员输入未匹配任何标题的关键词
- **THEN** 列表区显示"没有匹配 \"xxx\" 的需求" + "试试别的关键词" 提示
- **AND** 隐藏"开始第一个需求"按钮

### Requirement: 文档完成度数字平滑动画

系统 SHALL 在 DocPanel 完成度数字变化时，用 requestAnimationFrame 实现 500ms easeOutCubic 缓动动画，平滑过渡到新值。

#### Scenario: 完成度跳变
- **WHEN** 完成度从 70% 变为 85%（如新增 key_scenarios）
- **THEN** 显示数字以约 6fps 的中间帧（如 73、77、82）从 70 滚动到 85
- **AND** 进度条同步有过渡动画（CSS transition 500ms）
- **AND** 数字使用 `tabular-nums` 等宽数字防止抖动

#### Scenario: 完成度未变
- **WHEN** 完成度值未变化（如刷新页面后值未变）
- **THEN** 不触发动画，直接显示当前值

### Requirement: PRD 内容编辑

系统 SHALL 在 PRDViewer 顶部提供"✏️ 编辑"按钮，点击后整个 PRD 切换为 `<textarea>` 编辑器（支持 Markdown）。保存调 `PATCH /api/prd/{prd_id}`，取消按 Esc 或"取消"按钮还原。

#### Scenario: 进入编辑
- **WHEN** 业务人员点击"✏️ 编辑"
- **THEN** PRD 渲染区变为 monospace 字体 textarea
- **AND** 顶部按钮变成"取消 / 保存"组合

#### Scenario: 保存成功
- **WHEN** 业务人员修改内容后点击"保存"
- **THEN** 系统调 `PATCH /api/prd/{prd_id}` body `{content}`
- **AND** 按钮显示"保存中…"
- **AND** 成功后 toast 显示"已保存 · v1.x"，version 自增（如 v1.0 → v1.1）
- **AND** textarea 关闭，恢复渲染视图

#### Scenario: 取消编辑
- **WHEN** 业务人员按 Esc 键或点击"取消"
- **THEN** 草稿丢弃，恢复到上一次保存的 content

#### Scenario: 保存失败
- **WHEN** 网络错误或后端 422（content 为空）
- **THEN** toast 红色显示"保存失败：xxx"
- **AND** 仍保留在编辑模式以便重试

### Requirement: PRD 验收项勾选同步

系统 SHALL 把 PRD 中 `- [ ]` / `- [x]` 渲染为可点击 checkbox。勾选状态通过 `PATCH /api/prd/{prd_id}/acceptance` 增量合并到后端 `acceptance_state` 字段。

#### Scenario: 勾选验收项
- **WHEN** 业务人员点击某个验收 checkbox
- **THEN** UI 立即（乐观更新）显示勾选 + 文字加删除线变灰
- **AND** 后台调 `PATCH /api/prd/{prd_id}/acceptance` body `{checks: {"check-N-hash": true}}`
- **AND** 勾选过程中 checkbox 半透明（syncing 提示）

#### Scenario: 取消勾选
- **WHEN** 业务人员再次点击同一 checkbox
- **THEN** UI 立即取消勾选
- **AND** 后台同步 `{checks: {"check-N-hash": false}}`

#### Scenario: 同步失败回滚
- **WHEN** 后台 PATCH 返回非 200
- **THEN** UI 回滚到原勾选状态
- **AND** toast 红色显示"同步失败：xxx"

#### Scenario: 持久化
- **WHEN** 业务人员刷新页面或关闭重开
- **THEN** 验收勾选状态从后端 `acceptance_state` 加载
- **AND** 保持上次勾选结果不变

### Requirement: 主题持久化

系统 SHALL 在用户切换 dark/light 主题时，立即写入 `localStorage['centnarr-theme']`，并在 ThemeScript 启动时优先读取（不读取时回退到 `prefers-color-scheme`）。

#### Scenario: 切换主题
- **WHEN** 业务人员点击 TopNav 右侧的太阳/月亮按钮
- **THEN** `<html data-theme>` 属性在 dark/light 间切换
- **AND** 所有 CSS 变量随之切换（页面实时换肤）
- **AND** localStorage 立即写入新值

#### Scenario: 刷新保持
- **WHEN** 业务人员刷新页面
- **THEN** 主题从 localStorage 读取并保持（无 FOUC，因 ThemeScript 注入在 `<head>`）

#### Scenario: 首次访问
- **WHEN** 业务人员首次访问（localStorage 为空）
- **THEN** ThemeScript 用 `prefers-color-scheme` 决定主题
- **AND** 立即把该值写入 localStorage（让用户后续选择有 sticky 起点）

### Requirement: 键盘快捷键

系统 SHALL 提供 `Cmd/Ctrl+K` 快捷键聚焦历史库搜索框，以及 `Esc` 取消编辑。

#### Scenario: Cmd+K 聚焦搜索
- **WHEN** 业务人员在历史库页面按 `Cmd+K`（Mac）或 `Ctrl+K`（其他）
- **THEN** 搜索 input 自动获得焦点
- **AND** 已有的搜索内容被自动 select
- **AND** 浏览器默认 `Ctrl+K`（聚焦地址栏）被 preventDefault 拦截

#### Scenario: Esc 取消 PRD 编辑
- **WHEN** 业务人员在 PRDViewer 编辑模式下按 `Esc`
- **THEN** 草稿丢弃，恢复渲染视图

#### Scenario: 快捷键与输入框共存
- **WHEN** 业务人员焦点在 input/textarea 内按 `Enter`（无修饰键）
- **THEN** 不会触发全局快捷键 handler（避免误触发）

### Requirement: 前端新增 API 方法

前端 `lib/api.ts` SHALL 暴露与 PRD 增强对应的 API：
- `api.editPrd(prd_id, content)` → `PATCH /api/prd/{id}`
- `api.editPrdAcceptance(prd_id, checks)` → `PATCH /api/prd/{id}/acceptance`

后端 `GET /api/requirement/{id}` SHALL 在返回的 `prds[]` 中包含 `acceptance_state` 字段（默认 `{}`）。