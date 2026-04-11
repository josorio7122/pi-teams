# pi-teams Refactor & Cleanup Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 200-line violations, remaining FP violations, RenderTheme re-export issue, minor code smells, and extract shared e2e test helpers.

**Architecture:** Each task is a self-contained refactor. File splits come first (to fix 200-line violations), then FP fixes, then minor cleanups. Test helpers extracted last since they only affect test files.

**Tech Stack:** TypeScript (ESM-only), Vitest, Biome

**Repo:** `/Users/josorio/Code/pi-teams`

**Dependency:** Task 5 requires pi-agents to have completed its refactor plan Task 6 (removing `SPINNER_FRAMES` from public API). All other tasks are independent of pi-agents changes.

---

## File Structure

### File splits (Tasks 1-2)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/delegate/render-events.ts` | **Create** | Extracted partial/final event builders from create-delegate-tool.ts |
| `src/delegate/render-events.test.ts` | **Create** | Tests for extracted functions |
| `src/delegate/create-delegate-tool.ts` | **Modify** | Import from render-events.ts |
| `src/helpers/extract-text.ts` | **Create** | `extractLastAssistantText` function from index.ts agent_end handler |
| `src/helpers/extract-text.test.ts` | **Create** | Tests for extracted function |
| `src/index.ts` | **Modify** | Import and call extractLastAssistantText |

### FP fix + minor cleanups (Tasks 3-4)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/tui/render.ts` | **Modify** | FP fix `computeMaxNameLen`, use `padEnd`, remove RenderTheme re-export |
| `src/tui/conversation.ts` | **Modify** | Import RenderTheme directly from pi-agents |

### Test DRY (Task 5)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/e2e/helpers.ts` | **Create** | Shared `agentMd()` and `fileExists()` |
| `src/e2e/delegation-chain.test.ts` | **Modify** | Import from helpers |
| `src/e2e/nested-delegation.test.ts` | **Modify** | Import from helpers |
| `src/e2e/parallel-delegation.test.ts` | **Modify** | Import from helpers |

---

## Task 1: Split create-delegate-tool.ts — extract render event helpers

**Files:**
- Create: `src/delegate/render-events.ts`
- Create: `src/delegate/render-events.test.ts`
- Modify: `src/delegate/create-delegate-tool.ts`

`create-delegate-tool.ts` is 208 lines. The `renderResult` method contains two pure functions that build event lists for partial and final renders. Extract them.

- [ ] **Step 1: Write the failing test**

Create `src/delegate/render-events.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { ConversationEvent } from "../tui/state.js";
import { buildFinalEvents, buildPartialEvents } from "./render-events.js";

describe("buildPartialEvents", () => {
  it("adds pending boxes for delegations without responses", () => {
    const events: ReadonlyArray<ConversationEvent> = [
      { type: "delegation", from: "lead", to: "worker", task: "do stuff" },
    ];
    const getStatus = () => ({ status: "running" as const });
    const result = buildPartialEvents({ events, getStatus });
    expect(result).toHaveLength(2);
    expect(result[1]?.type).toBe("response");
  });

  it("skips delegations that already have responses", () => {
    const events: ReadonlyArray<ConversationEvent> = [
      { type: "delegation", from: "lead", to: "worker", task: "do stuff" },
      { type: "response", agent: "worker", output: "done" },
    ];
    const getStatus = () => ({ status: "done" as const, metrics: { turns: 1, inputTokens: 0, outputTokens: 0, cost: 0, toolCalls: [] } });
    const result = buildPartialEvents({ events, getStatus });
    expect(result).toHaveLength(2);
    expect(result.filter((e) => e.type === "response")).toHaveLength(1);
  });
});

describe("buildFinalEvents", () => {
  it("drops orphaned delegations with no response", () => {
    const events: ReadonlyArray<ConversationEvent> = [
      { type: "delegation", from: "lead", to: "worker", task: "do stuff" },
    ];
    const result = buildFinalEvents(events);
    expect(result).toHaveLength(0);
  });

  it("drops empty responses", () => {
    const events: ReadonlyArray<ConversationEvent> = [
      { type: "delegation", from: "lead", to: "worker", task: "do stuff" },
      { type: "response", agent: "worker", output: "" },
    ];
    const result = buildFinalEvents(events);
    expect(result).toHaveLength(0);
  });

  it("keeps matched delegation-response pairs", () => {
    const events: ReadonlyArray<ConversationEvent> = [
      { type: "delegation", from: "lead", to: "worker", task: "do stuff" },
      { type: "response", agent: "worker", output: "done" },
    ];
    const result = buildFinalEvents(events);
    expect(result).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/josorio/Code/pi-teams && npx vitest run src/delegate/render-events.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/delegate/render-events.ts`:

```typescript
import type { AgentStatus, ConversationEvent } from "../tui/state.js";

export function buildPartialEvents(params: {
  readonly events: ReadonlyArray<ConversationEvent>;
  readonly getStatus: (name: string) => AgentStatus;
}): ReadonlyArray<ConversationEvent> {
  const { events, getStatus } = params;
  const responded = new Set(
    events
      .filter((e): e is ConversationEvent & { type: "response" } => e.type === "response")
      .map((e) => e.agent),
  );
  const pending = events.filter(
    (e): e is ConversationEvent & { type: "delegation" } => e.type === "delegation" && !responded.has(e.to),
  );
  const pendingBoxes: ReadonlyArray<ConversationEvent> = pending.map((e) => {
    const status = getStatus(e.to);
    const hasActivity = status.status === "running" && status.metrics && status.metrics.turns > 0;
    const phase = hasActivity ? "working" : "initializing";
    const dots = ".".repeat((Math.floor(Date.now() / 500) % 3) + 1);
    return { type: "response" as const, agent: e.to, output: `${phase}${dots}` };
  });
  return [...events, ...pendingBoxes];
}

export function buildFinalEvents(events: ReadonlyArray<ConversationEvent>): ReadonlyArray<ConversationEvent> {
  const responses = events.filter(
    (e): e is ConversationEvent & { type: "response" } => e.type === "response" && e.output.length > 0,
  );
  const responded = new Set(responses.map((e) => e.agent));
  return events.filter((e) => {
    if (e.type === "delegation") return responded.has(e.to);
    if (e.type === "response") return e.output.length > 0;
    return true;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/josorio/Code/pi-teams && npx vitest run src/delegate/render-events.test.ts`
Expected: PASS

- [ ] **Step 5: Update create-delegate-tool.ts to import helpers**

In `src/delegate/create-delegate-tool.ts`, add import at the top:

```typescript
import { buildFinalEvents, buildPartialEvents } from "./render-events.js";
```

Then replace the `renderResult` method body (lines 95-132). The new body should be:

```typescript
    // biome-ignore lint/complexity/useMaxParams: implements Pi's ToolDefinition.renderResult (4 positional params)
    renderResult(result, options, theme) {
      const all = (result.details as { events?: ReadonlyArray<ConversationEvent> })?.events ?? [];
      const tail = all.slice(1);

      const events = options.isPartial
        ? buildPartialEvents({ events: tail, getStatus: (name) => footerState.get(name) })
        : buildFinalEvents(tail);

      return renderConversation({ events, agents: params.agents, theme });
    },
```

- [ ] **Step 6: Verify file is under 200 lines**

Run: `wc -l /Users/josorio/Code/pi-teams/src/delegate/create-delegate-tool.ts`
Expected: Under 200 lines.

- [ ] **Step 7: Run all checks**

Run: `cd /Users/josorio/Code/pi-teams && npm run check`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/josorio/Code/pi-teams
git add src/delegate/render-events.ts src/delegate/render-events.test.ts src/delegate/create-delegate-tool.ts
git commit -m "refactor: extract render event helpers from create-delegate-tool (200-line limit)"
```

---

## Task 2: Split index.ts — extract assistant text extraction

**Files:**
- Create: `src/helpers/extract-text.ts`
- Create: `src/helpers/extract-text.test.ts`
- Modify: `src/index.ts`

`index.ts` is 207 lines. The `agent_end` handler contains a reverse loop with a bare block that extracts the last assistant text. Extract it to a pure function.

- [ ] **Step 1: Write the failing test**

Create `src/helpers/extract-text.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { extractLastAssistantText } from "./extract-text.js";

describe("extractLastAssistantText", () => {
  it("returns text from last assistant message", () => {
    const messages = [
      { role: "user", content: [{ type: "text", text: "hello" }] },
      { role: "assistant", content: [{ type: "text", text: "response" }] },
    ];
    expect(extractLastAssistantText(messages)).toBe("response");
  });

  it("returns empty string when no assistant messages", () => {
    const messages = [{ role: "user", content: [{ type: "text", text: "hello" }] }];
    expect(extractLastAssistantText(messages)).toBe("");
  });

  it("skips assistant messages with empty text", () => {
    const messages = [
      { role: "assistant", content: [{ type: "text", text: "first" }] },
      { role: "assistant", content: [{ type: "text", text: "  " }] },
    ];
    expect(extractLastAssistantText(messages)).toBe("first");
  });

  it("joins multiple text parts", () => {
    const messages = [
      { role: "assistant", content: [{ type: "text", text: "part1" }, { type: "text", text: "part2" }] },
    ];
    expect(extractLastAssistantText(messages)).toBe("part1part2");
  });

  it("ignores non-text content parts", () => {
    const messages = [
      { role: "assistant", content: [{ type: "tool_use", text: "ignored" }, { type: "text", text: "kept" }] },
    ];
    expect(extractLastAssistantText(messages)).toBe("kept");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/josorio/Code/pi-teams && npx vitest run src/helpers/extract-text.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/helpers/extract-text.ts`:

```typescript
export function extractLastAssistantText(messages: ReadonlyArray<Record<string, unknown>>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg || !("role" in msg) || msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
    const text = (msg.content as ReadonlyArray<Record<string, unknown>>)
      .filter((p) => "type" in p && p.type === "text" && "text" in p)
      .map((p) => String(p.text))
      .join("");
    if (text.trim()) return text;
  }
  return "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/josorio/Code/pi-teams && npx vitest run src/helpers/extract-text.test.ts`
Expected: PASS

- [ ] **Step 5: Update index.ts to use extracted function**

In `src/index.ts`, add import at top:

```typescript
import { extractLastAssistantText } from "./helpers/extract-text.js";
```

Replace the entire `agent_end` handler body (lines 183-206):

```typescript
  pi.on("agent_end", async (event) => {
    if (!sessionRef.conversationLogPath || !teamGraph) return;

    const text = extractLastAssistantText(event.messages as ReadonlyArray<Record<string, unknown>>);
    if (text.trim()) {
      await appendToLog(sessionRef.conversationLogPath, {
        ts: new Date().toISOString(),
        from: teamGraph.orchestrator.config.frontmatter.name,
        to: "user",
        message: text,
      });
    }
  });
```

- [ ] **Step 6: Verify file is under 200 lines**

Run: `wc -l /Users/josorio/Code/pi-teams/src/index.ts`
Expected: Under 200 lines.

- [ ] **Step 7: Run all checks**

Run: `cd /Users/josorio/Code/pi-teams && npm run check`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/josorio/Code/pi-teams
git add src/helpers/extract-text.ts src/helpers/extract-text.test.ts src/index.ts
git commit -m "refactor: extract assistant text extraction from index.ts (200-line limit)"
```

---

## Task 3: FP fix computeMaxNameLen + padEnd + RenderTheme re-export

**Files:**
- Modify: `src/tui/render.ts`
- Modify: `src/tui/conversation.ts`

Three small fixes in one task: (1) replace imperative `computeMaxNameLen` with pure recursion, (2) use `padEnd` instead of manual repeat, (3) remove re-export of RenderTheme — have conversation.ts import directly from pi-agents.

- [ ] **Step 1: Run existing tests as baseline**

Run: `cd /Users/josorio/Code/pi-teams && npx vitest run src/tui/render.test.ts`
Expected: PASS

- [ ] **Step 2: Fix computeMaxNameLen in render.ts**

In `src/tui/render.ts`, replace the `computeMaxNameLen` function (lines 40-56):

```typescript
function computeMaxNameLen(params: { readonly graph: TeamGraph }) {
  let max = params.graph.orchestrator.config.frontmatter.name.length;

  function walk(members: ReadonlyArray<GraphNode>) {
    for (const node of members) {
      if (node.type === "agent") {
        max = Math.max(max, node.config.frontmatter.name.length);
      } else {
        max = Math.max(max, node.lead.config.frontmatter.name.length);
        walk(node.members);
      }
    }
  }

  walk(params.graph.members);
  return max;
}
```

With:

```typescript
function collectNameLengths(members: ReadonlyArray<GraphNode>): ReadonlyArray<number> {
  return members.flatMap((node) =>
    node.type === "agent"
      ? [node.config.frontmatter.name.length]
      : [node.lead.config.frontmatter.name.length, ...collectNameLengths(node.members)],
  );
}

function computeMaxNameLen(params: { readonly graph: TeamGraph }) {
  return Math.max(
    params.graph.orchestrator.config.frontmatter.name.length,
    ...collectNameLengths(params.graph.members),
  );
}
```

- [ ] **Step 3: Use padEnd instead of manual repeat**

In `src/tui/render.ts`, replace line 33:

```typescript
  const padded = fm.name.length < nameWidth ? fm.name + " ".repeat(nameWidth - fm.name.length) : fm.name;
```

With:

```typescript
  const padded = fm.name.padEnd(nameWidth);
```

- [ ] **Step 4: Remove RenderTheme re-export**

In `src/tui/render.ts`, remove line 7:

```typescript
export type { RenderTheme } from "pi-agents";
```

And add a local import (if not already present — check if RenderTheme is used in this file's function signatures):

```typescript
import type { RenderTheme } from "pi-agents";
```

- [ ] **Step 5: Update conversation.ts to import RenderTheme from pi-agents**

In `src/tui/conversation.ts`, change line 6:

```typescript
import type { RenderTheme } from "./render.js";
```

To:

```typescript
import type { RenderTheme } from "pi-agents";
```

- [ ] **Step 6: Check for any other files importing RenderTheme from render.ts**

Search: `grep -r "from.*render.js" --include="*.ts" | grep RenderTheme`

If any other files import `RenderTheme` from `"./render.js"` or `"../tui/render.js"`, update them to import from `"pi-agents"` instead.

- [ ] **Step 7: Run all checks**

Run: `cd /Users/josorio/Code/pi-teams && npm run check`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/josorio/Code/pi-teams
git add src/tui/render.ts src/tui/conversation.ts
git commit -m "refactor: FP fix computeMaxNameLen, use padEnd, fix RenderTheme import chain"
```

---

## Task 4: Remove bare block in index.ts agent_end handler

**Files:**
- Modify: `src/index.ts`

**Note:** This task is only needed if Task 2 didn't already eliminate the bare block. After Task 2, the `agent_end` handler uses `extractLastAssistantText` and the bare block is gone. **Skip this task if Task 2 was completed.**

---

## Task 5: Extract shared e2e test helpers

**Files:**
- Create: `src/e2e/helpers.ts`
- Modify: `src/e2e/delegation-chain.test.ts`
- Modify: `src/e2e/nested-delegation.test.ts`
- Modify: `src/e2e/parallel-delegation.test.ts`

All three e2e tests duplicate identical `agentMd()` (35 lines) and `fileExists()` (8 lines) helpers. Extract to a shared module.

- [ ] **Step 1: Create shared helpers file**

Create `src/e2e/helpers.ts`:

```typescript
import { access } from "node:fs/promises";

export function agentMd(p: {
  readonly name: string;
  readonly role: string;
  readonly tools: string;
  readonly body: string;
}) {
  return `---
name: ${p.name}
description: ${p.name} agent
model: anthropic/claude-haiku-4-5
role: ${p.role}
color: "#ffffff"
icon: "\u{1F916}"
domain:
  - path: .
    read: true
    write: false
    delete: false
tools:
  ${p.tools}
skills:
  - path: .pi/skills/e2e.md
    when: Always
knowledge:
  project:
    path: .pi/knowledge/project/${p.name}.yaml
    description: Project knowledge
    updatable: false
    max-lines: 100
  general:
    path: .pi/knowledge/general/${p.name}.yaml
    description: General knowledge
    updatable: false
    max-lines: 100
conversation:
  path: .pi/sessions/{{SESSION_ID}}/conversation.jsonl
---
${p.body}
`;
}

export async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Update delegation-chain.test.ts**

In `src/e2e/delegation-chain.test.ts`:
1. Add import at top: `import { agentMd, fileExists } from "./helpers.js";`
2. Delete the local `agentMd` function (lines 17-51)
3. Delete the local `fileExists` function (lines 118-125, line numbers will shift after first deletion)

- [ ] **Step 3: Update nested-delegation.test.ts**

In `src/e2e/nested-delegation.test.ts`:
1. Add import at top: `import { agentMd, fileExists } from "./helpers.js";`
2. Delete the local `agentMd` function (lines 17-51)
3. Delete the local `fileExists` function (lines 139-146, line numbers will shift)

- [ ] **Step 4: Update parallel-delegation.test.ts**

In `src/e2e/parallel-delegation.test.ts`:
1. Add import at top: `import { agentMd, fileExists } from "./helpers.js";`
2. Delete the local `agentMd` function (lines 17-51)
3. Delete the local `fileExists` function (lines 146-153, line numbers will shift)

- [ ] **Step 5: Run all checks**

Run: `cd /Users/josorio/Code/pi-teams && npm run check`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/josorio/Code/pi-teams
git add src/e2e/helpers.ts src/e2e/delegation-chain.test.ts src/e2e/nested-delegation.test.ts src/e2e/parallel-delegation.test.ts
git commit -m "refactor: extract shared agentMd and fileExists e2e helpers"
```

---

## Summary

| Task | Type | Impact |
|------|------|--------|
| 1 | Split create-delegate-tool.ts | Gets under 200-line limit |
| 2 | Split index.ts | Gets under 200-line limit, removes bare block |
| 3 | FP + cleanup | Pure `computeMaxNameLen`, `padEnd`, direct RenderTheme import |
| 4 | Skip | Handled by Task 2 |
| 5 | Test DRY | Eliminates ~86 lines of duplication across 3 e2e tests |
