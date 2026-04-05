# Multi-Team Agentic Coding — Understanding

> Distilled from [IndyDevDan's video](https://www.youtube.com/watch?v=M30gp1315Y4) + the [reference doc](../multi-team-agentic-system-reference.md).

---

## 1. Core Thesis

**"One agent is not enough."**

Single-agent tools (Claude Code, Gemini CLI, Codex CLI, Cursor) hit a ceiling on mid-to-large production codebases. The answer isn't a smarter single agent — it's **teams of specialized agents** that accumulate knowledge over time.

**Evolution path:**

```
Single Agent → Multiple Agents → Agent Teams
```

The key unlock: agents that **remember**. Not agents that start from zero every session, but **Agent Experts** — agents with persistent skills, expertise, and domain knowledge that compound across sessions.

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

## 2. The Six Features

1. **Agent Teams** — Leads & Workers with distinct roles
2. **Delegation** — Orchestrator → Leads → Workers (never skip tiers)
3. **Agent Experts** — Skills, expertise, persistent memory
4. **Domain Ownership** — Enforced file-system boundaries
5. **Chat Room** — Real-time coordination, shared conversation log
6. **Config Harness** — YAML-driven team definitions (no code changes to add/remove agents)

---

## 3. Three-Tier Hierarchy

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

### Tier Roles

| Tier | Who | Model | What They Do | What They Don't Do |
|------|-----|-------|--------------|--------------------|
| **1 — Orchestrator** | Single point of contact | Opus | Classifies requests, delegates to team leads, synthesizes final answers | Never touches app code, never executes tools directly |
| **2 — Team Leads** | Planning, Engineering, Validation | Opus | Think, plan, break down work, delegate to workers, synthesize worker output | Never execute file operations, never run bash |
| **3 — Workers** | PM, UX, Frontend Dev, Backend Dev, QA, Security | Sonnet | Execute concrete tasks — read/write files, run commands, write code | Never delegate (no `delegate` tool) |

### The Lead vs Worker Contract

| Aspect | Leads | Workers |
|--------|-------|---------|
| Model | `claude-opus-4-6` (expensive, smart) | `claude-sonnet-4-6` (cheaper, fast) |
| Has `delegate` tool | ✅ | ❌ |
| Has `bash`/`edit` tools | ❌ | ✅ |
| Skill: `zero-micro-management` | ✅ "You are a leader — delegate, never execute" | ❌ |
| Skill: `precise-worker` | ❌ | ✅ "Execute exactly what your lead assigned" |
| Can write app code | ❌ | ✅ (within their domain only) |

**Why Opus for leads?** Leads need complex reasoning for planning, coordination, and synthesis. Workers execute narrowly defined tasks where mid-tier intelligence is sufficient.

---

## 4. How Delegation Works

### The `delegate` Tool

```yaml
delegate:
  parameters:
    team: string     # Exact team name from config
    question: string # The specific request
```

Only the Orchestrator and Team Leads have this tool. Workers never delegate.

### The Flow

```
User: "Build feature X"
  │
  ▼
Orchestrator classifies → delegate("Engineering", "Build feature X...")
  │
  ▼ (Orchestrator PAUSED)
Engineering Lead receives → delegate("Backend Dev", "Implement in classifier.py...")
  │
  ▼ (Engineering Lead PAUSED)
Backend Dev executes → reads files, writes code, runs commands
  │
  ▼ (Backend Dev DONE — returns result)
Engineering Lead WAKES → synthesizes → returns to Orchestrator
  │
  ▼ (Engineering Lead DONE)
Orchestrator WAKES → synthesizes final answer → responds to User
```

### Key Mechanics

- **Pause/Wake**: When an agent delegates, the harness **pauses** it (the LLM call sleeps). When the delegate finishes, the caller **wakes up** with the response.
- **Cold Boot**: Each delegated agent starts a **brand new, independent LLM call**. Not a sub-agent inside the caller's context.
- **Full Context**: Every agent gets the **entire `conversation.jsonl`** injected — they see everything that's happened in the session.

### Parallel Delegation

When a Lead outputs multiple `delegate` calls in one turn:

```
Engineering Lead outputs:
  - delegate("Frontend Dev", "...")
  - delegate("Backend Dev", "...")

→ Both run SIMULTANEOUSLY as independent API calls
→ Neither can see the other's output mid-stream
→ When BOTH finish, Lead wakes up to synthesize both responses
```

### Sequential Delegation

When tasks depend on each other:

```
Orchestrator: delegate("Planning", "Define the spec")
  → Planning finishes, returns spec
Orchestrator: delegate("Engineering", "Build per this spec: ...")
  → Engineering finishes, returns implementation
Orchestrator: delegate("Validation", "Validate this implementation: ...")
  → Validation finishes, returns report
```

### Routing Rules

- **Default to ONE team** — only involve multiple when the question genuinely spans domains
- **Sequential when dependent** — Plan → Build → Validate
- **Parallel when independent** — Frontend + Backend can work simultaneously
- **Answer directly when simple** — not everything needs delegation

---

## 5. The Chat Room Model

### conversation.jsonl — The Shared Ledger

Every message in the session is appended to a single JSONL file. The harness is the only writer — agents never write to it directly.

```jsonl
{"from":"User","to":"Orchestrator","message":"ping","timestamp":"..."}
{"from":"Orchestrator","to":"User","message":"Pong.","timestamp":"..."}
{"from":"Orchestrator","to":"Engineering","message":"Summarize the codebase...","timestamp":"..."}
{"from":"Engineering","to":"Backend Dev","message":"Explore and report...","timestamp":"..."}
{"from":"Backend Dev","to":"Engineering","message":"Here's what I found...","timestamp":"..."}
```

### Why This Matters

Every agent gets the **full log injected into every turn**. This means:

- Backend Dev can see the User's original request (not just the Lead's paraphrase)
- Agents can reference decisions made by other agents in other teams
- No context is lost through the delegation chain

This is the **"Chat Room"** — everyone's in the room, everyone sees everything.

### Chat Room vs Traditional Chaining

| Traditional (LangChain-style) | Chat Room Model |
|------|------|
| Agent A output → passed as input to Agent B | Agent B sees the FULL history |
| Each agent only sees what's explicitly passed | Every agent sees everything |
| Context is pushed (you control what each sees) | Context is pulled (agents read the ledger) |
| Brittle: miss one variable and agent is lost | Robust: any agent can reference any prior turn |

### Token Implications

The full JSONL is injected every time → context scales linearly and aggressively. This requires **1M token context windows** and is deliberately token-inefficient.

> "We are not afraid to spend to win here."

---

## 6. Agent Definition Files

Each agent is a `.md` file: **YAML frontmatter** (configuration) + **Markdown body** (system prompt).

### Frontmatter Schema

```yaml
---
name: backend-dev
model: anthropic/claude-sonnet-4-6

expertise:
  - path: .pi/multi-team/expertise/backend-dev-mental-model.yaml
    use-when: "Track API design decisions, database patterns, infrastructure choices."
    updatable: true
    max-lines: 10000

skills:
  - path: .pi/multi-team/skills/mental-model.md
    use-when: Read at task start. Update after completing work.
  - path: .pi/multi-team/skills/active-listener.md
    use-when: Always. Read the conversation log before every response.
  - path: .pi/multi-team/skills/precise-worker.md
    use-when: Always. Execute exactly what your lead assigned.

tools:
  - read
  - write
  - edit
  - grep
  - bash
  - ls
  - find

domain:
  - path: .pi/multi-team/
    read: true
    upsert: false
    delete: false
  - path: apps/backend/
    read: true
    upsert: true
    delete: true
---
```

### Markdown Body (System Prompt)

The body below the frontmatter is the agent's system prompt. It uses template variables that the harness injects at runtime:

- `{{SESSION_DIR}}` — literal filepath to session directory
- `{{CONVERSATION_LOG}}` — the **actual content** of conversation.jsonl (not a path — the full text)
- `{{TEAMS_BLOCK}}` — YAML of available teams (for Orchestrator)
- `{{TEAM_MEMBERS_BLOCK}}` — YAML of team members (for Leads)
- `{{EXPERTISE_BLOCK}}` — reference to mental model files
- `{{SKILLS_BLOCK}}` — skill definitions

**Variables are injected every single turn**, not just at session start. This is how agents stay in sync.

### What's Inside an Agent's Context Window

```
┌─ Agent Context (e.g., Backend Dev) ──────────────────────┐
│                                                           │
│  1. System Prompt (from .md markdown body)                │
│  2. Skills (active-listener.md, precise-worker.md, etc.)  │
│  3. Domain rules (enforced by harness)                    │
│  4. Mental Model YAML content                             │
│  5. Shared Context (README.md, CLAUDE.md)                 │
│  6. FULL conversation.jsonl                               │
│  7. The delegation question from the Lead                 │
│                                                           │
│  Total: can reach hundreds of thousands of tokens         │
└───────────────────────────────────────────────────────────┘
```

---

## 7. multi-team-config.yaml

The single file that defines the entire team structure:

```yaml
orchestrator:
  name: Orchestrator
  path: .pi/multi-team/agents/orchestrator.md
  color: "#72f1b8"

paths:
  agents: .pi/multi-team/agents/
  sessions: .pi/multi-team/sessions/
  logs: .pi/multi-team/logs/

shared_context:
  - README.md
  - CLAUDE.md

teams:
  - team-name: Planning
    team-color: "#fede5d"
    lead:
      name: Planning Lead
      path: .pi/multi-team/agents/planning-lead.md
      color: "#fede5d"
    members:
      - name: Product Manager
        path: .pi/multi-team/agents/product-manager.md
        color: "#f8c674"
        consult-when: Requirements, feature prioritization, user stories
      - name: UX Researcher
        path: .pi/multi-team/agents/ux-researcher.md
        color: "#d9381e"
        consult-when: User behavior, personas, journey mapping

  - team-name: Engineering
    team-color: "#ff6e96"
    lead:
      name: Engineering Lead
      path: .pi/multi-team/agents/engineering-lead.md
      color: "#ff6e96"
    members:
      - name: Frontend Dev
        path: .pi/multi-team/agents/frontend-dev.md
        color: "#36f9f6"
        consult-when: UI components, layouts, client-side state, CSS
      - name: Backend Dev
        path: .pi/multi-team/agents/backend-dev.md
        color: "#ff7edb"
        consult-when: APIs, databases, infrastructure, background jobs

  - team-name: Validation
    team-color: "#ff9e64"
    lead:
      name: Validation Lead
      path: .pi/multi-team/agents/validation-lead.md
      color: "#ff9e64"
    members:
      - name: QA Engineer
        path: .pi/multi-team/agents/qa-engineer.md
        color: "#7dcfff"
        consult-when: Test cases, regression testing, bug reproduction
      - name: Security Reviewer
        path: .pi/multi-team/agents/security-reviewer.md
        color: "#bb9af7"
        consult-when: Threat modeling, auth, data protection, OWASP
```

> "Stop coding, start templating." — Spin up, prune, or re-color entire teams by editing YAML. No code changes.

---

## 8. Skills

Skills are markdown files that define **behavioral instructions** — shared across agents.

| Skill | Used By | Core Instruction |
|-------|---------|------------------|
| `mental-model.md` | All | Read expertise at task start. Update after completing work. |
| `active-listener.md` | All | Always read the conversation log before every response. |
| `conversational-response.md` | Orchestrator + Leads | Always use when writing responses. |
| `zero-micro-management.md` | Orchestrator + Leads | "You are a leader — delegate, never execute." |
| `high-autonomy.md` | Orchestrator + Leads | "Act autonomously, zero questions." |
| `precise-worker.md` | Workers only | "Execute exactly what your lead assigned — no improvising." |

Skills enforce the **Lead vs Worker contract**:
- Leads get `zero-micro-management` → they delegate, never touch files
- Workers get `precise-worker` → they execute the assignment, don't freelance

---

## 9. Mental Models (Expertise Files)

Persistent YAML files where each agent stores what it learns. They survive across sessions.

```yaml
# backend-dev-mental-model.yaml
system:
  runtime: "Node.js"
  language: "TypeScript"

key_files:
  - path: "apps/backend/src/server.ts"
    role: "Main entry point"

architecture:
  layers:
    api:
      pattern: "REST with WebSocket for real-time"
      risks:
        - "WebSocket connection limits"
  decisions:
    - "Chose Express over Fastify for ecosystem maturity"

observations:
  - date: "2026-03-24"
    note: "Engineering team handles scope-heavy requests better with explicit constraints"

open_questions:
  - "Should we split the auth module? It's growing fast."
```

### Rules

- Don't copy-paste entire files — reference by path
- Don't store conversation logs — that's what the session log is for
- Don't be prescriptive about categories — let structure emerge naturally
- Agents with `updatable: true` can write to these files
- `max-lines` prevents unbounded growth

---

## 10. Domain Isolation

Each agent has explicit file-system permissions defined in `domain`:

| Agent | `.pi/multi-team/` | `apps/frontend/` | `apps/backend/` | `specs/` |
|-------|-------------------|-------------------|-------------------|----------|
| Orchestrator | R/W/- | - | - | - |
| Planning Lead | - | - | - | R/W/D |
| Engineering Lead | R/-/- | - | - | - |
| Frontend Dev | R/-/- | R/W/D | R/-/- | - |
| Backend Dev | R/-/- | - | R/W/D | - |

### Domain Violation Recovery

When an agent tries to access something outside its domain:

```
1. Engineering Lead tries to read app files → PERMISSION DENIED
2. Lead recognizes the restriction
3. Lead delegates to Frontend Dev + Backend Dev (who DO have access)
4. Work continues without user intervention
```

> "IT STEPPED OUT OF ITS DOMAIN" — this is a feature, not a bug. It forces proper delegation.

---

## 11. Directory Structure

```
project-root/
├── .pi/
│   └── multi-team/
│       ├── agents/              # Agent .md definitions
│       ├── expertise/           # Persistent mental model .yaml files
│       ├── skills/              # Shared skill .md files
│       ├── sessions/            # Per-session artifacts
│       │   └── <session_id>/
│       │       └── conversation.jsonl
│       ├── logs/
│       └── multi-team-config.yaml
├── apps/
│   ├── frontend/
│   └── backend/
└── specs/
```

### Persistence Model

| Data | Scope | Survives Sessions? |
|------|-------|--------------------|
| `conversation.jsonl` | Per-session | No (session-scoped) |
| Task outputs | Per-session | No |
| Mental models (`expertise/`) | **Global** | **Yes** — this is the learning |

---

## 12. Cost & Model Routing

### Tiered Inference

| Role | Model | Why |
|------|-------|-----|
| Orchestrator | Opus ($$$) | Complex reasoning, coordination |
| Team Leads | Opus ($$$) | Planning, synthesis, judgment |
| Workers | Sonnet ($$) | Execution, narrow tasks |

### The Throughput Multiplier

The user's cognitive load stays constant. Engineering output scales linearly with agent teams. One user + 3 teams = 3x throughput.

> "You always want to be thinking about where the ball is going, not where it is."

---

## 13. Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| Single "God Agent" with 20+ tools | 3-tier hierarchy with specialized agents |
| Agents that start from zero each session | Persistent mental models |
| Leaders executing file operations | Leaders delegate; workers execute |
| Prioritizing cost over results | "Spend money to win" |
| Agents outside their domain | Domain isolation with recovery via delegation |
| Rigid mental model categories | Let structure emerge naturally |
| Complex RAG retrieval | Embrace 1M token context — inject everything |

---

## 14. Key Quotes

| Quote | Meaning |
|-------|---------|
| "One agent is not enough" | Single agents hit a ceiling on real codebases |
| "Agent experts" | Agents that accumulate knowledge, not start fresh |
| "We are not afraid to spend to win" | Token efficiency is not the goal — results are |
| "You are a leader — delegate, never execute" | The Lead/Worker contract |
| "Build systems that build systems" | Meta-engineering — templates over code |
| "Stop coding, start templating" | YAML config > hardcoded agent definitions |
| "Trust + Scale" | Trust your agents, then scale them |
