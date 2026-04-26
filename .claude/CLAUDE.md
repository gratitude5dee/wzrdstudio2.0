# Claude Code — WZRD Studio

See repo-root `agents.md` for full guide. Quick reference:

- Tests: `bunx vitest run`
- Build: `bun run build`
- Edge functions live in `supabase/functions/`. Auto-deployed on save.
- Never edit `src/integrations/supabase/types.ts` or `supabase/migrations/`.
- Skill bundle: `agent-skills/index.json`.
- MCP server URL: `https://ixkkrousepsiorwlaycp.supabase.co/functions/v1/mcp-server`.
