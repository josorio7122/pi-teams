# Agent Instructions

> Code style is enforced by `biome.json`. TypeScript rules, functional patterns, TDD, and mocking conventions are in the global `~/.pi/agent/AGENTS.md`. This file covers only pi-teams-specific conventions.

## Package Manager
Use **npm**: `npm install`, `npm test`, `npm run check`

## Commit Attribution
Never add `Co-Authored-By` trailers or any AI attribution to commit messages.

## File-Scoped Commands
| Task | Command |
|------|---------|
| Typecheck | `npx tsc --noEmit` |
| Lint | `npx biome check path/to/file.ts` |
| Lint fix | `npx biome check --fix path/to/file.ts` |
| Test file | `npm test -- path/to/file.test.ts` |
| All checks | `npm run check` |

## Project Structure
This is a **pi extension** — it hooks into pi's `session_start` and `before_agent_start` lifecycle events and uses `pi-agents` as a library.

Feature folders:
- `src/config/` — teams.md parsing and validation
- `src/graph/` — TeamGraph builder and agent resolver
- `src/delegate/` — delegate tool creation
- `src/e2e/` — end-to-end tests

## pi-teams-Specific Conventions
- **All fs I/O must be async** — use `node:fs/promises`, never `fs.readFileSync`
- **`teams.md` is the discovery mechanism** — config lives in a single file, not folder scanning
- **Agent `.md` files are external data** — validate frontmatter with Zod at the boundary
- **No top-level `await`** — initialization runs inside the `session_start` hook
