import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTarget, stubConfig } from "../test-helpers.js";
import { createFooterState } from "../tui/state.js";
import { createDelegateTool } from "./create-delegate-tool.js";

describe("createDelegateTool", () => {
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

  it("returns a tool with name 'delegate'", () => {
    const tool = createDelegateTool({ ...baseDeps(), targets: [makeTarget("builder")] });
    expect(tool.name).toBe("delegate");
  });

  it("has description and parameters", () => {
    const tool = createDelegateTool({ ...baseDeps(), targets: [makeTarget("builder")] });
    expect(tool.description).toContain("Delegate");
    expect(tool.parameters).toHaveProperty("properties");
  });

  it("includes promptGuidelines with target names", () => {
    const tool = createDelegateTool({
      ...baseDeps(),
      targets: [
        makeTarget("architect", { consultWhen: "Design" }),
        makeTarget("eng-lead", {
          teamMembers: [{ type: "agent", config: stubConfig("eng-lead") }],
          consultWhen: "Code",
        }),
      ],
    });
    expect(tool.promptGuidelines).toBeDefined();
    const joined = tool.promptGuidelines!.join("\n");
    expect(joined).toContain("delegate");
    expect(joined).toContain("parallel");
  });

  it("executes delegation to a flat agent target", async () => {
    mockRunAgent.mockResolvedValue({
      output: "Built it!",
      metrics: { turns: 1, inputTokens: 100, outputTokens: 50, cost: 0.01, toolCalls: [] },
    });

    const tool = createDelegateTool({
      ...baseDeps(),
      targets: [makeTarget("builder")],
    });

    const result = await tool.execute(
      "call-1",
      { target: "builder", task: "Build feature X" },
      undefined,
      undefined,
      {} as never,
    );

    expect(mockRunAgent).toHaveBeenCalledOnce();
    const callArgs = mockRunAgent.mock.calls[0]![0];
    expect(callArgs.agentConfig.frontmatter.name).toBe("builder");
    expect(callArgs.task).toBe("Build feature X");
    expect(callArgs.caller).toBe("orchestrator");
    expect(result.content[0]).toMatchObject({ type: "text", text: "Built it!" });
  });

  it("rejects unknown target", async () => {
    const tool = createDelegateTool({
      ...baseDeps(),
      targets: [makeTarget("builder")],
    });

    await expect(
      tool.execute("call-1", { target: "unknown", task: "Do stuff" }, undefined, undefined, {} as never),
    ).rejects.toThrow(/unknown/i);
  });

  it("passes extraVariables with TEAM_MEMBERS_BLOCK for team leads", async () => {
    mockRunAgent.mockResolvedValue({
      output: "Done",
      metrics: { turns: 1, inputTokens: 100, outputTokens: 50, cost: 0.01, toolCalls: [] },
    });

    const tool = createDelegateTool({
      ...baseDeps(),
      targets: [
        makeTarget("eng-lead", {
          config: stubConfig("eng-lead", { tools: ["read", "delegate"] }),
          teamMembers: [
            { type: "agent", config: stubConfig("frontend-dev"), consultWhen: "UI" },
            { type: "agent", config: stubConfig("backend-dev"), consultWhen: "APIs" },
          ],
        }),
      ],
    });

    await tool.execute("call-1", { target: "eng-lead", task: "Build it" }, undefined, undefined, {} as never);

    const callArgs = mockRunAgent.mock.calls[0]![0];
    expect(callArgs.extraVariables).toBeDefined();
    expect(callArgs.extraVariables.TEAM_MEMBERS_BLOCK).toContain("frontend-dev");
    expect(callArgs.extraVariables.TEAM_MEMBERS_BLOCK).toContain("backend-dev");
  });

  it("passes customTools with delegate for leads that have delegate in tools", async () => {
    mockRunAgent.mockResolvedValue({
      output: "Done",
      metrics: { turns: 1, inputTokens: 100, outputTokens: 50, cost: 0.01, toolCalls: [] },
    });

    const tool = createDelegateTool({
      ...baseDeps(),
      targets: [
        makeTarget("eng-lead", {
          config: stubConfig("eng-lead", { tools: ["read", "delegate"] }),
          teamMembers: [{ type: "agent", config: stubConfig("frontend-dev") }],
        }),
      ],
    });

    await tool.execute("call-1", { target: "eng-lead", task: "Build it" }, undefined, undefined, {} as never);

    const callArgs = mockRunAgent.mock.calls[0]![0];
    expect(callArgs.customTools).toBeDefined();
    expect(callArgs.customTools.length).toBe(1);
    expect(callArgs.customTools[0].name).toBe("delegate");
  });

  it("does not pass customTools for workers without delegate", async () => {
    mockRunAgent.mockResolvedValue({
      output: "Done",
      metrics: { turns: 1, inputTokens: 100, outputTokens: 50, cost: 0.01, toolCalls: [] },
    });

    const tool = createDelegateTool({
      ...baseDeps(),
      targets: [makeTarget("builder")],
    });

    await tool.execute("call-1", { target: "builder", task: "Build it" }, undefined, undefined, {} as never);

    const callArgs = mockRunAgent.mock.calls[0]![0];
    expect(callArgs.customTools).toBeUndefined();
  });

  it("passes sharedContext through to runAgentFn", async () => {
    mockRunAgent.mockResolvedValue({
      output: "Done",
      metrics: { turns: 1, inputTokens: 100, outputTokens: 50, cost: 0.01, toolCalls: [] },
    });

    const tool = createDelegateTool({
      ...baseDeps(),
      sharedContext: [{ path: "AGENTS.md", content: "team rules here" }],
      targets: [makeTarget("builder")],
    });

    await tool.execute("call-1", { target: "builder", task: "Build it" }, undefined, undefined, {} as never);

    const callArgs = mockRunAgent.mock.calls[0]![0];
    expect(callArgs.sharedContext).toBeDefined();
    expect(callArgs.sharedContext).toHaveLength(1);
    expect(callArgs.sharedContext[0].content).toBe("team rules here");
  });

  it("passes sharedContext to nested delegate tools for leads", async () => {
    mockRunAgent.mockResolvedValue({
      output: "Done",
      metrics: { turns: 1, inputTokens: 100, outputTokens: 50, cost: 0.01, toolCalls: [] },
    });

    const tool = createDelegateTool({
      ...baseDeps(),
      sharedContext: [{ path: "AGENTS.md", content: "shared across all" }],
      targets: [
        makeTarget("eng-lead", {
          config: stubConfig("eng-lead", { tools: ["read", "delegate"] }),
          teamMembers: [{ type: "agent", config: stubConfig("frontend-dev") }],
        }),
      ],
    });

    await tool.execute("call-1", { target: "eng-lead", task: "Build it" }, undefined, undefined, {} as never);

    const callArgs = mockRunAgent.mock.calls[0]![0];
    // The nested delegate tool should also have sharedContext
    expect(callArgs.customTools).toHaveLength(1);
    expect(callArgs.sharedContext).toHaveLength(1);
    expect(callArgs.sharedContext[0].content).toBe("shared across all");
  });

  it("throws immediately when signal is already aborted", async () => {
    mockRunAgent.mockResolvedValue({ output: "ok", metrics: {} });
    const tool = createDelegateTool({ ...baseDeps(), targets: [makeTarget("builder")] });

    const controller = new AbortController();
    controller.abort();

    await expect(
      tool.execute("call-1", { target: "builder", task: "Build it" }, controller.signal, undefined, {} as never),
    ).rejects.toThrow(/cancelled/);

    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("passes signal through to runAgentFn", async () => {
    mockRunAgent.mockResolvedValue({ output: "ok", metrics: {} });
    const tool = createDelegateTool({ ...baseDeps(), targets: [makeTarget("builder")] });

    const controller = new AbortController();
    await tool.execute("call-1", { target: "builder", task: "Build it" }, controller.signal, undefined, {} as never);

    const callArgs = mockRunAgent.mock.calls[0]![0];
    expect(callArgs.signal).toBe(controller.signal);
  });

  it("sets footer state to error when runAgentFn throws", async () => {
    mockRunAgent.mockRejectedValue(new Error("Network failure"));
    const footerState = createFooterState({ onUpdate: () => {} });
    const tool = createDelegateTool({ ...baseDeps(), targets: [makeTarget("builder")], footerState });

    await expect(
      tool.execute("call-1", { target: "builder", task: "Build it" }, undefined, undefined, {} as never),
    ).rejects.toThrow("Network failure");

    const status = footerState.get("builder");
    expect(status.status).toBe("error");
    if (status.status === "error") expect(status.error).toBe("Network failure");
  });
});
