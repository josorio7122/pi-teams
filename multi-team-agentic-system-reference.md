# Multi-Team Agentic Coding System — Complete Technical Reference

> Reverse-engineered from [IndyDevDan's "Beyond One Agent: Multi-Team Agentic Coding Systems"](https://www.youtube.com/watch?v=M30gp1315Y4)
> Built on the **Pi Agent Harness** (`.pi/` configuration directory)

---

## Table of Contents

1. [Core Thesis](#1-core-thesis)
2. [Architecture Overview](#2-architecture-overview)
3. [Directory Structure](#3-directory-structure)
4. [multi-team-config.yaml](#4-multi-team-configyaml)
5. [Agent Definition Files (YAML Frontmatter + System Prompts)](#5-agent-definition-files)
6. [Skill Files](#6-skill-files)
7. [Mental Model / Expertise Files](#7-mental-model--expertise-files)
8. [Delegation Protocol](#8-delegation-protocol)
9. [Agent Lifecycle](#9-agent-lifecycle)
10. [Communication Patterns — The Chat Room Model](#10-communication-patterns--the-chat-room-model)
11. [Consensus Mechanism](#11-consensus-mechanism)
12. [Domain Isolation & Enforcement](#12-domain-isolation--enforcement)
13. [Cost Optimization & Model Routing](#13-cost-optimization--model-routing)
14. [Session Management](#14-session-management)
15. [Terminal UI (TUI)](#15-terminal-ui-tui)
16. [Workflow Examples](#16-workflow-examples)
17. [Anti-Patterns](#17-anti-patterns)
18. [Key Design Decisions](#18-key-design-decisions)
19. [Tools & Infrastructure](#19-tools--infrastructure)
20. [Key Quotes](#20-key-quotes)

---

## 1. Core Thesis

Single-agent systems are insufficient for complex, production-level software engineering. The future lies in **multi-team agentic systems** — an **Orchestrator** managing specialized **Agent Teams** (Planning, Engineering, Validation), each with specialized **Workers**.

Key enabler: creating **"Agent Experts"** — agents that learn and accumulate knowledge over time through persistent memory files ("mental models"), allowing expertise to compound with each session.

**Evolution path:**
```
Single Agent → Multiple Agents → Agent Teams
```

**Knowledge accumulation over sessions:**
```
Session 1:  patterns
Session 5:  + decisions, conventions
Session 10: + file ownership, bug fixes
Session 20: + tribal knowledge, team norms, architecture, preferences
             = "institutional knowledge"
```

---

## 2. Architecture Overview

### Three-Tier Hierarchy

| Tier | Role | Model | Function |
|------|------|-------|----------|
| **1** | Orchestrator | `claude-opus-4-6` | Single user contact point. Classifies, delegates, synthesizes. |
| **2** | Team Leads | `claude-opus-4-6` | Think & plan. Delegate to workers. Never execute directly. |
| **3** | Workers | `claude-sonnet-4-6` | Execute concrete tasks. Have file-system tools. |

### Team Structure

```
Orchestrator
├── Planning Lead
│   ├── Product Manager
│   └── UX Researcher
├── Engineering Lead
│   ├── Frontend Dev
│   └── Backend Dev
└── Validation Lead
    ├── QA Engineer
    └── Security Reviewer
```

### Communication Flow

```
User ──prompt──▶ Orchestrator
                    │
                    ├──delegate──▶ Planning Lead
                    │                 ├──delegate──▶ Product Manager
                    │                 └──delegate──▶ UX Researcher
                    │                 ◀──synthesis──┘
                    │
                    ├──delegate──▶ Engineering Lead
                    │                 ├──delegate──▶ Frontend Dev
                    │                 └──delegate──▶ Backend Dev
                    │                 ◀──synthesis──┘
                    │
                    └──delegate──▶ Validation Lead
                                      ├──delegate──▶ QA Engineer
                                      └──delegate──▶ Security Reviewer
                                      ◀──synthesis──┘
                    │
User ◀──answer──┘ (Orchestrator synthesizes all team outputs)
```

---

## 3. Directory Structure

```
project-root/
├── .pi/
│   └── multi-team/
│       ├── agents/                          # Agent definition files (.md)
│       │   ├── orchestrator.md
│       │   ├── planning-lead.md
│       │   ├── engineering-lead.md
│       │   ├── validation-lead.md
│       │   ├── product-manager.md
│       │   ├── ux-researcher.md
│       │   ├── frontend-dev.md
│       │   ├── backend-dev.md
│       │   ├── qa-engineer.md
│       │   └── security-reviewer.md
│       ├── expertise/                       # Persistent mental models (.yaml)
│       │   ├── orchestrator-mental-model.yaml
│       │   ├── planning-lead-mental-model.yaml
│       │   ├── engineering-lead-mental-model.yaml
│       │   ├── validation-lead-mental-model.yaml
│       │   ├── product-manager-mental-model.yaml
│       │   ├── ux-researcher-mental-model.yaml
│       │   ├── backend-dev-mental-model.yaml
│       │   └── [frontend-dev, qa-engineer, security-reviewer]-mental-model.yaml
│       ├── skills/                          # Reusable skill definitions (.md)
│       │   ├── active-listener.md
│       │   ├── conversational-response.md
│       │   ├── high-autonomy.md
│       │   ├── mental-model.md
│       │   ├── precise-worker.md
│       │   └── zero-micro-management.md
│       ├── sessions/                        # Per-session artifacts
│       │   └── <session_id>/
│       │       ├── conversation.jsonl
│       │       ├── head-to-head-results.md
│       │       └── ... (other generated artifacts)
│       ├── logs/
│       └── multi-team-config.yaml           # Main orchestration config
├── apps/
│   ├── frontend/
│   └── backend/
├── specs/
├── .env
├── .gitignore
├── CLAUDE.md
├── DEMO.md
├── justfile
├── README.md
└── requirements.txt
```

---

## 4. multi-team-config.yaml

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
        consult-when: Requirements, feature prioritization, user stories, acceptance criteria
      - name: UX Researcher
        path: .pi/multi-team/agents/ux-researcher.md
        color: "#d9381e"
        consult-when: User behavior, personas, journey mapping, usability, friction points

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
        consult-when: UI components, layouts, client-side state, browser APIs, CSS
      - name: Backend Dev
        path: .pi/multi-team/agents/backend-dev.md
        color: "#ff7edb"
        consult-when: APIs, databases, infrastructure, background jobs, third-party integrations

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
        consult-when: Test cases, regression testing, automation, bug reproduction
      - name: Security Reviewer
        path: .pi/multi-team/agents/security-reviewer.md
        color: "#bb9af7"
        consult-when: Threat modeling, authentication, authorization, data protection, OWASP
```

---

## 5. Agent Definition Files

Each agent is a `.md` file with **YAML frontmatter** (configuration) + **Markdown body** (system prompt).

### 5.1 Frontmatter Schema

```yaml
# --- YAML FRONTMATTER ---
name: <agent-name>                          # Unique identifier
model: <openrouter-model-id>                # LLM to use

expertise:
  - path: <relative-path-to-mental-model.yaml>
    use-when: "<instruction for when to read/write>"
    updatable: true|false                   # Can the agent modify this file?
    max-lines: 10000                        # Max size limit

skills:                                     # Array of skill references
  - path: <relative-path-to-skill.md>
    use-when: "<condition>"
  - path: <another-skill.md>
    use-when: "<condition>"

tools:                                      # Available tool names
  - read
  - write
  - edit
  - grep
  - bash
  - find
  - ls
  - delegate                               # Only for Orchestrator + Leads

domain:                                     # File-system permissions
  - path: <directory-or-file>
    read: true|false
    upsert: true|false                      # Write/create
    delete: true|false
```

### 5.2 orchestrator.md

```yaml
---
name: orchestrator
model: anthropic/claude-opus-4-6
expertise:
  - path: .pi/multi-team/expertise/orchestrator-mental-model.yaml
    use-when: "Take notes on team dynamics, track delegation patterns, record which teams handle what well, and note areas where coordination could improve."
    updatable: true
    max-lines: 10000
skills:
  - path: .pi/multi-team/skills/conversational-response.md
    use-when: Always use when writing responses.
  - path: .pi/multi-team/skills/mental-model.md
    use-when: Read at task start for context. Update after completing work to capture learnings.
  - path: .pi/multi-team/skills/active-listener.md
    use-when: Always. Read the conversation log before every response.
  - path: .pi/multi-team/skills/zero-micro-management.md
    use-when: Always. You are a leader - delegate, never execute.
  - path: .pi/multi-team/skills/high-autonomy.md
    use-when: Always. Act autonomously, zero questions.
tools:
  - read
  - write
  - grep
  - find
  - ls
  - delegate
domain:
  - path: .pi/multi-team/
    read: true
    upsert: true
    delete: false
---
# Orchestrator — Product Team Coordinator

## Purpose
You coordinate a product team. The user talks to you. You classify their request, delegate to the right team using the `delegate` tool, and synthesize their output into a direct answer. If a follow-up question emerges that requires a different team, you delegate again — sequentially, not in parallel.

## Variables
> Runtime context injected at startup.

- **Session Directory:** `{{SESSION_DIR}}` — write session-level notes and detailed output here
- **Conversation Log:** `{{CONVERSATION_LOG}}` — append-only JSONL of the full session (user, orchestrator, leads, members). Read this at the start of each task for full context.

## Instructions
- Classify the user's request by domain and route to the right team lead.
- Default to ONE team. Only involve multiple when the question genuinely spans domains.
- When work is dependent, delegate sequentially based on dependencies.
- Answer directly when the question is simple — not everything needs delegation.
- After receiving team output, synthesize into your answer. Don't just relay.
- Be decisive, direct, and conversational. You're the user's interface to a powerful team — make it feel effortless.

## Teams
> Your team leads and their members. Use the exact `team-name` value when calling `delegate`.
```yaml
{{TEAMS_BLOCK}}
```

## Tools
> Tools available for coordinating with your teams.

**delegate(team, question)** — Route a question to a team lead.

When you call `delegate`:
1. The team's **Lead** receives your question
2. The Lead may consult **Members** for specialist input
3. The Lead **synthesizes** responses into a team position
4. You receive the synthesis and respond to the user

You can call `delegate` multiple times in sequence if a follow-up emerges that another team should address.

## Expertise
> These are your personal files. Read them for context. If marked updatable, write to them freely — take notes, build mental models, track observations about other board members' arguments and behaviors.
```yaml
{{EXPERTISE_BLOCK}}
```

## Skills
> If you have Skills listed here, read and use them when the time is right based on the 'use-when' field.
```yaml
{{SKILLS_BLOCK}}
```
```

### 5.3 engineering-lead.md

```yaml
---
name: engineering-lead
model: anthropic/claude-opus-4-6
expertise:
  - path: .pi/multi-team/expertise/engineering-lead-mental-model.yaml
    use-when: "Track architecture decisions, technical debt, risk patterns, and which implementation approaches work well for this codebase."
    updatable: true
    max-lines: 10000
skills:
  - path: .pi/multi-team/skills/conversational-response.md
    use-when: Always use when writing responses.
  - path: .pi/multi-team/skills/mental-model.md
    use-when: Read at task start for context. Update after completing work to capture learnings.
  - path: .pi/multi-team/skills/active-listener.md
    use-when: Always. Read the conversation log before every response.
  - path: .pi/multi-team/skills/zero-micro-management.md
    use-when: Always. You are a leader - delegate, never execute.
tools:
  - read
  - write
  - grep
  - find
  - ls
  - delegate
domain:
  # [Leads have restricted domain — cannot directly access app code]
---
# Engineering Lead

## Purpose
You lead the engineering team. Your job is to translate product requirements into technical plans, estimate effort, identify risks, and sequence work. You think in systems — APIs, data models, infrastructure, and deployment.

## Variables
> Runtime context injected at startup.

- **Session Directory:** `{{SESSION_DIR}}`
- **Conversation Log:** `{{CONVERSATION_LOG}}`

## Instructions
- When given a task, break it down into concrete implementation steps with time estimates.
- Be practical — prefer working software and pragmatic shortcuts over elegant overengineering.
- Call out technical debt, scaling risks, and propose mitigations.
- Respond with specific technical decisions, not abstract advice. Name the files that will change and how.

## Your Team
> Your team members. Use the exact name when calling `delegate`.
```yaml
{{TEAM_MEMBERS_BLOCK}}
```
```

### 5.4 planning-lead.md

```yaml
---
name: planning-lead
model: anthropic/claude-opus-4-6
expertise:
  - path: .pi/multi-team/expertise/planning-lead-mental-model.yaml
    use-when: "Track scope decisions, milestone definitions, prioritization frameworks, and lessons on what estimation patterns work."
    updatable: true
    max-lines: 10000
skills:
  - path: .pi/multi-team/skills/conversational-response.md
    use-when: Always use when writing responses.
  - path: .pi/multi-team/skills/mental-model.md
    use-when: Read at task start for context. Update after completing work to capture learnings.
  - path: .pi/multi-team/skills/active-listener.md
    use-when: Always. Read the conversation log before every response.
  - path: .pi/multi-team/skills/zero-micro-management.md
    use-when: Always. You are a leader - delegate, never execute.
tools:
  - read
  - write
  - grep
  - find
  - ls
  - delegate
domain:
  - path: specs/
    read: true
    upsert: true
    delete: true
---
# Planning Lead
# [System prompt follows same structure as other leads]
```

### 5.5 backend-dev.md (Worker)

```yaml
---
name: backend-dev
model: anthropic/claude-sonnet-4-6
expertise:
  - path: .pi/multi-team/expertise/backend-dev-mental-model.yaml
    use-when: "Track API design decisions, database patterns, infrastructure choices, and scaling observations."
    updatable: true
    max-lines: 10000
skills:
  - path: .pi/multi-team/skills/mental-model.md
    use-when: Read at task start for context. Update after completing work to capture learnings.
  - path: .pi/multi-team/skills/active-listener.md
    use-when: Always. Read the conversation log before every response.
  - path: .pi/multi-team/skills/precise-worker.md
    use-when: Always. Execute exactly what your lead assigned - no improvising.
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
# Backend Developer

## Purpose
You build APIs, databases, and infrastructure. You think in endpoints, data models, queues, and deployment pipelines. You know Node.js, Python, Go, PostgreSQL, Redis, and cloud infrastructure.

## Variables
- **Session Directory:** `{{SESSION_DIR}}`
- **Conversation Log:** `{{CONVERSATION_LOG}}`

## Instructions
- When asked about a feature, define the API endpoints, database schema, background jobs, and third-party integrations needed.
- Focus on scaling bottlenecks early and propose pragmatic solutions.
- When API surface is exposed, write down the request/response shapes, schema rules, and state modifications.
- Write code and detailed API specs to files. Keep chat responses focused on architecture decisions.
```

### 5.6 frontend-dev.md (Worker — Domain only)

```yaml
domain:
  - path: .pi/multi-team/
    read: true
    upsert: false
    delete: false
  - path: apps/frontend/
    read: true
    upsert: true
    delete: true
```

### Key Differences: Leads vs Workers

| Aspect | Leads | Workers |
|--------|-------|---------|
| **Model** | `claude-opus-4-6` | `claude-sonnet-4-6` |
| **Has `delegate` tool** | ✅ Yes | ❌ No |
| **Has `bash`/`edit` tools** | ❌ No | ✅ Yes |
| **Skill: `zero-micro-management`** | ✅ Yes | ❌ No |
| **Skill: `precise-worker`** | ❌ No | ✅ Yes |
| **Domain write access to app code** | ❌ No (restricted) | ✅ Yes (own domain only) |

---

## 6. Skill Files

### 6.1 mental-model.md (FULLY VISIBLE)

```markdown
# Mental Model

## Instructions

You have personal expertise files — structured YAML documents that represent your mental model
of the system you work on. These are YOUR files. You own them.

### When to Read
- **At the start of every task** — read your expertise file(s) for context before doing anything
- **When you need to recall** prior observations, decisions, or patterns
- **When a teammate references something** you've tracked before

### When to Update
- **After completing meaningful work** — capture what you learned
- **When you discover something new** about the system (architecture, patterns, gotchas)
- **When your understanding changes** — update stale entries, don't just append
- **When you observe team dynamics** — note what works, what doesn't, who's strong at what

### How to Structure
Write structured YAML. Don't be rigid about categories — let the structure emerge from your work.
But keep it organized enough that you can scan it quickly.

```yaml
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
    note: "Engineering team handles scope-heavy requests better when given explicit constraints"
open_questions:
  - "Should we split the auth module? It's growing fast."
```

### What NOT to Store
- **Don't copy-paste entire files** — reference them by path
- **Don't store conversation logs** — that's what the session log is for
- **Don't store test results** — just conclusions
- **Don't be prescriptive about your own categories** — evolve them naturally
```

### 6.2 Other Skills (Content Not Fully Shown)

| Skill | Used By | Purpose |
|-------|---------|---------|
| `active-listener.md` | All agents | "Always: Read the conversation log before every response." |
| `conversational-response.md` | Leads + Orchestrator | "Always use when writing responses." |
| `high-autonomy.md` | Orchestrator + Leads | "Always: Act autonomously, zero questions." |
| `zero-micro-management.md` | Orchestrator + Leads | "Always: You are a leader — delegate, never execute." |
| `precise-worker.md` | Workers only | "Always: Execute exactly what your lead assigned — no improvising." |

---

## 7. Mental Model / Expertise Files

### Structure (from backend-dev-mental-model.yaml)

```yaml
# SYSTEM OVERVIEW
system:
  runtime: "..."
  language: "..."
  layers: [...]

# KEY FILES — BACKEND RELEVANCE
key_files:
  - path: "apps/backend/src/server.ts"
    role: "Main entry point"
  - path: "apps/backend/src/routes/"
    role: "API route definitions"

# MY DOMAIN AS BACKEND DEV
my_domain:
  read_write:
    - "apps/backend/"

# ARCHITECTURE
architecture:
  layers:
    api:
      pattern: "REST with WebSocket for real-time"
      risks:
        - "WebSocket connection limits"
  decisions:
    - "Chose Express over Fastify for ecosystem maturity"

# OBSERVATIONS
observations:
  - date: "2026-03-24"
    note: "Engineering team handles scope-heavy requests better when given explicit constraints"

# OPEN QUESTIONS
open_questions:
  - "Should we split the auth module? It's growing fast."
```

### Evolution Over Time

| Session | Content Added |
|---------|---------------|
| 1 | `patterns` |
| 5 | + `decisions`, `conventions` |
| 10 | + `file ownership`, `bug fixes` |
| 20 | + `tribal knowledge`, `team norms`, `architecture`, `preferences` |

---

## 8. Delegation Protocol

### The `delegate` Tool

```yaml
delegate:
  description: Route a question to a team lead.
  parameters:
    team: string     # Exact team name from config
    question: string # The specific request
```

- **Available to:** Orchestrator and Team Leads only
- **Not available to:** Workers (they execute, not delegate)

### What Happens When `delegate` Is Called

This is the critical mechanic. `delegate` does **NOT** run a sub-agent inside the caller's context. It signals the **Pi harness** (the Python backend) to route communication:

```
1. Orchestrator outputs tool call: delegate(team="Engineering", question="...")
2. Pi harness INTERCEPTS the tool call
3. Harness APPENDS to conversation.jsonl: {from: "Orchestrator", to: "Engineering", message: "..."}
4. Harness PAUSES the Orchestrator (sleeps the LLM call)
5. Harness spins up a BRAND NEW independent LLM call for Engineering Lead
6. Engineering Lead boots "cold" but gets the FULL conversation.jsonl injected
7. Engineering Lead processes, potentially delegates further
8. When Engineering Lead finishes, harness writes response to JSONL
9. Harness WAKES UP the Orchestrator with the response
```

### Full Delegation Chain — Step by Step

```
 1. User → Pi Harness: "Build the ComplementNB classifier"
 2. Harness writes to JSONL: {from: "User", to: "Orchestrator", message: "..."}
 3. Harness invokes Orchestrator LLM (injects full JSONL into prompt)
 4. Orchestrator outputs: delegate(team="Engineering", question="Build ComplementNB")
 5. Harness writes to JSONL: {from: "Orchestrator", to: "Engineering", message: "..."}
 6. Harness PAUSES Orchestrator
 7. Harness invokes Engineering Lead LLM (injects full JSONL into prompt)
 8. Engineering Lead outputs: delegate(team="Backend Dev", question="Implement in classifier.py")
 9. Harness writes to JSONL: {from: "Engineering", to: "Backend Dev", message: "..."}
10. Harness PAUSES Engineering Lead
11. Harness invokes Backend Dev LLM (injects full JSONL into prompt)
12. Backend Dev executes: reads files, writes code, runs commands
13. Backend Dev outputs final text response (no delegate call)
14. Harness writes to JSONL: {from: "Backend Dev", to: "Engineering", message: "..."}
15. Harness WAKES UP Engineering Lead with Backend Dev's response
16. Engineering Lead synthesizes, outputs final text response
17. Harness writes to JSONL: {from: "Engineering", to: "Orchestrator", message: "..."}
18. Harness WAKES UP Orchestrator with Engineering Lead's response
19. Orchestrator synthesizes final answer for User
20. Harness writes to JSONL: {from: "Orchestrator", to: "User", message: "..."}
```

### Parallel Delegation

When a Lead calls `delegate` multiple times in a single turn:

```
1. Engineering Lead outputs TWO tool calls in one response:
   - delegate(team="Frontend Dev", question="...")
   - delegate(team="Backend Dev", question="...")
2. Harness detects multiple tool calls
3. Spawns SEPARATE ASYNC THREADS for each target worker
4. Both workers run SIMULTANEOUSLY as independent API calls
5. Each worker boots with the JSONL as it existed at spawn time
6. Harness waits for ALL threads to return
7. Writes both responses to JSONL
8. Wakes up the Engineering Lead to synthesize all responses
```

> **Important:** Parallel agents cannot see each other's output mid-stream. Only after ALL finish does the JSONL get updated with all their responses.

### Multi-Turn Back-and-Forth

Agents can have multi-turn conversations within a team:

```
1. Lead delegates to Worker with a question
2. Worker outputs a CLARIFYING QUESTION (not a final answer)
3. Harness writes the question to JSONL
4. Harness RE-INVOKES the Lead with the updated log
5. Lead responds to the clarification
6. Harness writes response to JSONL
7. Harness RE-INVOKES the Worker with the updated log
8. Worker now has the clarification and produces final answer
9. Continues until a final answer (no delegate call) is produced
```

### Routing Rules (from Orchestrator prompt)

- **Default to ONE team** — only involve multiple when question genuinely spans domains
- **Sequential when dependent** — delegate based on dependencies
- **Parallel when independent** — e.g., Frontend Dev and Backend Dev can work simultaneously
- **Answer directly** when simple — not everything needs delegation
- **Sequential for follow-ups:** "If a follow-up question emerges that requires a different team, you delegate again — sequentially, not in parallel."

---

## 9. Agent Lifecycle

### Initialization (Every Turn)

The Pi harness performs these steps **every time** an agent is invoked:

```
1. Read agent's .md definition file (frontmatter + body)
2. Read conversation.jsonl from disk (latest version)
3. INJECT runtime variables into system prompt:
   ├── {{SESSION_DIR}}        → literal filepath string (e.g., ".pi/multi-team/sessions/m7p0...")
   ├── {{CONVERSATION_LOG}}   → the literal MULTILINE STRING CONTENT of the JSONL file
   │                            (NOT a file path — the actual text of every message)
   ├── {{TEAMS_BLOCK}}        → YAML of available teams from multi-team-config.yaml
   ├── {{EXPERTISE_BLOCK}}    → reference to mental model files
   └── {{SKILLS_BLOCK}}       → skill definitions
4. Append skill file contents directly into the prompt
5. Inject mental model YAML content
6. Inject shared context files (README.md, CLAUDE.md)
7. Make the Anthropic API call with the fully assembled prompt
```

> **Key insight:** Variables are injected **every single turn**, not just at session start.
> This is how agents stay in sync — they get the latest conversation log every time they're invoked.

### What's Inside an Agent's Context Window

```
┌─ Agent Context (e.g., Backend Dev) ─────────────────────────┐
│                                                              │
│  1. System Prompt (from backend-dev.md markdown body)        │
│  2. Skills (active-listener.md, precise-worker.md, etc.)     │
│  3. Domain rules (path permissions — enforced by harness)    │
│  4. Mental Model (backend-dev-mental-model.yaml CONTENT)     │
│  5. Shared Context (README.md, CLAUDE.md CONTENT)            │
│  6. FULL conversation.jsonl (EVERY message from EVERY agent) │
│  7. The delegation question from the Lead                    │
│                                                              │
│  Total: can reach hundreds of thousands of tokens            │
└──────────────────────────────────────────────────────────────┘
```

### Execution

- Agent uses allowed tools within enforced domain
- Pi harness intercepts **ALL** tool calls, enforces domain permissions
- All agent outputs are appended to `conversation.jsonl` **by the harness** (agents never write to it directly)

### Completion

- Agent updates mental model with new learnings (via `write` tool to expertise YAML)
- Session artifacts persist in session directory
- Mental model changes persist **globally** in `expertise/` directory across sessions

---

## 10. Communication Patterns — The Chat Room Model

### Core Architecture: Shared Ledger + Separate Brains

Every agent runs in a **completely separate, sandboxed LLM context**. They are NOT in one continuous conversation. But because the Pi harness **injects the full `conversation.jsonl`** into every agent's prompt before each call, their context windows overlap heavily.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      conversation.jsonl                              │
│           (single source of truth — append-only)                     │
│                                                                      │
│  {"from":"User","to":"Orchestrator","message":"ping"}               │
│  {"from":"Orchestrator","to":"User","message":"Pong"}               │
│  {"from":"Orchestrator","to":"Engineering","message":"..."}          │
│  {"from":"Engineering","to":"Backend Dev","message":"..."}           │
│  {"from":"Backend Dev","to":"Engineering","message":"..."}           │
│  ...                                                                 │
└──────────────┬──────────────────┬──────────────────┬────────────────┘
               │                  │                  │
      ┌────────▼─────────┐ ┌─────▼────────────┐ ┌───▼──────────────┐
      │  Orchestrator     │ │  Eng Lead        │ │  Backend Dev     │
      │  (separate LLM)   │ │  (separate LLM)  │ │  (separate LLM)  │
      │                   │ │                  │ │                   │
      │  Sees FULL log    │ │  Sees FULL log   │ │  Sees FULL log   │
      │  at every turn    │ │  at every turn   │ │  at every turn   │
      └───────────────────┘ └──────────────────┘ └───────────────────┘
```

### Why "Chat Room" — vs Traditional Agent Chaining

| Traditional (LangChain-style) | Chat Room Model |
|------|------|
| Agent A output → passed as user prompt to Agent B | Agent B sees the **FULL** conversation: User's original prompt, Orchestrator's thoughts, Agent A's output, parallel Agent C's output |
| Each agent only sees what's explicitly passed to it | Every agent sees everything — they're "in the room" |
| Context is **pushed** (you decide what each agent sees) | Context is **pulled** (agents read the shared ledger) |
| Brittle: miss one variable and agent is lost | Robust: agents can reference anything from any prior turn |

### Active Listening — What It Means Technically

Agents don't just respond to the `delegate` question. Because they see the **entire** log, they can:

- Reference decisions made by other agents earlier in the session
- See what other parallel teams concluded
- Understand the user's original intent (not just their Lead's paraphrase of it)
- Build on context from any prior turn without needing it explicitly passed via `delegate`

This is enforced by the `active-listener.md` skill: *"Always: Read the conversation log before every response."*

### conversation.jsonl — Exact Format

Append-only JSONL. The **Pi harness is the only writer** — agents never write to this file directly.

```jsonl
{"from":"System","message":"Session started...","timestamp":"2026-03-26T16:34:25Z","type":"system"}
{"from":"User","to":"Orchestrator","message":"ping","timestamp":"2026-03-26T16:44:45Z"}
{"from":"Orchestrator","to":"User","message":"Pong. Teams are online...","timestamp":"2026-03-26T16:44:50Z"}
{"from":"User","to":"Orchestrator","message":"ping each team lead","timestamp":"2026-03-26T16:45:00Z"}
{"from":"Orchestrator","to":"Planning","message":"ping - confirm you're online and ready","timestamp":"..."}
{"from":"Planning","to":"Orchestrator","message":"✅ PM + UX Researcher ready","timestamp":"..."}
```

### Token Implications

Because the **entire** JSONL history is injected into every agent's prompt on every turn:

- Context size scales **linearly and aggressively** with conversation length
- This is why the system **requires** Claude's **1 Million token context window**
- It is deliberately token-inefficient but provides maximum context
- Philosophy: *"We are not afraid to spend to win."*

### Sequential vs Parallel — Technical Implementation

| Pattern | What the Harness Does | When Used |
|---------|----------------------|-----------|
| **Parallel** | Detects multiple `delegate` tool calls in one turn → spawns N async threads → N simultaneous API calls → waits for all → writes all responses to JSONL → wakes caller | Independent sub-tasks (Frontend + Backend) |
| **Sequential** | Orchestrator waits for one delegation to fully complete, reads response, then issues next `delegate` call in its next turn | Dependent phases (Plan → Build → Validate) |

### The Complete Message Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│ User types "build feature X"                                     │
│                                                                  │
│  1. Harness writes {from:User, to:Orchestrator} → JSONL         │
│  2. Harness reads JSONL, injects into Orchestrator's prompt     │
│  3. Orchestrator LLM call → outputs delegate("Engineering",..") │
│  4. Harness writes {from:Orchestrator, to:Engineering} → JSONL  │
│  5. Harness PAUSES Orchestrator                                  │
│  6. Harness reads JSONL, injects into Eng Lead's prompt         │
│  7. Eng Lead LLM call → outputs delegate("Backend Dev","...")   │
│  8. Harness writes {from:Engineering, to:Backend Dev} → JSONL   │
│  9. Harness PAUSES Eng Lead                                      │
│ 10. Harness reads JSONL, injects into Backend Dev's prompt      │
│ 11. Backend Dev LLM call → uses tools → outputs final text      │
│ 12. Harness writes {from:Backend Dev, to:Engineering} → JSONL   │
│ 13. Harness WAKES Eng Lead (re-reads JSONL with new entry)      │
│ 14. Eng Lead synthesizes → outputs final text                    │
│ 15. Harness writes {from:Engineering, to:Orchestrator} → JSONL  │
│ 16. Harness WAKES Orchestrator (re-reads JSONL with new entry)  │
│ 17. Orchestrator synthesizes → outputs final answer to User     │
│ 18. Harness writes {from:Orchestrator, to:User} → JSONL        │
│ 19. TUI renders the answer                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Consensus Mechanism

### Process

1. User sends broadcast prompt (e.g., "ask all teams: what classifiers should we test?")
2. Orchestrator delegates **identical** prompt to Planning, Engineering, Validation
3. Each Lead delegates to their specialized workers
4. Workers evaluate using their domain expertise
5. Leads synthesize team findings, report to Orchestrator
6. Orchestrator compiles **consensus matrix**

### Output Format

```markdown
## Summary
All three teams weighed in.

### Strong Consensus (Unanimous)
- LinearSVC — all three teams independently recommended

### Split Recommendations
- Planning + Validation chose ComplementNB
- Engineering chose SGDClassifier

### Unanimous Rejections
- RandomForest — all teams agreed to skip

### Next Steps
- Right now we need...
```

---

## 12. Domain Isolation & Enforcement

### How It Works
- Defined in `domain` block of each agent's YAML frontmatter
- File path + boolean permissions: `read`, `upsert` (write/create), `delete`
- Enforced by the Pi harness at runtime — **before** the tool executes

### Permission Matrix

| Agent | `.pi/multi-team/` | `apps/frontend/` | `apps/backend/` | `specs/` |
|-------|-------------------|-------------------|-------------------|----------|
| Orchestrator | R/W/- | - | - | - |
| Planning Lead | - | - | - | R/W/D |
| Engineering Lead | R/-/- | - | - | - |
| Frontend Dev | R/-/- | R/W/D | R/-/- | - |
| Backend Dev | R/-/- | - | R/W/D | - |

> R=read, W=upsert, D=delete, -=no access

### Domain Violation Recovery

```
1. Agent attempts tool execution outside its domain
2. Pi harness BLOCKS execution → returns permission error to the agent
3. Agent recognizes limitation from its prompt/error
4. Agent uses `delegate` to route task to agent WITH correct domain access
5. Work continues without user intervention
```

---

## 13. Cost Optimization & Model Routing

### Tiered Inference by Role

| Role | Model | Cost Tier |
|------|-------|-----------|
| Orchestrator | `claude-opus-4-6` | High |
| Team Leads | `claude-opus-4-6` | High |
| Workers | `claude-sonnet-4-6` | Mid |

### Prompt Complexity Classifier (the project being built in the demo)

A 3-stage Python pipeline:

```
User Prompt → TfidfVectorizer → Classifier → Complexity Label → Model Route
```

| Complexity | Routed To |
|-----------|-----------|
| `LOW` | `claude-haiku-4-5` |
| `MID` | `claude-sonnet-4-6` |
| `HIGH` | `claude-opus-4-6` |

**ML Models tested:** LogisticRegression, ComplementNB, LinearSVC, SGDClassifier

### Real-Time Cost Tracking

- Per-agent cost shown in TUI footer
- Tracks prompt + completion tokens × model rate
- Parent nodes show summed cost of children
- Total system cost at Orchestrator level

---

## 14. Session Management

### Creation
- Unique hashed session ID generated at startup
- Directory: `.pi/multi-team/sessions/{SESSION_ID}/`

### Artifacts Per Session
- `conversation.jsonl` — immutable log of all inter-agent traffic
- Agent-specific `.md` files — session-level scratchpads and task reports
- Generated outputs (e.g., `head-to-head-results.md`)

### Persistence Model
| Data | Scope | Location |
|------|-------|----------|
| Conversation log | Session only | `sessions/{id}/conversation.jsonl` |
| Task outputs | Session only | `sessions/{id}/*.md` |
| Mental models | **Global / persistent** | `expertise/*.yaml` |

---

## 15. Terminal UI (TUI)

### Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ S  System                                                  11:39 AM │
│    Your Agent Teams                                                 │
│    Orchestrator (claude-opus-4-6)                                   │
│    ├── Planning Lead (claude-opus-4-6)                              │
│    │   ├── Product Manager (claude-sonnet-4-6)                      │
│    │   └── UX Researcher (claude-sonnet-4-6)                        │
│    ├── Engineering Lead (claude-opus-4-6)                           │
│    │   ├── Frontend Dev (claude-sonnet-4-6)                         │
│    │   └── Backend Dev (claude-sonnet-4-6)                          │
│    └── Validation Lead (claude-opus-4-6)                            │
│        ├── QA Engineer (claude-sonnet-4-6)                          │
│        └── Security Reviewer (claude-sonnet-4-6)                    │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ Y  You                                                     11:44 AM│
│    ping                                                             │
│──────────────────────────────────────────────────────────────────────│
│ D  Orchestrator                                            11:44 AM│
│    Pong. 🏓                                                        │
│    Teams are online — Planning, Engineering, and Validation...      │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ │ _ (blinking cyan cursor)                                          │
│                                                                      │
│ prompt-routing | 30s                                                 │
│ └─ 🧠 Orch           💰 $0.058  🧠 1M    claude-opus-4-6           │
│    ├─ ◆ Planning Lead 💰 $0.012  🧠 1M                              │
│    ├─ ◆ Eng Lead      💰 $0.034  🧠 1043K                           │
│    └─ ◆ Val Lead      💰 $0.008  🧠 1M                              │
└──────────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Location | Description |
|-----------|----------|-------------|
| **System Header** | Top | Shows agent hierarchy tree at session start |
| **Chat Area** | Center (scrollable) | Message history with agent attribution |
| **Input Area** | Above footer | Cyan vertical bar `│` + blinking cursor |
| **Status Footer** | Bottom (fixed) | Live agent tree with costs + tokens |

### Color Scheme

| Agent | Hex Color |
|-------|-----------|
| Orchestrator | `#72f1b8` (mint green) |
| Planning Lead | `#fede5d` (warm yellow) |
| Product Manager | `#f8c674` (orange-yellow) |
| UX Researcher | `#d9381e` (red) |
| Engineering Lead | `#ff6e96` (pink/magenta) |
| Frontend Dev | `#36f9f6` (cyan) |
| Backend Dev | `#ff7edb` (purple-pink) |
| Validation Lead | `#ff9e64` (orange) |
| QA Engineer | `#7dcfff` (light blue) |
| Security Reviewer | `#bb9af7` (lavender) |
| User Input | Cyan |
| Dividers | Purple/Magenta |

### Message Format

```
 [AVATAR]  [Agent Name]                                     [Timestamp]
           [Message body — indented, supports markdown]
           [Tables, code blocks, bullet points]
```

- **Avatar blocks:** Solid colored square with single letter (Y=You, D=Orchestrator, E=Eng Lead, etc.)
- **Delegation:** Shown as `@TeamName` in colored text
- **Thinking state:** Dim grey `thinking...` before streaming begins
- **Tool usage:** File paths shown in green before response text

### Interactive Commands

- `/toggle-workers` — Expand/collapse worker agents in status tree

### Real-Time Behavior

- **Parallel streaming:** Multiple agent blocks appear simultaneously, all showing `thinking...`, then stream character-by-character
- **Cost tickers:** Update immediately after agent completes streaming
- **Delegation cascades:** New agent blocks spawn below the delegating agent

---

## 16. Workflow Examples

### Workflow 1: System Check

```
User: ping
→ Orchestrator: "Pong. 🏓 Teams are online."

User: ping each team lead
→ Orchestrator delegates in parallel:
  → @Planning: "Ping"   → Planning Lead: "✅ Product Manager + UX Researcher ready"
  → @Engineering: "Ping" → Engineering Lead: "✅ Frontend Dev + Backend Dev ready"
  → @Validation: "Ping"  → Validation Lead: "✅ QA Engineer + Security Reviewer ready"
→ Orchestrator: "Full squad online. What's the mission?"
```

### Workflow 2: Domain Violation & Recovery

```
User: "have engineering summarize the codebase"
→ Orchestrator → @Engineering
→ Engineering Lead attempts to read files → PERMISSION DENIED
→ Engineering Lead: "I have restricted tool access as a lead — let me delegate."
→ @Frontend Dev + @Backend Dev (parallel)
→ Both Devs successfully read file trees
→ Engineering Lead synthesizes → Orchestrator outputs final tree
```

### Workflow 3: Multi-Team Consensus

```
User: "ask all teams: what are two additional scikit learn classifiers?"
→ Orchestrator delegates identical prompt to all 3 leads (parallel)
→ Each lead delegates to their workers
→ Workers evaluate from their domain perspective
→ Leads synthesize and return
→ Orchestrator outputs consensus matrix:
  - Strong Consensus: LinearSVC (unanimous)
  - Split: Planning→ComplementNB, Engineering→SGDClassifier
  - Skip: RandomForest (unanimous rejection)
```

### Workflow 4: Full Plan-Build-Validate Lifecycle

```
User: "plan, engineer, and then validate. Build out ComplementNB."
→ Phase 1: Orchestrator → @Planning
  → Planning Lead → PM + UX Researcher
  → Output: implementation spec markdown

→ Phase 2: Orchestrator → @Engineering
  → Engineering Lead → Backend Dev
  → Backend Dev writes code, updates justfile
  → Output: working implementation

→ Phase 3: Orchestrator → @Validation
  → Validation Lead → Security Reviewer + QA Engineer
  → Security flags pickle.load() risk
  → QA finds label mapping delta
  → Output: validation report

→ Orchestrator: Final synthesis with all phases summarized
```

---

## 17. Anti-Patterns

| ❌ Anti-Pattern | ✅ Correct Approach |
|-----------------|---------------------|
| Single "God Agent" with 20+ tools | 3-tier hierarchy with specialized agents |
| Agents that start from zero each session | Persistent mental models in expertise files |
| Leaders executing file operations directly | Leaders delegate; workers execute |
| Prioritizing cost over results | "Spend money to win" — use Opus for reasoning |
| Agents operating outside their domain | Domain isolation with automatic recovery via delegation |
| `pickle.load()` without integrity checks | Security reviewer catches this |
| Storing full files in mental models | Reference by path instead |
| Rigid predefined mental model categories | Let structure emerge naturally from work |
| Complex RAG retrieval with small context | Embrace 1M token context windows — inject everything |

---

## 18. Key Design Decisions

### Why Hierarchical (3-Tier) vs Flat?
Passing 20+ tools to a single agent causes cognitive overload, token bloat, and prompt drifting. The hierarchy mirrors a human organization — managers manage, coders code. Context scales perfectly.

### Why Chat Room Model?
Strict API daisy-chaining limits flexibility. A shared `conversation.jsonl` allows "Active Listening" — agents build contextual awareness passively without rigid variable injection.

### Why YAML for Config?
Heavily template-driven. Spin up, prune, or re-color entire teams by editing a YAML block. No code changes needed.

### Why Separate Expertise Files?
Long-term memory. Avoids "50 First Dates" syndrome. YAML mental models allow agents to learn architectural quirks and preferences, scaling effectiveness exponentially over time.

### Why Embrace Massive Context Windows?
Using Claude's 1M token context abandons brittle RAG retrieval. Philosophy: "spend money to win" — inject full logs, complete mental models, and detailed tool specs unconditionally.

### Why Opus for Leads, Sonnet for Workers?
Leads need complex reasoning for planning and coordination. Workers execute narrowly defined tasks where mid-tier intelligence suffices. Cost optimization without capability sacrifice.

---

## 19. Tools & Infrastructure

| Tool | Used By | Description |
|------|---------|-------------|
| `read` | All | Read file contents |
| `write` | Leads + Workers | Write/create files |
| `edit` | Workers only | Edit existing files |
| `grep` | All | Search file contents |
| `bash` | Workers only | Execute shell commands |
| `find` | All | Find files |
| `ls` | All | List directory contents |
| `delegate` | Orchestrator + Leads | Route tasks to other agents |

### External Tools & References

- **Pi Agent Harness** — the runtime framework (`.pi/` directory)
- **`just` command runner** — aliased as `j`, drives project recipes from `justfile`
- **Cursor IDE** — used for editing configs alongside the TUI
- **LLMs:** `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`
- **ML Libraries:** scikit-learn (LogisticRegression, ComplementNB, TfidfVectorizer, LinearSVC, SGDClassifier)

---

## 20. Key Quotes

| Timestamp | Quote |
|-----------|-------|
| 0:08 | "ONE AGENT IS NOT ENOUGH" |
| 0:24 | "You stopped using agents that forget and you started using AGENT EXPERTS." |
| 1:08 | "If you're a cost min-maxer and you care about saving money over getting results, this video is NOT for you." |
| 2:54 | "IT STEPPED OUT OF ITS DOMAIN" |
| 7:35 | "All three teams weighed in, and there's strong consensus." |
| 8:57 | "We are not afraid to spend to win here." |
| 9:28 | "You always want to be thinking about where the ball is going, not where it is." |
| 14:49 | "You are a leader — delegate, never execute." |
| 27:32 | "META AGENT", "META TEAM" |
| 32:11 | "BUILD SYSTEMS THAT BUILD SYSTEMS" |
| 32:26 | "STOP CODING, START TEMPLATING" |
| 33:55 | "TRUST + SCALE" |

---

## References

- **Video:** [Beyond One Agent: Multi-Team Agentic Coding Systems](https://www.youtube.com/watch?v=M30gp1315Y4) by IndyDevDan
- **Course:** Tactical Agentic Coding (TAC) at `agentichorizon.com/tactical-agentic-coding`
- **Related videos:** "CEO Agents", "Pi Agents vs Claude Code"
