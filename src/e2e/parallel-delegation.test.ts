import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { readLog, runAgent } from "pi-agents";
import { afterEach, describe, expect, it } from "vitest";
import { agentMd, bootstrapTeam, fileExists, setupBaseProject } from "./helpers.js";

async function setupParallelProject() {
  const dir = await setupBaseProject({
    agents: [
      {
        name: "lead",
        role: "orchestrator",
        tools: "- delegate",
        body: [
          "# Lead",
          "",
          "You coordinate work by delegating to workers.",
          "You have two workers: worker-a and worker-b.",
          "",
          "IMPORTANT: When asked to delegate to BOTH workers, make BOTH delegate calls",
          "in a SINGLE response. Do NOT wait for one to finish before starting the other.",
          "Call delegate twice in the same message to run them in parallel.",
          "",
          "{{TEAMS_BLOCK}}",
        ].join("\n"),
      },
      { name: "worker-a", role: "worker", tools: "- bash", body: "" },
      { name: "worker-b", role: "worker", tools: "- bash", body: "" },
    ],
    teamsMd: `---
paths:
  agents: .pi/agents/
orchestrator:
  agent: lead
members:
  - agent: worker-a
    consult-when: Write file A
  - agent: worker-b
    consult-when: Write file B
---
`,
  });

  const outputA = join(dir, "output-a.txt");
  const outputB = join(dir, "output-b.txt");

  await writeFile(
    join(dir, ".pi/agents/worker-a.md"),
    agentMd({
      name: "worker-a",
      role: "worker",
      tools: "- bash",
      body: [
        "# Worker A",
        "",
        `Write the text "parallel_a: done" to: ${outputA}`,
        `Use bash: echo 'parallel_a: done' > ${outputA}`,
        "Do not explain, just write the file.",
      ].join("\n"),
    }),
  );

  await writeFile(
    join(dir, ".pi/agents/worker-b.md"),
    agentMd({
      name: "worker-b",
      role: "worker",
      tools: "- bash",
      body: [
        "# Worker B",
        "",
        `Write the text "parallel_b: done" to: ${outputB}`,
        `Use bash: echo 'parallel_b: done' > ${outputB}`,
        "Do not explain, just write the file.",
      ].join("\n"),
    }),
  );

  const sessionDir = join(dir, ".pi", "sessions", "e2e");
  await mkdir(sessionDir, { recursive: true });

  return {
    dir,
    sessionDir,
    outputA,
    outputB,
    conversationLogPath: join(sessionDir, "conversation.jsonl"),
  };
}

describe("e2e: parallel delegation (lead delegates to two workers simultaneously)", () => {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  let project: Awaited<ReturnType<typeof setupParallelProject>> | undefined;

  afterEach(async () => {
    if (project) await rm(project.dir, { recursive: true, force: true });
  });

  it("lead delegates to worker-a and worker-b in parallel", async () => {
    project = await setupParallelProject();

    const { graph, delegateTool, extraVariables, footerState } = await bootstrapTeam({
      dir: project.dir,
      sessionDir: project.sessionDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      callerName: "lead",
    });

    const result = await runAgent({
      agentConfig: graph.orchestrator.config,
      task: "Delegate to BOTH worker-a and worker-b at the same time. Worker-a should write its file and worker-b should write its file. Make both delegate calls in a single response.",
      cwd: project.dir,
      sessionDir: project.sessionDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      customTools: [delegateTool],
      sharedContext: [],
      extraVariables,
    });

    expect(result.error).toBeUndefined();

    // Both workers should have created their files
    expect(await fileExists(project.outputA)).toBe(true);
    expect(await fileExists(project.outputB)).toBe(true);

    const contentA = await readFile(project.outputA, "utf-8");
    const contentB = await readFile(project.outputB, "utf-8");
    expect(contentA).toContain("parallel_a");
    expect(contentB).toContain("parallel_b");

    // Conversation log should have both delegations
    const log = await readLog(project.conversationLogPath);
    expect(log).toContain("worker-a");
    expect(log).toContain("worker-b");

    // Footer state should have tracked both workers
    const statusA = footerState.get("worker-a");
    const statusB = footerState.get("worker-b");
    expect(statusA.status).not.toBe("idle");
    expect(statusB.status).not.toBe("idle");

    // Both should have completion events
    const events = footerState.getEvents();
    const delegations = events.filter((e) => e.type === "delegation");
    const responses = events.filter((e) => e.type === "response");
    expect(delegations.length).toBeGreaterThanOrEqual(2);
    expect(responses.length).toBeGreaterThanOrEqual(2);
  }, 120_000);
});
