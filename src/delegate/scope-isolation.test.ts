import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTarget, stubConfig } from "../test-helpers.js";
import { createFooterState } from "../tui/state.js";
import { createDelegateTool } from "./create-delegate-tool.js";

describe("delegate tool: scope isolation", () => {
  const mockRunAgent = vi.fn();

  let tmpDir: string;
  let conversationLogPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pi-teams-delegate-"));
    conversationLogPath = join(tmpDir, "conversation.jsonl");
    mockRunAgent.mockReset();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function baseDeps() {
    return {
      callerName: "orchestrator",
      cwd: tmpDir,
      session: { conversationLogPath, sessionDir: tmpDir },
      modelRegistry: {} as never,
      runAgentFn: mockRunAgent,
      sharedContext: [] as Array<{ path: string; content: string }>,
      footerState: createFooterState({ onUpdate: () => {} }),
      agents: new Map(),
    };
  }

  it("parallel executions do not bleed events into each other's scope", async () => {
    const footerState = createFooterState({ onUpdate: () => {} });

    // Simulate: a lead delegates to worker-a and worker-b in parallel.
    // Each execute should only see its own events, not the sibling's.
    const tool = createDelegateTool({
      ...baseDeps(),
      callerName: "lead",
      targets: [makeTarget("worker-a"), makeTarget("worker-b")],
      footerState,
    });

    // worker-a takes longer than worker-b
    let resolveA: (v: {
      output: string;
      metrics: { turns: number; inputTokens: number; outputTokens: number; cost: number; toolCalls: never[] };
    }) => void;
    const promiseA = new Promise<{
      output: string;
      metrics: { turns: number; inputTokens: number; outputTokens: number; cost: number; toolCalls: never[] };
    }>((r) => {
      resolveA = r;
    });
    let resolveB: (v: {
      output: string;
      metrics: { turns: number; inputTokens: number; outputTokens: number; cost: number; toolCalls: never[] };
    }) => void;
    const promiseB = new Promise<{
      output: string;
      metrics: { turns: number; inputTokens: number; outputTokens: number; cost: number; toolCalls: never[] };
    }>((r) => {
      resolveB = r;
    });

    const metrics = { turns: 1, inputTokens: 10, outputTokens: 5, cost: 0.01, toolCalls: [] as never[] };
    mockRunAgent.mockImplementationOnce(() => promiseA).mockImplementationOnce(() => promiseB);

    // Fire both in parallel (like eng-lead making two tool calls)
    const resultAPromise = tool.execute(
      "call-a",
      { target: "worker-a", task: "Task A" },
      undefined,
      undefined,
      {} as never,
    );
    const resultBPromise = tool.execute(
      "call-b",
      { target: "worker-b", task: "Task B" },
      undefined,
      undefined,
      {} as never,
    );

    // worker-b finishes first
    resolveB!({ output: "Done B", metrics });
    await new Promise((r) => setTimeout(r, 10));

    // worker-a finishes second
    resolveA!({ output: "Done A", metrics });

    const [resultA, resultB] = await Promise.all([resultAPromise, resultBPromise]);

    // Each result should only contain its own events
    const eventsA = (
      resultA.details as { events: readonly { type: string; from?: string; to?: string; agent?: string }[] }
    ).events;
    const eventsB = (
      resultB.details as { events: readonly { type: string; from?: string; to?: string; agent?: string }[] }
    ).events;

    // worker-a's events should NOT contain worker-b's delegation or response
    const aHasBDelegation = eventsA.some((e) => e.type === "delegation" && e.to === "worker-b");
    const aHasBResponse = eventsA.some((e) => e.type === "response" && e.agent === "worker-b");
    expect(aHasBDelegation).toBe(false);
    expect(aHasBResponse).toBe(false);

    // worker-b's events should NOT contain worker-a's delegation or response
    const bHasADelegation = eventsB.some((e) => e.type === "delegation" && e.to === "worker-a");
    const bHasAResponse = eventsB.some((e) => e.type === "response" && e.agent === "worker-a");
    expect(bHasADelegation).toBe(false);
    expect(bHasAResponse).toBe(false);

    // Each should have exactly its own delegation + response
    expect(eventsA.filter((e) => e.type === "delegation" && e.to === "worker-a")).toHaveLength(1);
    expect(eventsA.filter((e) => e.type === "response" && e.agent === "worker-a")).toHaveLength(1);
    expect(eventsB.filter((e) => e.type === "delegation" && e.to === "worker-b")).toHaveLength(1);
    expect(eventsB.filter((e) => e.type === "response" && e.agent === "worker-b")).toHaveLength(1);
  });
});
