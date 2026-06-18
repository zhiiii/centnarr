# Centnarr Backend

FastAPI backend for the requirement-document AI collaboration system.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## Run

```bash
# Dev (mock LLM - default)
uvicorn app.main:app --reload --port 8000

# With real LLM
export LLM_PROVIDER=openai
export LLM_API_KEY=sk-...
export LLM_MODEL=gpt-4o-mini
uvicorn app.main:app --reload --port 8000
```

## Test

```bash
pytest tests/ -v
```

## API

- `POST /api/conversation/start` — 创建新对话
- `POST /api/conversation/message` — 业务人员发首条消息
- `POST /api/conversation/respond` — 业务人员回答问题
- `POST /api/conversation/confirm` — 签收业务确认稿
- `POST /api/prd/generate` — 生成 PRD
- `POST /api/prd/export` — 导出 PRD
- `GET /api/conversation/{id}` — 对话详情
- `GET /api/requirements` — 历史需求列表
- `GET /api/requirement/{id}` — 需求详情
- `GET /api/health` — 健康检查

## LLM Providers

- `mock` — 内置兜底（无 API Key 也能跑通完整流程）
- `openai` — OpenAI GPT-4o / GPT-4o-mini
- `anthropic` — Anthropic Claude 3.5