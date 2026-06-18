# Checklist

## Phase 1：4 个 Prompt 重写

- [ ] `app/prompts/scene_identification.md` 含产品经理视角
- [ ] `scene_identification.md` 输出 schema 含 `businessperson_insight` / `likely_implications` / `translation_quality`
- [ ] `app/prompts/question_generation.md` 核心哲学改写（不是套模板，是翻译）
- [ ] `question_generation.md` 反问字段改为 `my_understanding` / `confirm_with_businessperson` / `guide_to_say_more`
- [ ] `question_generation.md` 明确"不用 A/B/C/D 选择题"
- [ ] `question_generation.md` emotional_care 改为"产品经理视角指出问题本质"
- [ ] `app/prompts/info_integration.md` 含"产品经理会想到但业务没说的"识别
- [ ] `info_integration.md` user_facing_summary 改为"我理解成 X，对吗？"
- [ ] `app/prompts/prd_translation.md` 含"业务诉求 → 产品方案"对应
- [ ] `prd_translation.md` 功能需求章节加 `why_this_design` 字段
- [ ] 验证：用 centnarr.md 案例测反问，质量应明显提升

## Phase 2：流式技术 6 点

### ① 直接流式 LLM token
- [ ] `ai_engine.py` 改 async generator
- [ ] `parse_streaming_json_fragments` 函数实现
- [ ] `post_respond_stream` 内部直接流 LLM token
- [ ] 首字延迟 < 2 秒
- [ ] LLM 调用次数：1 次/响应

### ② 分块流式 UI
- [ ] `app/conversation/[id]/page.tsx` 区分"流式文案" vs "静态卡片"
- [ ] `components/QuestionsCard.tsx` 新增
- [ ] 反问卡片静态展示（不逐字）
- [ ] 反问卡片可勾选"已回答"
- [ ] DocPanel 骨架先出 + 逐章填
- [ ] 浏览器肉眼看到分块流式

### ③ 取消流
- [ ] AbortController 在 `runStream` 中包 fetch
- [ ] useEffect cleanup abort
- [ ] 切页/重发消息 abort
- [ ] 90 秒超时 abort
- [ ] 业务人员切回页面，已 commit 状态保留

### ④ 错误处理
- [ ] 失败时 textarea 保留输入
- [ ] 错误条 + 重试按钮
- [ ] 网络错误静默重试 1 次
- [ ] LLM 错误（4xx/5xx）不静默重试
- [ ] lastSubmitRef 复用

### ⑤ 状态机同步精细化
- [ ] `answering` → "AI 在想..."
- [ ] `integrating` → "AI 正在整理..."
- [ ] delta 流时 → "AI 在写..."
- [ ] done 后清空

### ⑥ 单端点 + 内部流
- [ ] `/respond/stream` 保持单端点
- [ ] 内部串联 state/流式/done
- [ ] Network 面板只看到 1 个连接

## Phase 3：验证

- [ ] 11 个 state machine 单测 PASSED
- [ ] 3 场景主流程跑通
- [ ] 业务人员 3 真实案例反问质量提升（用 centnarr.md 案例）
- [ ] TypeScript 0 错误
- [ ] 首字延迟 < 2 秒
- [ ] LLM 调用次数 = 1

## Phase 4：回归

- [ ] 8 个旧端点兼容
- [ ] 状态机 11/11 单测
- [ ] TypeScript 0 错误
