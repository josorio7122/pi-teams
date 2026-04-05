# Team Definition

## Overview

A team definition describes how agents are organized into a delegation hierarchy. It lives in a single file — `.pi/teams/teams.md` — and is the **sole discovery mechanism** for agents. There is no folder scanning. Agents don't work independently in pi-teams; they always exist within the team structure.

pi-teams reads this file, walks the tree, and loads each referenced agent from the agents directory. Discovery happens per level — the tree structure defines what agents exist and what role each plays.

Agent definitions are `.md` files with YAML frontmatter (the format defined by pi-agents). pi-teams uses pi-agents as a **library** — importing `parseAgentFile` and `validateAgent` to load and validate each referenced agent. The pi-agents extension is NOT installed.

## File Location

```
.pi/teams/teams.md
```

## Structure

The team definition has three parts:

1. **Paths** — where to find agent definition files
2. **Orchestrator** — the top-level coordinator (the agent the user talks to)
3. **Members** — a recursive list of agents and/or sub-teams

### Schema

```yaml
# Where agent .md files live.
# Each agent reference is resolved as: {paths.agents}/{agent-name}.md
paths:
  agents: .pi/agents/

# The orchestrator is the user's single point of contact.
# It receives user messages, delegates to members, and synthesizes responses.
orchestrator:
  agent: <agent-name>

# Members can be agents (leaf nodes) or teams (branches).
# This list is recursive — teams can contain teams.
members:
  # A flat agent — orchestrator delegates directly to it
  - agent: <agent-name>

  # A team — a named group with optional lead and its own members
  - team: <team-display-name>
    color: "<hex>"           # Optional, for TUI display
    lead: <agent-name>       # Optional coordinator for this team
    consult-when: "<text>"   # Hint for when to route to this team
    members:
      - agent: <agent-name>
      - agent: <agent-name>

      # Deeper nesting — a sub-team within a team
      - team: <sub-team-name>
        lead: <agent-name>
        consult-when: "<text>"
        members:
          - agent: <agent-name>
```

### Rules

- **`agent`** — resolves to `{paths.agents}/{name}.md`. The file must exist and its frontmatter `name` must match.
- **`team`** — a display name for grouping. Not an agent — just a label.
- **`lead`** — **required** on every team. The lead is the coordinator — the parent delegates to the lead, and the lead delegates to the team's members. The Orchestrator is the implicit lead of the top level. If you don't need a coordinator, use flat agents instead of a `team` wrapper.
- **`consult-when`** — optional text injected into the parent's prompt as a routing hint. Helps the LLM decide when to delegate here.
- **`members`** — recursive. Each item is either `{ agent: name }` or `{ team: name, members: [...] }`.
- Nesting depth is unbounded in the schema but practically limited by context window size.

### Hierarchy Rules

- The **Orchestrator** is the top-level lead — it coordinates everything below it
- Every **team** must have a **lead** — no optional coordinators
- **Flat agents** under any coordinator don't need a team wrapper
- The tree defines the role — if an agent sits at a leaf, it's a worker in that context

pi-teams walks the tree top-down and loads each referenced agent.

## Examples

### Flat — agents directly under orchestrator

No teams, no leads. Orchestrator delegates directly to individual agents.

```yaml
paths:
  agents: .pi/agents/

orchestrator:
  agent: orchestrator

members:
  - agent: architect
  - agent: builder
  - agent: code-reviewer
  - agent: investigator
```

The orchestrator sees all four agents and picks the right one based on its prompt + the user's request.

### Nested — the video's structure (team of teams)

Three teams, each with a lead and specialist workers.

```yaml
paths:
  agents: .pi/agents/

orchestrator:
  agent: orchestrator

members:
  - team: Planning
    color: "#fede5d"
    lead: planning-lead
    consult-when: Requirements, scope, prioritization, user stories
    members:
      - agent: product-manager
      - agent: ux-researcher

  - team: Engineering
    color: "#ff6e96"
    lead: engineering-lead
    consult-when: Architecture, implementation, APIs, code
    members:
      - agent: frontend-dev
      - agent: backend-dev

  - team: Validation
    color: "#ff9e64"
    lead: validation-lead
    consult-when: Testing, security, quality, regressions
    members:
      - agent: qa-engineer
      - agent: security-reviewer
```

Delegation flow: User → Orchestrator → Lead → Workers → Lead → Orchestrator → User.

### Mixed — some flat agents, some teams

```yaml
paths:
  agents: .pi/agents/

orchestrator:
  agent: orchestrator

members:
  - agent: architect

  - team: Engineering
    lead: engineering-lead
    consult-when: Implementation, code changes, refactoring
    members:
      - agent: frontend-dev
      - agent: backend-dev

  - agent: code-reviewer
```

The orchestrator can delegate to `architect` or `code-reviewer` directly, or to the Engineering team via its lead.

### Deep nesting — sub-teams within teams

```yaml
paths:
  agents: .pi/agents/

orchestrator:
  agent: orchestrator

members:
  - team: Engineering
    lead: engineering-lead
    consult-when: All implementation work
    members:
      - team: Frontend
        lead: frontend-lead
        consult-when: UI, components, styling, client state
        members:
          - agent: react-dev
          - agent: css-specialist

      - team: Backend
        lead: backend-lead
        consult-when: APIs, databases, infrastructure
        members:
          - agent: api-dev
          - agent: db-engineer

      - agent: devops
```

Delegation: Orchestrator → Engineering Lead → Frontend Lead → React Dev (3 levels deep).

## What Gets Injected Into Prompts

The team structure is injected as template variables into agent prompts:

- **Orchestrator** gets `{{TEAMS_BLOCK}}` — the full member tree with names and `consult-when` hints
- **Leads** get `{{TEAM_MEMBERS_BLOCK}}` — their team's members with `consult-when` hints
- **Workers** get nothing extra — they execute, they don't delegate

These variables are resolved by pi-agents' `resolveVariables` (used as a library function).

## Startup Validation

All validation happens at startup, before any agent runs. No runtime surprises.

### Phase 1: Validate team definition

1. Read `.pi/teams/teams.md`
2. Parse YAML frontmatter
3. Validate structure: `paths.agents` exists, `orchestrator.agent` is set, `members` is a non-empty list
4. Walk the tree — every node must be `{ agent: name }` or `{ team: name, members: [...] }`
5. Check for duplicate agent references (same name appearing twice)
6. Check for circular references in nested teams

### Phase 2: Validate every referenced agent

For each agent name found in the tree:

1. Resolve path: `{paths.agents}/{name}.md`
2. File must exist — if not, error: `Agent "builder" not found at .pi/agents/builder.md`
3. Parse with `parseAgentFile` from pi-agents — if malformed, error with details
4. Validate with `validateAgent` from pi-agents — if invalid frontmatter, error with details
5. Confirm the frontmatter `name` matches the referenced name

### Phase 3: Build runtime team graph

If all validation passes, build the in-memory tree that the `delegate` tool uses at runtime.

### Fail fast

Any error in Phase 1 or Phase 2 stops startup with a clear message. The user sees exactly what's wrong and where.
