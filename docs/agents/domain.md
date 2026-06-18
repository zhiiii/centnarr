# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root (project-wide domain language), or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `<context>/docs/adr/` for context-scoped decisions (e.g. `frontend/docs/adr/`, `backend/docs/adr/`).

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a **multi-context** repo (frontend + backend). Expected layout:

```
/
├── CONTEXT-MAP.md                    ← (TBD) root index
├── docs/adr/                         ← (TBD) system-wide decisions
├── frontend/
│   ├── CONTEXT.md                    ← (TBD) frontend domain language
│   └── docs/adr/                     ← (TBD) frontend-specific decisions
└── backend/
    ├── CONTEXT.md                    ← (TBD) backend domain language
    └── docs/adr/                     ← (TBD) backend-specific decisions
```

> **Current state (as of v1.0.0)**: The `CONTEXT.md` / `CONTEXT-MAP.md` files and `docs/adr/` directories do not yet exist. They will be created lazily as the project accrues domain terms and architectural decisions. Do not flag their absence.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_