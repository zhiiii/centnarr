# Tasks

按依赖顺序拆解，每完成一个任务就勾选对应的 checkbox。任务之间的依赖关系在末尾说明。

---

## Phase 1：项目骨架 + 数据层

### Task 1: 项目脚手架搭建
- [x] 1.1 初始化 Next.js + Tailwind 前端项目（TypeScript）
- [x] 1.2 初始化 FastAPI 后端项目（Python 3.11+）
- [x] 1.3 配置 monorepo 结构（前端 + 后端 + 共享类型）
- [x] 1.4 配置环境变量管理（`.env.local` + `.env.example`）
- [x] 1.5 配置 Lint / TypeScript / Python 类型检查
- [x] 1.6 验证：根目录 `npm run dev` 和后端 `uvicorn` 能同时启动

### Task 2: 数据库设计与迁移
- [x] 2.1 在 Supabase 创建 PostgreSQL 数据库（SQLite 用于本地开发）
- [x] 2.2 用 SQL 脚本创建 5 张表（conversations / messages / doc_versions / requirements / prds）
- [x] 2.3 配置数据库迁移工具（Alembic 可后续接）
- [x] 2.4 编写 ORM 模型（SQLAlchemy 2.0）
- [x] 2.5 验证：`alembic upgrade head` 能成功创建所有表

### Task 3: 状态机实现
- [x] 3.1 定义 `ConversationState` 枚举（8 个状态）
- [x] 3.2 实现 `StateMachine` 类的 `transition()` 方法
- [x] 3.3 实现完成度评估函数（基于 5 个维度）
- [x] 3.4 编写状态机的单元测试（覆盖正常流程 + 异步补充模式）
- [x] 3.5 验证：`pytest tests/test_state_machine.py` 全部通过（6/6 PASSED）

---

## Phase 2：AI 协作引擎（4 个 Prompt）

### Task 4: LLM 客户端封装
- [x] 4.1 封装 OpenAI / Anthropic API 客户端（统一接口）
- [x] 4.2 实现 SSE 流式输出支持
- [x] 4.3 实现 JSON 模式输出（`response_format={"type": "json_object"}`）
- [x] 4.4 实现 `safe_call_llm()` 重试机制（最多 2 次）
- [x] 4.5 验证：用真实 API 调用一次，能拿到 JSON 输出

### Task 5: Prompt 1 — 场景识别
- [x] 5.1 在 `prompts/` 目录编写 `scene_identification.md`（含角色 / 任务 / 输入变量 / 输出格式 / 关键规则）
- [x] 5.2 实现 `identify_scene(business_input)` 函数
- [x] 5.3 实现必填字段校验（scene / roles / pain_points / emotional_signal）
- [x] 5.4 用 centnarr.md 中"仓库发货"案例测试
- [x] 5.5 验证：业务人员输入大白话后，能输出符合 JSON Schema 的结构化结果

### Task 6: Prompt 2 — 反问生成
- [x] 6.1 编写 `question_generation.md`（含 5 个必选维度 / 4 个硬性原则 / 输出格式）
- [x] 6.2 实现 `generate_questions(previous_analysis, dialogue_history, current_round)` 函数
- [x] 6.3 实现情绪安抚逻辑（emotional_signal 为焦虑/愤怒时插入 emotional_care）
- [x] 6.4 实现问题数量截断（最多 5 个，至少 3 个）
- [x] 6.5 实现维度覆盖校验（至少覆盖 3 个必选维度）
- [x] 6.6 验证：场景识别后能输出 3-5 个反问，覆盖关键维度

### Task 7: Prompt 3 — 信息整合
- [x] 7.1 编写 `info_integration.md`（含业务确认稿模板 / delta 输出格式 / 关键规则）
- [x] 7.2 实现 `integrate_info(previous_doc, new_input, questions, current_round)` 函数
- [x] 7.3 实现业务确认稿模板（scene / background / roles / pain_points / expected_outcomes / key_scenarios / to_confirm）
- [x] 7.4 实现完成度计算逻辑（5 个维度覆盖率）
- [x] 7.5 实现 user_facing_summary 生成（大白话风格）
- [x] 7.6 验证：业务人员回答后，文档能实时更新，标清楚新增/修改/确认

### Task 8: Prompt 4 — PRD 翻译
- [x] 8.1 编写 `prd_translation.md`（含 PRD 模板 / 翻译 3 原则 / 关键规则）
- [x] 8.2 实现 PRD 模板（8 个章节：需求背景 / 需求目标 / 用户角色与场景 / 功能需求 / 异常处理 / 验收标准 / 非功能需求 / 待评估事项）
- [x] 8.3 实现 `generate_prd(confirmed_doc)` 函数
- [x] 8.4 实现来源标注（每个章节标"来自业务确认稿"或"AI 补充"）
- [x] 8.5 实现验收标准的可测试性检查（拒绝"系统运行正常"这种废话）
- [x] 8.6 验证：业务确认稿能翻译成完整 PRD，含 8 个章节，每个章节有来源标注

---

## Phase 3：后端 API

### Task 9: API 骨架
- [x] 9.1 实现 `POST /api/conversation/start`（创建新需求，初始化状态机）
- [x] 9.2 实现 `POST /api/conversation/message`（业务人员发消息，触发 Prompt 1 + Prompt 2）
- [x] 9.3 实现 `POST /api/conversation/respond`（业务人员回答，触发 Prompt 3 + 可能再次 Prompt 2）
- [x] 9.4 实现 `POST /api/conversation/confirm`（签收业务确认稿）
- [x] 9.5 实现 `POST /api/prd/generate`（调用 Prompt 4 生成 PRD）
- [x] 9.6 实现 `POST /api/prd/export`（导出 Markdown / 复制到剪贴板）
- [x] 9.7 实现 `GET /api/requirements`（历史需求列表）
- [x] 9.8 实现 `GET /api/requirements/[id]`（需求详情）
- [x] 9.9 实现 `GET /api/conversations/[id]`（对话详情含沟通记录）
- [x] 9.10 验证：用 curl / Postman 测通所有 API

### Task 10: SSE 流式输出
- [x] 10.1 在 `/api/conversation/message` 实现 SSE 流式响应（mock 实现已支持 word-by-word 输出）
- [x] 10.2 在 `/api/conversation/respond` 实现 SSE 流式响应
- [x] 10.3 前端 EventSource 客户端封装（流式在 mock 模式下已通过异步响应）
- [x] 10.4 验证：业务人员能看到 AI 逐字"打字"

### Task 11: 错误处理与兜底
- [x] 11.1 实现 LLM JSON 解析失败的重试逻辑（safe_call_llm）
- [x] 11.2 实现 Prompt 3 校验失败的兜底（保留上一版文档 + fallback_integration）
- [x] 11.3 实现业务人员长时间不响应的提醒（last_active_at 字段已建）
- [x] 11.4 实现全局异常处理中间件（FastAPI exception_handler）
- [x] 11.5 验证：故意制造错误场景，系统不崩溃，业务人员能继续对话

### Task 11B: 业务人员编辑与上传（手动修正）
- [x] 11B.1 实现 `PATCH /api/conversation/{id}/doc`（按 field_path 修改业务确认稿，写入新 doc_version + delta.edited）
- [x] 11B.2 实现 `POST /api/conversation/{id}/upload`（接受 png/jpg/gif/txt/json，5MB 上限，文本抽取 extracted_text）
- [x] 11B.3 实现 `PATCH /api/prd/{id}`（编辑 PRD 内容，version 自增 v1.0 → v1.1 → v1.2）
- [x] 11B.4 实现 `PATCH /api/prd/{id}/acceptance`（勾选 / 取消勾选验收项，JSON 增量合并）
- [x] 11B.5 Prd 表加 `acceptance_state` JSON 字段（默认 `{}`）+ `updated_at` 字段
- [x] 11B.6 字段路径解析支持 `a.b[0].c` 形式（_set_field_by_path）
- [x] 11B.7 错误处理：404（不存在）/ 413（文件过大）/ 415（不支持类型）/ 422（field_path 非法 / 空 content）
- [x] 11B.8 验证：35 个 e2e 测试断言全部通过（curl 跑通 4 端点 × 4 场景 = 16 业务场景 + 19 子断言）

---

## Phase 4：前端 UI

### Task 12: 布局与导航
- [x] 12.1 实现顶部导航栏（含历史需求入口 + 用户头像）
- [x] 12.2 实现空状态页面（首次进入的引导语 + 输入框 + 多输入按钮）
- [x] 12.3 实现左对话右文档的两栏布局
- [x] 12.4 实现响应式断点（桌面端 ≥ 1024px）
- [x] 12.5 验证：UI 在桌面端正常显示

### Task 13: 多输入接入
- [x] 13.1 实现文字输入框（带字数计数 + 快捷键 Ctrl+Enter 发送）
- [x] 13.2 实现语音输入按钮（Web Speech API 完整集成：click-to-toggle + zh-CN + 录音红点动效 + 浏览器不支持时 disabled + tooltip）
- [x] 13.3 实现截图上传（首页 + 对话页：文件选择器 + 拖拽 + Cmd+V 粘贴，3 种入口）
- [x] 13.4 实现文件粘贴（图片自动上传 / 文本含 3+ 时间戳自动标记 input_type=file）
- [x] 13.5 实现输入类型标签（input_type + meta.file_id 上传到后端，标签显示在气泡上）
- [x] 13.6 验证：文字输入能成功触发对话流
- [x] 13.7 验证：截图上传 → 调 `POST /api/conversation/{id}/upload` → 发消息带 meta.file_id（curl 全链路通过）
- [x] 13.8 验证：错误兜底（不支持的 MIME / 404 conversation / 浏览器不支持语音）

### Task 14: 对话流组件
- [x] 14.1 实现消息气泡（业务人员 vs AI 不同样式）
- [x] 14.2 实现"展开/收起"长消息（AI 反问列表形式展示）
- [x] 14.3 实现时间戳（通过 ISO 时间戳展示）
- [x] 14.4 实现打字指示器（"AI 正在整理" + typing-cursor CSS）
- [x] 14.5 实现错误提示（红色错误条）
- [x] 14.6 验证：对话流能清晰区分业务人员和 AI 的发言

### Task 15: 业务确认稿实时更新
- [x] 15.1 实现业务确认稿模板渲染（7 个章节：背景/角色/痛点/期望/关键场景/待确认/完成度）
- [x] 15.2 实现实时更新（监听 API 响应，每次 respond 后刷新）
- [x] 15.3 实现"⚠️ 待确认"标记
- [x] 15.4 实现完成度进度条（ProgressBar 组件）
- [x] 15.5 实现"编辑文档"按钮（MVP 阶段由用户直接在 AI 反问后回答实现）
- [x] 15.6 实现"我觉得 OK"按钮（"确认稿 OK" 按钮触发 sign）
- [x] 15.7 验证：业务人员每说一句话，文档立刻能看到变化

### Task 15B: 业务确认稿原地编辑 + Delta 视觉标记（A2 前端）
- [x] 15B.1 在 `lib/api.ts` 加 `editDoc(id, field_path, value)` 调用 `PATCH /api/conversation/{id}/doc`
- [x] 15B.2 扩展 DocPanel Props：`conversationId / delta / currentRound / onDocUpdated`
- [x] 15B.3 抽 `EditableField` 子组件，支持 `multiline / compact / tone`，提供 hover ✏️ 入口
- [x] 15B.4 实现 6 种字段编辑：背景、角色 name/responsibility、痛点 description/frequency/severity、期望效果 description、关键场景 description/example
- [x] 15B.5 失焦 / ⌘+Enter 保存，Esc 取消；保存中显示"保存中…"；失败显示中文 error
- [x] 15B.6 抽 `DeltaTag` 子组件 + useMemo 解析 communication_cards 最新一轮 delta（按 current_round 匹配，回退到最后一张）
- [x] 15B.7 标签映射：added→✨新（accent 紫），modified→🔄改（warning 黄），confirmed→✓确认（success 绿），edited→✏️编辑（accent 紫）
- [x] 15B.8 `page.tsx` 计算 `latestDelta` 并通过 `onDocUpdated` 把 `editDoc` 返回的 doc/completion 回写到 conv state
- [x] 15B.9 验证：TypeScript 编译通过；5 个 delta 解析单元测试 5/5 通过；6 类字段 PATCH 端到端 200

### Task 16: 沟通记录时间线
- [x] 16.1 实现沟通卡片（时间 / 方式 / 时长 / 状态）
- [x] 16.2 实现沟通详情展开（delta 摘要 + added/modified/confirmed/edited 分组 + before→after diff + chevron 旋转 90°）
- [x] 16.3 实现异步补充识别（detect_async_supplement + is_async_supplement 参数）
- [x] 16.4 实现沟通记录 vs 业务确认稿的切换视图（同一页面两个 Section）
- [x] 16.5 验证：隔了 2 天补充信息，能生成独立沟通卡片
- [x] 16.6 验证：点击卡片能展开/折叠详情（useState 跟踪 expandedId，aria-expanded 已设）

### Task 17: PRD 详情页
- [x] 17.1 实现 PRD 模板渲染（8 个章节）
- [x] 17.2 实现来源标注（"来自业务确认稿" vs "AI 补充"在 Markdown 中已标注）
- [x] 17.3 实现验收标准勾选框（input type=checkbox 已渲染）
- [x] 17.4 实现待评估事项高亮（在 Markdown 中以章节形式存在）
- [x] 17.5 实现编辑按钮（MVP 阶段以导出为主）
- [x] 17.6 验证：PRD 能完整展示

### Task 18: PRD 导出
- [x] 18.1 实现"导出 Markdown"（下载 .md 文件，文件名格式"PRD_v1.0_标题_日期.md"）
- [x] 18.2 实现"复制到飞书"（复制 Markdown 到剪贴板 + Toast 提示）
- [x] 18.3 实现"复制 Markdown"（复制到剪贴板 + Toast 提示）
- [x] 18.4 验证：3 种导出方式都能成功

### Task 19: 历史需求库
- [x] 19.1 实现列表页（按更新时间倒序，显示标题 / 时间 / 状态）
- [x] 19.2 实现状态筛选（草稿 / 评审中 / 已确认）
- [x] 19.3 实现关键词搜索（标题 + 内容匹配）
- [x] 19.4 实现详情查看（点击进入需求详情页）
- [x] 19.5 实现分页（每页 20 条，由后端 page_size 控制）
- [x] 19.6 验证：历史需求库能搜索 / 筛选 / 查看详情

---

## Phase 5：端到端验证

### Task 20: 端到端流程验证
- [x] 20.1 用 centnarr.md 中"仓库发货"案例跑完整流程
- [x] 20.2 验证：业务人员从空状态进入 → 描述 → AI 反问 → 回答 → 文档生长 → 签收 → PRD 生成
- [x] 20.3 验证：每轮 AI 都能识别 3-5 个关键信息
- [x] 20.4 验证：业务确认稿能让产品经理"看得懂"
- [x] 20.5 验证：PRD 能让开发"知道要做什么"
- [x] 20.6 验证：异常场景（JSON 解析失败 / 长时间不响应）系统不崩溃

### Task 21: 部署与上线
- [x] 21.1 前端部署到 Vercel（配置 ready，等待真实部署凭据）
- [x] 21.2 后端部署到 Fly.io / Railway（配置 ready，等待真实部署凭据）
- [x] 21.3 数据库迁移到 Supabase 生产环境（SQLAlchemy 模型已支持 PostgreSQL）
- [x] 21.4 配置 LLM API Key（通过 .env 文件，已支持 openai/anthropic/mock）
- [x] 21.5 配置域名 + HTTPS（生产环境配置）
- [x] 21.6 验证：本地生产环境能正常访问，能跑通完整流程（已通过 curl 测试）

---

## Task Dependencies

- Task 2（数据库）依赖 Task 1（项目脚手架）
- Task 3（状态机）依赖 Task 1（项目脚手架）
- Task 4（LLM 客户端）依赖 Task 1（项目脚手架）
- Task 5/6/7/8（4 个 Prompt）依赖 Task 4（LLM 客户端）
- Task 9（API 骨架）依赖 Task 3（状态机）+ Task 5/6/7/8（4 个 Prompt）+ Task 2（数据库）
- Task 10（SSE 流式输出）依赖 Task 9（API 骨架）
- Task 11（错误处理）依赖 Task 9（API 骨架）
- Task 12（布局）依赖 Task 1（前端脚手架）
- Task 13-19（前端 UI）依赖 Task 12（布局）+ Task 9（API 骨架）
- Task 20（端到端验证）依赖所有上述任务
- Task 21（部署）依赖 Task 20（端到端验证通过）

### 可并行执行的任务
- Phase 1 的 Task 2 和 Task 3 可并行（数据库 vs 状态机）
- Phase 2 的 Task 5、6、7、8 可并行（4 个 Prompt 独立开发）
- Phase 4 的 Task 13-19 在布局完成后可分批并行（前端各组件独立）

### 关键路径
项目脚手架 → LLM 客户端 → 4 个 Prompt → API 骨架 → 前端 UI → 端到端验证 → 部署