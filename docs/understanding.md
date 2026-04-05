# Multi-Team Agentic Coding — Understanding

> Conceptual model distilled from [IndyDevDan's video](https://www.youtube.com/watch?v=M30gp1315Y4), rewritten to accurately reflect the actual implementation.

---

## 1. Core Thesis

**"One agent is not enough."**

Single-agent tools hit a ceiling on mid-to-large production codebases. The answer isn't a smarter single agent — it's **teams of specialized agents** that accumulate knowledge over time.

```
Single Agent → Multiple Agents → Agent Teams
```

The key unlock: agents that **remember**. Not agents that start from zero every session, but Agent Experts — agents with persistent skills, expertise, and domain knowledge that compound across sessions.

```
Session 1:   patterns
Session 5:   + decisions, conventions
Session 10:  + file ownership, bug fixes
Session 20:  + tribal knowledge, team norms, architecture, preferences
              = "institutional knowledge"
```

> "Each agent team you have contains agents that have their own skills, expertise,
> and domain knowledge, supercharging them so that they outperform any other agent."

---

## 2. System Layers

Three distinct systems work together. Each has a clear responsibility boundary:

| Layer | Package | What it owns |
|-------|---------|--------------|
| **pi-teams** | this repo | Reads `teams.md`, builds the graph, creates the `delegate` tool, wires session hooks |
| **pi-agents** | `pi-agents` lib | Agent file parsing, system prompt assembly, `runAgent`, domain isolation, skills, knowledge |
| **pi-framework** | `pi-coding-agent` | TUI, tool execution (bash/read/write), extension loading, session lifecycle |

---

## 3. What pi-teams Does

pi-teams is a **pi extension** — it hooks into two framework events:

### `session_start`

1. Reads `.pi/teams/teams.md` — if missing, extension is silently inactive
2. **Parses** the YAML frontmatter into a `TeamConfig`
3. **Validates** it (checks for duplicate agent names, required fields)
4. **Resolves** each agent by reading its `.md` file from `paths.agents` via pi-agents
5. **Builds** a `TeamGraph` — the orchestrator node + nested team/member nodes
6. Creates a session directory under `.pi/sessions/<uuid>/` and initialises `conversation.jsonl`
7. **Discovers shared context** files (`AGENTS.md`, `CLAUDE.md`) via pi-agents
8. **Registers** the `delegate` tool for the orchestrator via `pi.registerTool()`
9. **Restricts** the orchestrator to only its configured tools via `pi.setActiveTools()`

### `before_agent_start`

Fires once before the orchestrator's first LLM call. pi-teams:

1. Reads the orchestrator's skills, knowledge files, and `conversation.jsonl` in parallel
2. Calls pi-agents' `assembleSystemPrompt()` — passing one extra variable:
   - `{{TEAMS_BLOCK}}` — YAML describing each team lead and when to consult them
3. Returns the assembled system prompt to the framework

Everything else (skill injection, `{{SESSION_DIR}}`, `{{CONVERSATION_LOG}}`, domain enforcement) is handled by **pi-agents**, not pi-teams.

---

## 4. Configuration & Delegate Tool

See [team-definition.md](team-definition.md) for the full `teams.md` schema, examples, delegate tool behavior, and extension lifecycle details.

---

## 5. Three-Tier Hierarchy

```
Orchestrator (claude-opus-4-6)
├── Planning Lead (claude-opus-4-6)
│   ├── Product Manager (claude-sonnet-4-6)
│   └── UX Researcher (claude-sonnet-4-6)
├── Engineering Lead (claude-opus-4-6)
│   ├── Frontend Dev (claude-sonnet-4-6)
│   └── Backend Dev (claude-sonnet-4-6)
└── Validation Lead (claude-opus-4-6)
    ├── QA Engineer (claude-sonnet-4-6)
    └── Security Reviewer (claude-sonnet-4-6)
```

| Tier | Who | Has `delegate` | Has `bash`/`edit` |
|------|-----|:--------------:|:-----------------:|
| **1 — Orchestrator** | Single entry point | ✅ | ❌ |
| **2 — Team Leads** | One per team | ✅ | ❌ |
| **3 — Workers** | Domain executors | ❌ | ✅ |

**Why Opus for leads?** Leads need complex reasoning for planning, coordination, and synthesis. Workers execute narrowly-defined tasks where a cheaper model suffices.

---

## 6. The Chat Room Model

### `conversation.jsonl` — the shared ledger

Every message in the session is appended to a single JSONL file. pi-teams is the only writer via `appendToLog`:

```jsonl
{"ts":"...","from":"User","to":"Orchestrator","message":"ping","type":"user_message"}
{"ts":"...","from":"Orchestrator","to":"engineering-lead","message":"Build feature X...","type":"delegation"}
{"ts":"...","from":"engineering-lead","to":"backend-dev","message":"Implement in classifier.py...","type":"delegation"}
{"ts":"...","from":"backend-dev","to":"engineering-lead","message":"Done. Here's what changed...","type":"agent_response"}
```

### Why this matters

Every agent gets the **full log injected into every turn** (via pi-agents' `assembleSystemPrompt`). This means:

- `backend-dev` can see the user's original request, not just the lead's paraphrase
- Agents can reference decisions made elsewhere in the session
- No context is lost through the delegation chain

| Traditional chaining | Chat Room Model |
|---------------------|-----------------|
| Agent A output → passed as input to Agent B | Agent B sees the FULL history |
| Context is pushed — you control what each agent sees | Context is pulled — agents read the ledger |
| Brittle: miss one variable and the agent is lost | Robust: any agent can reference any prior turn |

> "We are not afraid to spend to win here."

---

## 7. What pi-agents Provides

pi-teams uses pi-agents as a library. The following are **pi-agents concerns**, not pi-teams:

- **Agent file parsing** — reads `.md` files, validates frontmatter via Zod
- **System prompt assembly** — `assembleSystemPrompt()` injects `{{SESSION_DIR}}`, `{{CONVERSATION_LOG}}`, skills, knowledge files, shared context, and any `extraVariables` passed in
- **Agent execution** — `runAgent()` runs the LLM call, enforces tool restrictions
- **Domain isolation** — enforces the `domain:` block in each agent's frontmatter; access violations are caught per-tool-call
- **Skills** — reads skill `.md` files and injects their content into the system prompt
- **Knowledge/expertise** — reads `.yaml` knowledge files and injects their content

### Agent frontmatter (pi-agents schema)

Agent files live under `paths.agents` (default `.pi/agents/`):

```yaml
---
name: backend-dev
model: anthropic/claude-sonnet-4-6

skills:
  - path: .pi/agent-skills/mental-model.md
    when: Read at task start. Update after completing work.
  - path: .pi/agent-skills/precise-worker.md
    when: Always. Execute exactly what your lead assigned.

knowledge:
  project:
    path: .pi/knowledge/project/backend-dev.yaml
    description: "API design decisions, database patterns"
    updatable: true
    max-lines: 10000
  general:
    path: .pi/knowledge/general/backend-dev.yaml
    description: "General development strategies"
    updatable: true
    max-lines: 5000

tools:
  - read
  - write
  - edit
  - grep
  - bash
  - ls
  - find

domain:
  - path: .pi/
    read: true
    write: false
    delete: false
  - path: apps/backend/
    read: true
    write: true
    delete: true
---

# Backend Dev

Your system prompt goes here. pi-agents injects:
- {{SESSION_DIR}} — path to the session directory
- {{CONVERSATION_LOG}} — full content of conversation.jsonl
- {{TEAM_MEMBERS_BLOCK}} — injected by pi-teams for leads only
- {{TEAMS_BLOCK}} — injected by pi-teams for the orchestrator only
```

---

## 8. Directory Structure

```
project-root/
├── .pi/
│   ├── teams/
│   │   └── teams.md              # pi-teams config (YAML frontmatter)
│   ├── agents/                   # Agent .md definitions (configurable via paths.agents)
│   │   ├── orchestrator.md
│   │   ├── engineering-lead.md
│   │   ├── backend-dev.md
│   │   └── ...
│   ├── agent-skills/             # Shared skill .md files (referenced from agent frontmatter)
│   ├── knowledge/                # Persistent knowledge .yaml files
│   │   ├── project/
│   │   └── general/
│   └── sessions/                 # Created by pi-teams at session_start
│       └── <session_id>/
│           └── conversation.jsonl
└── apps/
    ├── frontend/
    └── backend/
```

### Persistence model

| Data | Scope | Survives sessions? |
|------|-------|--------------------|
| `conversation.jsonl` | Per-session | No |
| Knowledge `.yaml` files | Global | **Yes** — this is the learning |
| Skill `.md` files | Global | Yes (read-only) |

---

## 9. Delegation Flow

```
User: "Build feature X"
  │
  ▼
Orchestrator classifies → delegate(target="engineering-lead", task="Build feature X...")
  │
  ▼ (Orchestrator PAUSED — waiting for tool result)
Engineering Lead receives task
  → delegate(target="backend-dev", task="Implement in classifier.py...")
  │
  ▼ (Lead PAUSED)
Backend Dev executes → reads files, writes code, runs commands
  │
  ▼ (Backend Dev DONE — returns result)
Engineering Lead WAKES → synthesizes → returns to Orchestrator
  │
  ▼ (Engineering Lead tool call resolves)
Orchestrator WAKES → synthesizes final answer → responds to User
```

### Parallel delegation

When a lead outputs multiple `delegate` calls in one turn, pi-agents runs them concurrently:

```
Engineering Lead outputs:
  delegate(target="frontend-dev", task="...")
  delegate(target="backend-dev", task="...")
→ Both run simultaneously as independent LLM calls
→ When both finish, Lead synthesizes both responses
```

### Routing rules (design guidance, not enforced by pi-teams)

- Default to ONE team — only involve multiple when genuinely cross-domain
- Sequential when dependent — Plan → Build → Validate
- Parallel when independent — Frontend + Backend can work simultaneously
- Answer directly when simple — not everything needs delegation

---

## 10. Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| Single "God Agent" with 20+ tools | 3-tier hierarchy with specialized agents |
| Agents that start from zero each session | Persistent knowledge files |
| Leaders executing file operations | Leaders delegate; workers execute |
| Prioritizing token cost over results | "Spend money to win" |
| Agents outside their domain | Domain isolation (enforced by pi-agents) with recovery via delegation |
| Complex RAG retrieval | Embrace 1M token context — inject everything |

---

## 11. Key Quotes

| Quote | Meaning |
|-------|---------|
| "One agent is not enough" | Single agents hit a ceiling on real codebases |
| "Agent experts" | Agents that accumulate knowledge, not start fresh |
| "We are not afraid to spend to win" | Token efficiency is not the goal — results are |
| "You are a leader — delegate, never execute" | The Lead/Worker contract |
| "Build systems that build systems" | Meta-engineering — templates over code |
| "Stop coding, start templating" | YAML config > hardcoded agent definitions |
| "Trust + Scale" | Trust your agents, then scale them |
