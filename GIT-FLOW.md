# Git 分支管理与提交规范

## 分支模型

```
main (生产)          ──────────────────────────────────────────►
                         ↑ merge (release)
develop (开发)         ──────┬──────────────┬───────────────────►
                              ↑ merge        ↑ merge
feature/xxx         ─── branch ──────► PR ──► ✓ ──► delete
                              ↑ merge
hotfix/xxx          ───────── branch ────────► merge → delete
```

## 分支定义

| 分支 | 命名 | 说明 | 保护规则 |
|------|------|------|----------|
| `main` | `main` | 生产环境代码，只接受来自 `develop` 的合并 | 🔒 直接 push 禁止，必须通过 PR |
| `develop` | `develop` | 开发集成分支，所有功能分支的合并目标 | 🔒 直接 push 禁止，必须通过 PR |
| 功能分支 | `feature/<描述>` | 单次功能开发的独立分支，从 `develop` 切出 | 可自由 push，合并后删除 |
| 热修复分支 | `hotfix/<描述>` | 线上紧急 bug 修复，从 `main` 切出 | 可自由 push，合并后删除 |

## 分支命名规则

```
feature/<简要描述>
hotfix/<简要描述>
```

**示例：**
```
feature/user-crud          # 用户管理增删改查
feature/auth-refresh       # Token 刷新逻辑优化
hotfix/login-enum          # 修复登录用户名枚举漏洞
hotfix/cors-config         # 修复 CORS 配置错误
```

**禁止的命名：**
```
feature/fix1      # 过于模糊
feature/test      # 没有描述性
my-branch         # 缺少类型前缀
```

---

## 工作流程

### 1. 创建功能分支

```bash
# 确保 develop 是最新的
git checkout develop
git pull origin develop

# 从 develop 创建功能分支
git checkout -b feature/<描述>
```

### 2. 开发与提交

```bash
git add .
git commit -m "feat(user): 实现用户列表查询与分页"
```

### 3. 推送并创建 PR

```bash
git push origin feature/<描述>

gh pr create \
  --base develop \
  --head feature/<描述> \
  --title "feat(user): 实现功能概述" \
  --body "## 变更说明
- 列出主要变更点

## 测试
- [ ] 列出需要验证的测试项"
```

### 4. Code Review

- 至少 **1 人** 审批通过
- CI 检查必须通过
- 解决所有评论中的问题

### 5. 合并并删除分支

```bash
# 切换到 develop
git checkout develop
git pull origin develop

# 使用 squash 合并，保持历史整洁
git merge --squash feature/<描述>
git commit -m "feat(user): 实现功能概述"

# 推送到远端
git push origin develop

# 删除本地和远端功能分支
git branch -d feature/<描述>
git push origin --delete feature/<描述>
```

> **关于 squash merge：** 推荐使用 `--squash` 将功能分支的所有 commit 合并为一个 commit 进入 develop，保持主分支历史清晰。如果保留详细 commit 历史更有意义，可以用 `--no-ff`。

---

## 提交信息规范

### 格式

```
<type>(<scope>): <subject>

<body>       # 可选，多行描述
<footer>     # 可选，如 breaking changes
```

<type>(<scope>): <subject>

### Type 类型

| type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(user): 添加用户批量删除功能` |
| `fix` | Bug 修复 | `fix(auth): 修复 token 刷新竞态问题` |
| `docs` | 文档变更 | `docs: 更新 API 接口文档` |
| `style` | 代码格式（不影响代码运行） | `style: 统一缩进为 2 空格` |
| `refactor` | 重构（既不是新功能也不是 bug 修复） | `refactor(menu): 简化菜单树构建逻辑` |
| `perf` | 性能优化 | `perf: 减少用户列表接口 N+1 查询` |
| `test` | 测试相关 | `test(user): 添加用户创建单元测试` |
| `chore` | 构建/工具/依赖变更 | `chore: 升级依赖版本` |
| `ci` | CI 配置变更 | `ci: 添加 GitHub Actions 工作流` |
| `revert` | 回退提交 | `revert: 回退 feat(user) 的批量删除` |

### Scope（模块范围，按项目实际定义）

Scope 表示本次变更影响的模块，如 `user`、`auth`、`api`、`ui`、`config` 等，根据项目自行约定。

### Subject 规则

- 使用中文描述
- 不以句号结尾
- 动词开头，使用祈使句

### Body（可选）

描述变更原因、实现方式、影响范围：

```
feat(user): 实现用户批量删除功能

前端表格添加行选择功能，支持批量选择后调用后端批量删除接口。
后端新增 batch_delete action，接收用户 ID 列表进行物理删除。

影响：
- 用户管理列表页增加批量操作栏
- 新增 POST /api/users/batch-delete 接口
```

### Footer（可选）

```
BREAKING CHANGE: 用户删除接口从单条改为批量，旧接口已废弃
```

---

## 实际操作示例

```bash
# 1. 更新 develop
git checkout develop && git pull origin develop

# 2. 创建功能分支
git checkout -b feature/user-crud

# 3. 开发... 多次提交
git add . && git commit -m "feat(user): 实现用户列表查询"
git add . && git commit -m "feat(user): 添加用户搜索筛选"
git add . && git commit -m "fix(user): 修复角色分配类型强转"

# 4. 推送
git push origin feature/user-crud

# 5. 创建 PR
gh pr create --base develop --head feature/user-crud \
  --title "feat(user): 用户管理增删改查" \
  --body "## 功能清单
- [x] 用户列表查询（分页 + 多条件筛选）
- [x] 用户创建/编辑/删除
- [x] 角色分配
- [x] 表单验证"

# 6. Code Review 通过后合并
git checkout develop
git pull origin develop
git merge --squash feature/user-crud
git commit -m "feat(user): 用户管理增删改查"
git push origin develop

# 7. 清理分支
git branch -d feature/user-crud
git push origin --delete feature/user-crud
```

---

## 工作区规范

### 切分支前确保工作区干净

```bash
git status --short
# 输出必须为空。如有内容：要么 commit，要么 stash，要么删除。
```

### WIP 的三种合规处置

| 方式 | 适用场景 | 命令 |
|------|---------|------|
| **WIP commit** | 当天完成大半，明天继续 | `git commit -m "wip: <简述>"` |
| **stash** | 临时中断去做别的事 | `git stash push -u -m "<用途>"` |
| **worktree 隔离** | 长时间并行两个任务 | `git worktree add ../<repo>-<task> feature/<task>` |

### Commit 前自检清单

- [ ] `git status --short` 输出为空？
- [ ] `git diff --cached` 确认没有无关文件混入？
- [ ] commit message 符合 `<type>(<scope>): <subject>` 格式？
- [ ] lint / typecheck 通过？

---

## 快速参考

```bash
# 查看所有本地分支
git branch

# 查看远端分支
git branch -r

# 删除本地已合并的分支
git branch --merged develop | grep -v "develop" | xargs git branch -d

# 清理不存在的远端分支引用
git fetch --prune

# 查看某个分支的提交历史
git log develop --oneline -10

# 查看当前未合并的功能分支
git branch --no-merged develop

# stash 带描述
git stash push -u -m "<用途>"

# 查看 stash 列表
git stash list
```
