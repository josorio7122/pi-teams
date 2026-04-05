# pi-teams

A pi extension for multi-team agentic orchestration — route tasks from an orchestrator to team leads to workers via a structured delegation hierarchy.

## What it does

- Reads `.pi/teams/teams.md` to define the orchestrator, team leads, and worker agents
- Builds a delegation graph and injects a `delegate` tool into each agent that has reports
- Team leads receive their own nested `delegate` tools automatically — no extra config
- All agents share a conversation log (`conversation.jsonl`) and any discovered shared context (`AGENTS.md`, `CLAUDE.md`)

## Installation

```bash
pi install git:github.com/josorio7122/pi-teams
```

## Quick start

Create `.pi/teams/teams.md`:

```yaml
---
paths:
  agents: .pi/agents/

orchestrator:
  agent: orchestrator

members:
  - agent: builder
  - agent: reviewer
---
```

Each agent name resolves to `{paths.agents}/{name}.md`. Run pi normally — the orchestrator receives a `delegate` tool and routes work by agent name.

For teams with leads:

```yaml
---
# ... paths and orchestrator as above
members:
  - lead: eng-lead
    consult-when: Architecture, implementation, code
    members:
      - agent: frontend-dev
      - agent: backend-dev
---
```

## How it works

1. **`session_start`** — parses and validates `teams.md`, resolves agent `.md` files from disk, and builds the delegation graph
2. **`before_agent_start`** — injects a prompt block listing available reports and a `delegate` tool into the agent's context
3. **`delegate` tool** — the orchestrator calls it by agent name; team leads get their own scoped version that only reaches their direct reports

## Requirements

- [pi](https://github.com/badlogic/lemmy) installed and on your `PATH`
- Agent `.md` files conforming to the [pi-agents](https://github.com/josorio7122/pi-agents) schema

## Docs

- [docs/team-definition.md](docs/team-definition.md) — full `teams.md` schema reference
- [docs/understanding.md](docs/understanding.md) — conceptual background and design decisions
