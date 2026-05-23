# WZRD Studio — Agent Harness Guide

This file is the canonical entry point for autonomous coding agents
(Claude Code, OpenAI Codex, OpenClaw, Hermes) working inside this repo.

## Stack
- Vite 5 + React 18 + TypeScript 5 + Tailwind v3
- Backend: Supabase (Edge Functions in Deno) — project ref `ixkkrousepsiorwlaycp`
- AI providers: GMI Cloud (default), fal.ai, Lovable AI Gateway, Groq
- Auth: Thirdweb wallet → Supabase session bridge (`wallet-auth` edge function)

## Allowed
- Edit anything in `src/`, `supabase/functions/`, `agent-skills/`, `docs/`.
- Add new edge functions under `supabase/functions/<name>/index.ts`.
- Create new SQL migrations via the Lovable migration tool.

## Forbidden
- Do not modify `src/integrations/supabase/types.ts` (auto-generated).
- Do not modify files under `supabase/migrations/` after creation.
- No raw SQL through `supabase.rpc('execute_sql', …)`.
- No direct queries against `auth.users` from clients/edge functions.

## Commands
- `bun run dev` — dev server
- `bun run build` — production build
- `bun run lint` — eslint
- `bunx vitest run` — unit tests

## Per-agent configs
- `.claude/CLAUDE.md` — Claude Code project guide
- `.codex/codex.md` — Codex CLI guide
- `.openclaw/manifest.json` — OpenClaw project manifest
- `.hermes/agent.yaml` — Hermes agent harness config

## Skills
Shared skill bundle (agent-agnostic): `agent-skills/index.json`
Per-skill docs: `agent-skills/<skill>/skill.md`

## MCP discovery
- `public/.well-known/agents.json` — discovery endpoint
- MCP server: `supabase/functions/mcp-server/` (Deno + mcp-lite)
- Server URL: `https://ixkkrousepsiorwlaycp.supabase.co/functions/v1/mcp-server`
