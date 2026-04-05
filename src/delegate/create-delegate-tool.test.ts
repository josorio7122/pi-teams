import type { AgentConfig } from "pi-agents";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDelegateTool } from "./create-delegate-tool.js";
import type { DelegateTarget } from "./targets.js";

function stubConfig(name: string, tools: string[] = ["read"]): AgentConfig {
  return {
    frontmatter: {
      name,
      description: `${name} agent`,
      model: "anthropic/claude-sonnet-4-6",
      role: "worker",
      color: "#fff",
      icon: "🔨",
      domain: [{ path: "src/", read: true, write: true, delete: false }],
      tools,
      skills: [{ path: ".pi/skills/test.md", when: "Always" }],
      knowledge: {
        project: { path: `.pi/k/p/${name}.yaml`, description: "P", updatable: true, "max-lines": 100 },
        general: { path: `.pi/k/g/${name}.yaml`, description: "G", updatable: true, "max-lines": 100 },
      },
      conversation: { path: ".pi/sessions/{{SESSION_ID}}/conversation.jsonl" },
    },
    systemPrompt: `You are ${name}.`,
    filePath: `.pi/agents/${name}.md`,
    source: "project",
  };
}

function makeTarget(name: string, opts?: Partial<DelegateTarget>): DelegateTarget {
  return { name, config: stubConfig(name), ...opts };
}

describe("createDelegateTool", () => {
  const mockRunAgent = vi.fn();

  const baseDeps = {
    callerName: "orchestrator",
    conversationLogPath: "/tmp/test-conversation.jsonl",
    cwd: "/tmp/test-project",
    sessionDir: "/tmp/test-session",
    modelRegistry: {} as never,
    runAgentFn: mockRunAgent,
  };

  beforeEach(() => {
    mockRunAgent.mockReset();
  });

  it("returns a tool with name 'delegate'", () => {
    const tool = createDelegateTool({ ...baseDeps, targets: [makeTarget("builder")] });
    expect(tool.name).toBe("delegate");
  });

  it("has description and parameters", () => {
    const tool = createDelegateTool({ ...baseDeps, targets: [makeTarget("builder")] });
    expect(tool.description).toBeDefined();
    expect(tool.parameters).toBeDefined();
  });

  it("includes promptGuidelines with target names", () => {
    const tool = createDelegateTool({
      ...baseDeps,
      targets: [
        makeTarget("architect", { consultWhen: "Design" }),
        makeTarget("eng-lead", { leadsTeam: "Engineering", consultWhen: "Code" }),
      ],
    });
    expect(tool.promptGuidelines).toBeDefined();
    const joined = tool.promptGuidelines!.join("\n");
    expect(joined).toContain("architect");
    expect(joined).toContain("eng-lead");
    expect(joined).toContain("Engineering");
  });

  it("executes delegation to a flat agent target", async () => {
    mockRunAgent.mockResolvedValue({
      output: "Built it!",
      metrics: { turns: 1, inputTokens: 100, outputTokens: 50, cost: 0.01, toolCalls: [] },
    });

    const tool = createDelegateTool({
      ...baseDeps,
      targets: [makeTarget("builder")],
    });

    const result = await tool.execute("call-1", { target: "builder", task: "Build feature X" }, undefined, undefined);

    expect(mockRunAgent).toHaveBeenCalledOnce();
    const callArgs = mockRunAgent.mock.calls[0]![0];
    expect(callArgs.agentConfig.frontmatter.name).toBe("builder");
    expect(callArgs.task).toBe("Build feature X");
    expect(callArgs.caller).toBe("orchestrator");
    expect(result.content[0]).toMatchObject({ type: "text", text: "Built it!" });
  });

  it("rejects unknown target", async () => {
    const tool = createDelegateTool({
      ...baseDeps,
      targets: [makeTarget("builder")],
    });

    await expect(tool.execute("call-1", { target: "unknown", task: "Do stuff" }, undefined, undefined)).rejects.toThrow(
      /unknown/i,
    );
  });

  it("passes extraVariables with TEAM_MEMBERS_BLOCK for team leads", async () => {
    mockRunAgent.mockResolvedValue({
      output: "Done",
      metrics: { turns: 1, inputTokens: 100, outputTokens: 50, cost: 0.01, toolCalls: [] },
    });

    const tool = createDelegateTool({
      ...baseDeps,
      targets: [
        makeTarget("eng-lead", {
          config: stubConfig("eng-lead", ["read", "delegate"]),
          leadsTeam: "Engineering",
          teamMembers: [
            { type: "agent", config: stubConfig("frontend-dev"), consultWhen: "UI" },
            { type: "agent", config: stubConfig("backend-dev"), consultWhen: "APIs" },
          ],
        }),
      ],
    });

    await tool.execute("call-1", { target: "eng-lead", task: "Build it" }, undefined, undefined);

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
      ...baseDeps,
      targets: [
        makeTarget("eng-lead", {
          config: stubConfig("eng-lead", ["read", "delegate"]),
          leadsTeam: "Engineering",
          teamMembers: [{ type: "agent", config: stubConfig("frontend-dev") }],
        }),
      ],
    });

    await tool.execute("call-1", { target: "eng-lead", task: "Build it" }, undefined, undefined);

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
      ...baseDeps,
      targets: [makeTarget("builder")],
    });

    await tool.execute("call-1", { target: "builder", task: "Build it" }, undefined, undefined);

    const callArgs = mockRunAgent.mock.calls[0]![0];
    expect(callArgs.customTools).toBeUndefined();
  });
});
