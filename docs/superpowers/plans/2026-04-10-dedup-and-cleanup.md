# Deduplication, Migration & Code Cleanup Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicated code between pi-teams and pi-agents, migrate pi-teams code that belongs in pi-agents, and fix functional-programming violations flagged by AGENTS.md rules.

**Architecture:** pi-agents is the library; pi-teams is a consumer. All generic agent utilities (formatting, metrics aggregation, spinner, theme types) must live in pi-agents and be exported via `api.ts`. pi-teams imports them — never redefines them. FP fixes convert imperative mutation patterns (mutable arrays, `let` counters) to `map`/`flatMap`/`reduce` without changing behavior.

**Tech Stack:** TypeScript (ESM-only), Vitest, Biome, Zod

**Repos:**
- `pi-agents` → `/Users/josorio/Code/pi-agents`
- `pi-teams` → `/Users/josorio/Code/pi-teams`

**Ordering:** Tasks 1-5 change pi-agents (the library). Tasks 6-9 change pi-teams (the consumer). Task 10 reinstalls the dependency. Task 11 is final verification.

---

## File Structure

### pi-agents changes (library — Tasks 1-5)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/tool/format.ts` | Keep | Already has `formatTokens`, `formatUsageStats`, `formatToolCall` |
| `src/tool/format.test.ts` | Keep | Already tested |
| `src/common/spinner.ts` | **Create** | Shared Braille spinner frames + `spinnerFrame()` utility |
| `src/common/spinner.test.ts` | **Create** | Tests for spinner |
| `src/tool/render.ts` | **Modify** | Import spinner from `common/spinner.ts` instead of inline constant |
| `src/tool/modes.ts` | **Modify** | Add `aggregateMetricsArray()` overload that takes `AgentMetrics[]` |
| `src/tool/modes.test.ts` | **Modify** | Add test for new overload |
| `src/prompt/variables.ts` | **Modify** | FP fix: replace `let result` loop with `reduce` |
| `src/api.ts` | **Modify** | Export new public surface: `formatTokens`, `formatUsageStats`, `RenderTheme`, `spinnerFrame`, `SPINNER_FRAMES`, `aggregateMetricsArray` |

### pi-teams changes (consumer — Tasks 6-9)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/tui/format.ts` | **Delete** | Replaced by imports from pi-agents |
| `src/tui/format.test.ts` | **Delete** | Tests already exist in pi-agents |
| `src/tui/render.ts` | **Modify** | Import `formatUsageStats`, `spinnerFrame`, `SPINNER_FRAMES`, `aggregateMetricsArray`, `RenderTheme` from pi-agents; remove local duplicates |
| `src/tui/render.test.ts` | **Modify** | Update imports (remove `format.js` import) |
| `src/config/validator.ts` | **Modify** | FP fix: replace mutable array + loop with flatMap |
| `src/graph/resolver.ts` | **Modify** | FP fix: replace mutable Map + loop with Promise.all + partition |
| `src/tui/conversation.ts` | Keep | No changes needed |
| `src/tui/state.ts` | Keep | Mutable internals are acceptable (factory pattern with immutable interface) |

---

## Task 1: Export formatting utilities from pi-agents

**Repo:** pi-agents
**Files:**
- Modify: `src/api.ts`

This task adds `formatTokens` and `formatUsageStats` to pi-agents' public API. The functions already exist and are tested in `src/tool/format.ts` — we only need to re-export them.

- [ ] **Step 1: Add exports to api.ts**

Add these lines to `src/api.ts` in the existing exports section, after the Schema section:

```typescript
// Formatting
export { formatTokens, formatUsageStats } from "./tool/format.js";
```

- [ ] **Step 2: Run checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass — no behavior change, just new exports.

- [ ] **Step 3: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/api.ts
git commit -m "feat: export formatTokens and formatUsageStats from public API"
```

---

## Task 2: Extract spinner utility into pi-agents common/

**Repo:** pi-agents
**Files:**
- Create: `src/common/spinner.ts`
- Create: `src/common/spinner.test.ts`
- Modify: `src/tool/render.ts`
- Modify: `src/api.ts`

The Braille spinner array and frame-selection function are duplicated in both repos. Extract to a shared module.

- [ ] **Step 1: Write the failing test**

Create `src/common/spinner.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { SPINNER_FRAMES, spinnerFrame } from "./spinner.js";

describe("SPINNER_FRAMES", () => {
  it("contains 10 braille frames", () => {
    expect(SPINNER_FRAMES).toHaveLength(10);
    expect(SPINNER_FRAMES[0]).toBe("\u280B");
  });
});

describe("spinnerFrame", () => {
  it("returns a frame from the array based on time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const frame = spinnerFrame();
    expect(SPINNER_FRAMES).toContain(frame);
    vi.useRealTimers();
  });

  it("cycles through frames at 80ms intervals", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const first = spinnerFrame();
    vi.setSystemTime(80);
    const second = spinnerFrame();
    expect(first).not.toBe(second);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/josorio/Code/pi-agents && npx vitest run src/common/spinner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/common/spinner.ts`:

```typescript
export const SPINNER_FRAMES: ReadonlyArray<string> = [
  "\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F",
];

export function spinnerFrame() {
  return SPINNER_FRAMES[Math.floor(Date.now() / 80) % SPINNER_FRAMES.length] ?? "\u280B";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/josorio/Code/pi-agents && npx vitest run src/common/spinner.test.ts`
Expected: PASS

- [ ] **Step 5: Update render.ts to use shared spinner**

In `src/tool/render.ts`, replace the inline spinner constant and function:

Replace:
```typescript
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function statusIndicator(status: AgentResultEntry["status"], theme: RenderTheme) {
  if (status === "done") return theme.fg("success", "✓");
  if (status === "error") return theme.fg("error", "✗");
  const frame = SPINNER_FRAMES[Math.floor(Date.now() / 80) % SPINNER_FRAMES.length] ?? "⠋";
  return theme.fg("accent", frame);
}
```

With:
```typescript
import { spinnerFrame } from "../common/spinner.js";

function statusIndicator(status: AgentResultEntry["status"], theme: RenderTheme) {
  if (status === "done") return theme.fg("success", "✓");
  if (status === "error") return theme.fg("error", "✗");
  return theme.fg("accent", spinnerFrame());
}
```

Note: add the import at the top of the file with the other imports.

- [ ] **Step 6: Export from api.ts**

Add to `src/api.ts`:

```typescript
// Common — spinner
export { SPINNER_FRAMES, spinnerFrame } from "./common/spinner.js";
```

- [ ] **Step 7: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/common/spinner.ts src/common/spinner.test.ts src/tool/render.ts src/api.ts
git commit -m "refactor: extract spinner utility to common/spinner"
```

---

## Task 3: Export RenderTheme type from pi-agents

**Repo:** pi-agents
**Files:**
- Modify: `src/api.ts`

The `RenderTheme` type is defined identically in both repos. pi-agents already has it in `src/tool/render.ts` — just export it.

- [ ] **Step 1: Add type export to api.ts**

Add to `src/api.ts`:

```typescript
// Rendering
export type { RenderTheme } from "./tool/render.js";
```

- [ ] **Step 2: Run checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/api.ts
git commit -m "feat: export RenderTheme type from public API"
```

---

## Task 4: Add aggregateMetricsArray overload to pi-agents

**Repo:** pi-agents
**Files:**
- Modify: `src/tool/modes.ts`
- Modify: `src/tool/modes.test.ts`
- Modify: `src/api.ts`

pi-teams has `aggregateMetrics(metrics: AgentMetrics[])` and pi-agents has `aggregateMetrics(results: RunAgentResult[])`. We add a new function that takes `AgentMetrics[]` directly so pi-teams can use it.

- [ ] **Step 1: Write the failing test**

Add to `src/tool/modes.test.ts` inside the existing `describe` block (or add a new one):

```typescript
describe("aggregateMetricsArray", () => {
  it("sums metrics from a flat array", () => {
    const metrics: ReadonlyArray<AgentMetrics> = [
      { turns: 2, inputTokens: 100, outputTokens: 50, cost: 0.01, toolCalls: [{ name: "read", args: {} }] },
      { turns: 3, inputTokens: 200, outputTokens: 100, cost: 0.02, toolCalls: [{ name: "write", args: {} }] },
    ];
    const result = aggregateMetricsArray(metrics);
    expect(result.turns).toBe(5);
    expect(result.inputTokens).toBe(300);
    expect(result.outputTokens).toBe(150);
    expect(result.cost).toBeCloseTo(0.03);
    expect(result.toolCalls).toHaveLength(2);
  });

  it("returns zeroed metrics for empty array", () => {
    const result = aggregateMetricsArray([]);
    expect(result.turns).toBe(0);
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.cost).toBe(0);
    expect(result.toolCalls).toHaveLength(0);
  });
});
```

Add the import at the top: `import { aggregateMetricsArray } from "./modes.js";` (alongside existing imports).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/josorio/Code/pi-agents && npx vitest run src/tool/modes.test.ts`
Expected: FAIL — `aggregateMetricsArray` is not exported.

- [ ] **Step 3: Implement aggregateMetricsArray**

Add to `src/tool/modes.ts` after the existing `aggregateMetrics` function:

```typescript
export function aggregateMetricsArray(metrics: ReadonlyArray<AgentMetrics>): AgentMetrics {
  return metrics.reduce<AgentMetrics>(
    (acc, m) => ({
      turns: acc.turns + m.turns,
      inputTokens: acc.inputTokens + m.inputTokens,
      outputTokens: acc.outputTokens + m.outputTokens,
      cost: acc.cost + m.cost,
      toolCalls: [...acc.toolCalls, ...m.toolCalls],
    }),
    { turns: 0, inputTokens: 0, outputTokens: 0, cost: 0, toolCalls: [] },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/josorio/Code/pi-agents && npx vitest run src/tool/modes.test.ts`
Expected: PASS

- [ ] **Step 5: Export from api.ts**

Add to `src/api.ts` alongside the existing modes exports:

Change the existing line:
```typescript
export { collectAgentNames, detectMode, executeChain, executeParallel, executeSingle } from "./tool/modes.js";
```
To:
```typescript
export {
  aggregateMetricsArray,
  collectAgentNames,
  detectMode,
  executeChain,
  executeParallel,
  executeSingle,
} from "./tool/modes.js";
```

- [ ] **Step 6: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/tool/modes.ts src/tool/modes.test.ts src/api.ts
git commit -m "feat: add aggregateMetricsArray for direct AgentMetrics[] aggregation"
```

---

## Task 5: FP fix — resolveVariables in pi-agents

**Repo:** pi-agents
**Files:**
- Modify: `src/prompt/variables.ts`

Replace `let result` reassignment loop with `reduce`.

- [ ] **Step 1: Run existing tests to establish baseline**

Run: `cd /Users/josorio/Code/pi-agents && npx vitest run src/prompt/variables.test.ts`
Expected: PASS — confirms current behavior.

- [ ] **Step 2: Refactor to functional style**

Replace the entire content of `src/prompt/variables.ts`:

Current:
```typescript
export function resolveVariables(template: string, variables: Readonly<Record<string, string>>) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}
```

New:
```typescript
export function resolveVariables(template: string, variables: Readonly<Record<string, string>>) {
  return Object.entries(variables).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template,
  );
}
```

- [ ] **Step 3: Run tests to verify behavior unchanged**

Run: `cd /Users/josorio/Code/pi-agents && npx vitest run src/prompt/variables.test.ts`
Expected: PASS — same behavior, functional style.

- [ ] **Step 4: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/prompt/variables.ts
git commit -m "refactor: use reduce in resolveVariables instead of let reassignment"
```

---

## Task 6: Delete pi-teams format.ts and import from pi-agents

**Repo:** pi-teams
**Files:**
- Delete: `src/tui/format.ts`
- Delete: `src/tui/format.test.ts`
- Modify: `src/tui/render.ts`

`formatTokens` and `formatStats`/`formatUsageStats` are now exported from pi-agents. Remove the local copies and update imports.

- [ ] **Step 1: Update render.ts imports**

In `src/tui/render.ts`, replace:
```typescript
import { formatStats } from "./format.js";
```
With:
```typescript
import { formatUsageStats } from "pi-agents";
```

Then replace all occurrences of `formatStats(` with `formatUsageStats(` in the same file. There are 3 call sites:
1. Line 28: `formatStats(status.metrics)` → `formatUsageStats(status.metrics)`
2. Line 30: `formatStats(status.metrics)` → `formatUsageStats(status.metrics)`
3. Line 131: `formatStats(aggregateMetrics(allMetrics))` → `formatUsageStats(...)` (will be updated further in Task 7)

- [ ] **Step 2: Delete format.ts and format.test.ts**

```bash
cd /Users/josorio/Code/pi-teams
rm src/tui/format.ts src/tui/format.test.ts
```

- [ ] **Step 3: Run checks**

Run: `cd /Users/josorio/Code/pi-teams && npm run check`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/josorio/Code/pi-teams
git add -A src/tui/format.ts src/tui/format.test.ts src/tui/render.ts
git commit -m "refactor: import formatUsageStats from pi-agents, delete local format.ts"
```

---

## Task 7: Replace local aggregateMetrics and spinner in pi-teams render.ts

**Repo:** pi-teams
**Files:**
- Modify: `src/tui/render.ts`
- Modify: `src/tui/render.test.ts` (if imports change)

Replace the local `aggregateMetrics` function and `SPINNER`/`spinnerFrame` with pi-agents imports.

- [ ] **Step 1: Run existing tests to establish baseline**

Run: `cd /Users/josorio/Code/pi-teams && npx vitest run src/tui/render.test.ts`
Expected: PASS

- [ ] **Step 2: Update imports in render.ts**

Replace the current imports block at the top of `src/tui/render.ts`:

Current:
```typescript
import type { ThemeColor } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import type { AgentMetrics } from "pi-agents";
import { colorize } from "pi-agents";
import type { AgentNode, GraphNode, TeamGraph } from "../graph/builder.js";
import { formatStats } from "./format.js";
import type { AgentStatus, FooterState } from "./state.js";
```

New:
```typescript
import type { ThemeColor } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import type { AgentMetrics } from "pi-agents";
import { aggregateMetricsArray, colorize, formatUsageStats, spinnerFrame } from "pi-agents";
import type { AgentNode, GraphNode, TeamGraph } from "../graph/builder.js";
import type { AgentStatus, FooterState } from "./state.js";
```

- [ ] **Step 3: Remove local SPINNER, spinnerFrame, and aggregateMetrics**

Delete these function/constant definitions from `src/tui/render.ts`:

```typescript
// DELETE these lines:
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function spinnerFrame() {
  return SPINNER[Math.floor(Date.now() / 80) % SPINNER.length] ?? "⠋";
}
```

```typescript
// DELETE this function:
function aggregateMetrics(all: ReadonlyArray<AgentMetrics>): AgentMetrics {
  let turns = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  for (const m of all) {
    turns += m.turns;
    inputTokens += m.inputTokens;
    outputTokens += m.outputTokens;
    cost += m.cost;
    toolCalls.push(...m.toolCalls);
  }
  return { turns, inputTokens, outputTokens, cost, toolCalls };
}
```

- [ ] **Step 4: Update call sites**

In `src/tui/render.ts`, replace all remaining `formatStats(` with `formatUsageStats(` (if any weren't changed in Task 6).

Replace the `aggregateMetrics(allMetrics)` call (in `renderFooter`):
```typescript
// Old:
const headerStats =
  allMetrics.length > 0 ? `  ${theme.fg("dim", `Σ ${formatStats(aggregateMetrics(allMetrics))}`)}` : "";
```
```typescript
// New:
const headerStats =
  allMetrics.length > 0 ? `  ${theme.fg("dim", `Σ ${formatUsageStats(aggregateMetricsArray(allMetrics))}`)}` : "";
```

- [ ] **Step 5: Export RenderTheme from pi-agents instead of defining locally**

In `src/tui/render.ts`, replace:
```typescript
export type RenderTheme = Readonly<{
  fg: (color: ThemeColor, text: string) => string;
  bold: (text: string) => string;
}>;
```
With:
```typescript
export type { RenderTheme } from "pi-agents";
```

- [ ] **Step 6: Run tests**

Run: `cd /Users/josorio/Code/pi-teams && npx vitest run src/tui/render.test.ts`
Expected: PASS — behavior unchanged.

- [ ] **Step 7: Run all checks**

Run: `cd /Users/josorio/Code/pi-teams && npm run check`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/josorio/Code/pi-teams
git add src/tui/render.ts src/tui/render.test.ts
git commit -m "refactor: import spinner, aggregateMetricsArray, RenderTheme from pi-agents"
```

---

## Task 8: FP fix — collectAgents in pi-teams validator.ts

**Repo:** pi-teams
**Files:**
- Modify: `src/config/validator.ts`

Replace mutable array + recursive push with flatMap.

- [ ] **Step 1: Run existing tests to establish baseline**

Run: `cd /Users/josorio/Code/pi-teams && npx vitest run src/config/validator.test.ts`
Expected: PASS

- [ ] **Step 2: Refactor collectAgents to functional style**

Replace the entire `collectAgents` function in `src/config/validator.ts`:

Current:
```typescript
function collectAgents(config: TeamConfig) {
  const agents: string[] = [config.orchestrator.agent];

  function walk(members: Readonly<TeamConfig["members"]>) {
    for (const member of members) {
      if ("agent" in member) {
        agents.push(member.agent);
      } else {
        agents.push(member.lead);
        walk(member.members);
      }
    }
  }

  walk(config.members);
  return { agents };
}
```

New:
```typescript
function flattenMembers(members: Readonly<TeamConfig["members"]>): ReadonlyArray<string> {
  return members.flatMap((member) =>
    "agent" in member ? [member.agent] : [member.lead, ...flattenMembers(member.members)],
  );
}

function collectAgents(config: TeamConfig): ReadonlyArray<string> {
  return [config.orchestrator.agent, ...flattenMembers(config.members)];
}
```

- [ ] **Step 3: Update validateTeamConfig to use new return type**

In the same file, update `validateTeamConfig`:

Current:
```typescript
export function validateTeamConfig(config: TeamConfig): ValidateResult {
  const { agents } = collectAgents(config);
```

New:
```typescript
export function validateTeamConfig(config: TeamConfig): ValidateResult {
  const agents = collectAgents(config);
```

The rest of `validateTeamConfig` stays the same — it already iterates `agents` with a for loop. We'll clean that up too while we're here:

Replace the duplicate-checking block:
```typescript
  const errors: string[] = [];

  // Check duplicate agents
  const seen = new Set<string>();
  for (const name of agents) {
    if (seen.has(name)) {
      errors.push(`Agent "${name}" appears more than once — duplicate agent references are not allowed`);
    }
    seen.add(name);
  }

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, agentNames: agents };
```

With:
```typescript
  const errors = agents
    .filter((name, i) => agents.indexOf(name) !== i)
    .map((name) => `Agent "${name}" appears more than once — duplicate agent references are not allowed`);

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, agentNames: agents };
```

- [ ] **Step 4: Run tests to verify behavior unchanged**

Run: `cd /Users/josorio/Code/pi-teams && npx vitest run src/config/validator.test.ts`
Expected: PASS

- [ ] **Step 5: Run all checks**

Run: `cd /Users/josorio/Code/pi-teams && npm run check`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/josorio/Code/pi-teams
git add src/config/validator.ts
git commit -m "refactor: replace mutable array in collectAgents with flatMap"
```

---

## Task 9: FP fix — resolveAgents in pi-teams resolver.ts

**Repo:** pi-teams
**Files:**
- Modify: `src/graph/resolver.ts`

Replace imperative for-loop with `Promise.all` + `map`, then partition into ok/error results.

- [ ] **Step 1: Run existing tests to establish baseline**

Run: `cd /Users/josorio/Code/pi-teams && npx vitest run src/graph/resolver.test.ts`
Expected: PASS

- [ ] **Step 2: Refactor resolveAgents to functional style**

Replace the entire `resolveAgents` function body in `src/graph/resolver.ts`:

Current:
```typescript
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentConfig } from "pi-agents";
import { parseAgentFile, validateAgent } from "pi-agents";

type ResolveSuccess = { readonly ok: true; readonly agents: ReadonlyMap<string, AgentConfig> };
type ResolveFailure = { readonly ok: false; readonly errors: ReadonlyArray<string> };
type ResolveResult = ResolveSuccess | ResolveFailure;

export async function resolveAgents(params: {
  readonly agentsDir: string;
  readonly names: ReadonlyArray<string>;
}): Promise<ResolveResult> {
  const errors: string[] = [];
  const agents = new Map<string, AgentConfig>();

  for (const name of params.names) {
    const filePath = join(params.agentsDir, `${name}.md`);

    try {
      await access(filePath);
    } catch {
      errors.push(`Agent "${name}" not found at ${filePath}`);
      continue;
    }

    const content = await readFile(filePath, "utf-8");
    const parsed = parseAgentFile(content);
    if (!parsed.ok) {
      errors.push(`Agent "${name}" parse error: ${parsed.error}`);
      continue;
    }

    const validated = validateAgent({
      frontmatter: parsed.value.frontmatter,
      body: parsed.value.body,
      filePath,
      source: "project",
    });

    if (!validated.ok) {
      for (const d of validated.errors) {
        errors.push(`Agent "${name}": ${d.message}`);
      }
      continue;
    }

    if (validated.value.frontmatter.name !== name) {
      errors.push(`Agent "${name}": frontmatter name is "${validated.value.frontmatter.name}" but expected "${name}"`);
      continue;
    }

    agents.set(name, validated.value);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, agents };
}
```

New:
```typescript
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentConfig } from "pi-agents";
import { parseAgentFile, validateAgent } from "pi-agents";

type ResolveSuccess = { readonly ok: true; readonly agents: ReadonlyMap<string, AgentConfig> };
type ResolveFailure = { readonly ok: false; readonly errors: ReadonlyArray<string> };
type ResolveResult = ResolveSuccess | ResolveFailure;
type AgentResult = { readonly ok: true; readonly name: string; readonly config: AgentConfig } | { readonly ok: false; readonly errors: ReadonlyArray<string> };

async function loadAgent(params: { readonly agentsDir: string; readonly name: string }): Promise<AgentResult> {
  const filePath = join(params.agentsDir, `${params.name}.md`);

  try {
    await access(filePath);
  } catch {
    return { ok: false, errors: [`Agent "${params.name}" not found at ${filePath}`] };
  }

  const content = await readFile(filePath, "utf-8");
  const parsed = parseAgentFile(content);
  if (!parsed.ok) {
    return { ok: false, errors: [`Agent "${params.name}" parse error: ${parsed.error}`] };
  }

  const validated = validateAgent({
    frontmatter: parsed.value.frontmatter,
    body: parsed.value.body,
    filePath,
    source: "project",
  });

  if (!validated.ok) {
    return { ok: false, errors: validated.errors.map((d) => `Agent "${params.name}": ${d.message}`) };
  }

  if (validated.value.frontmatter.name !== params.name) {
    return {
      ok: false,
      errors: [`Agent "${params.name}": frontmatter name is "${validated.value.frontmatter.name}" but expected "${params.name}"`],
    };
  }

  return { ok: true, name: params.name, config: validated.value };
}

export async function resolveAgents(params: {
  readonly agentsDir: string;
  readonly names: ReadonlyArray<string>;
}): Promise<ResolveResult> {
  const results = await Promise.all(
    params.names.map((name) => loadAgent({ agentsDir: params.agentsDir, name })),
  );

  const errors = results.filter((r): r is AgentResult & { ok: false } => !r.ok).flatMap((r) => r.errors);

  if (errors.length > 0) return { ok: false, errors };

  const agents = new Map(
    results
      .filter((r): r is AgentResult & { ok: true } => r.ok)
      .map((r) => [r.name, r.config] as const),
  );

  return { ok: true, agents };
}
```

- [ ] **Step 3: Run tests to verify behavior unchanged**

Run: `cd /Users/josorio/Code/pi-teams && npx vitest run src/graph/resolver.test.ts`
Expected: PASS

- [ ] **Step 4: Run all checks**

Run: `cd /Users/josorio/Code/pi-teams && npm run check`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/josorio/Code/pi-teams
git add src/graph/resolver.ts
git commit -m "refactor: replace imperative loop in resolveAgents with Promise.all + partition"
```

---

## Task 10: Reinstall pi-agents dependency in pi-teams

**Repo:** pi-teams

After all pi-agents changes are committed and pushed, pi-teams needs to pick up the new exports.

- [ ] **Step 1: Push pi-agents changes**

```bash
cd /Users/josorio/Code/pi-agents && git push
```

- [ ] **Step 2: Reinstall in pi-teams**

```bash
cd /Users/josorio/Code/pi-teams && npm install pi-agents@github:josorio7122/pi-agents
```

- [ ] **Step 3: Verify new imports resolve**

Run: `cd /Users/josorio/Code/pi-teams && npx tsc --noEmit`
Expected: No errors — all new imports from pi-agents resolve correctly.

- [ ] **Step 4: Commit lock file**

```bash
cd /Users/josorio/Code/pi-teams
git add package-lock.json
git commit -m "chore: update pi-agents dependency"
```

---

## Task 11: Final verification — both repos

- [ ] **Step 1: Run all pi-agents checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: lint PASS, typecheck PASS, tests PASS.

- [ ] **Step 2: Run all pi-teams checks**

Run: `cd /Users/josorio/Code/pi-teams && npm run check`
Expected: lint PASS, typecheck PASS, tests PASS.

- [ ] **Step 3: Verify no remaining duplicates**

Run:
```bash
grep -r "formatTokens\|formatStats" /Users/josorio/Code/pi-teams/src/ --include="*.ts" | grep -v node_modules | grep -v ".test.ts"
```
Expected: Only `render.ts` importing `formatUsageStats` from `"pi-agents"`. No local definitions.

Run:
```bash
grep -r "SPINNER\|spinnerFrame" /Users/josorio/Code/pi-teams/src/ --include="*.ts" | grep -v node_modules | grep -v ".test.ts"
```
Expected: Only `render.ts` importing from `"pi-agents"`. No local definitions.

Run:
```bash
grep -r "aggregateMetrics" /Users/josorio/Code/pi-teams/src/ --include="*.ts" | grep -v node_modules | grep -v ".test.ts"
```
Expected: Only `render.ts` calling `aggregateMetricsArray` imported from `"pi-agents"`. No local function definition.

- [ ] **Step 4: Verify file deletions**

```bash
ls /Users/josorio/Code/pi-teams/src/tui/format.ts 2>/dev/null && echo "ERROR: format.ts still exists" || echo "OK: format.ts deleted"
ls /Users/josorio/Code/pi-teams/src/tui/format.test.ts 2>/dev/null && echo "ERROR: format.test.ts still exists" || echo "OK: format.test.ts deleted"
```
Expected: Both say "OK: ... deleted"

---

## Summary of Changes

### pi-agents (library)
| Change | Type |
|--------|------|
| Export `formatTokens`, `formatUsageStats` | New API surface |
| Extract `common/spinner.ts` | New module |
| Export `SPINNER_FRAMES`, `spinnerFrame` | New API surface |
| Export `RenderTheme` type | New API surface |
| Add `aggregateMetricsArray` | New function + API surface |
| FP fix `resolveVariables` | Refactor (reduce) |
| Update `tool/render.ts` | Import from shared spinner |

### pi-teams (consumer)
| Change | Type |
|--------|------|
| Delete `tui/format.ts` + test | Remove duplication |
| Update `tui/render.ts` | Import from pi-agents |
| FP fix `config/validator.ts` | Refactor (flatMap) |
| FP fix `graph/resolver.ts` | Refactor (Promise.all + partition) |
| Re-export `RenderTheme` from pi-agents | Type dedup |

### NOT changed (intentionally)
| File | Reason |
|------|--------|
| `pi-teams/src/tui/state.ts` | Mutable internals behind immutable interface — acceptable factory pattern |
| `pi-teams/src/tui/bordered-box.ts` | Class required by pi-tui's Component interface — documented exception |
| `pi-teams/src/delegate/create-delegate-tool.ts` | Side effects (setInterval, state mutation) are inherent to tool execution lifecycle |
| `pi-agents/src/tool/modes.ts:executeParallel` | Concurrency pattern requires mutation; refactoring to FP would add complexity without benefit |
| `pi-agents/src/invocation/metrics.ts` | Stateful closure is the correct pattern for event-driven metric accumulation |
