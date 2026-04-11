import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { readLog, runAgent } from "pi-agents";
import { afterEach, describe, expect, it } from "vitest";
import { agentMd, bootstrapTeam, fileExists, setupBaseProject } from "./helpers.js";

async function setupNestedProject() {
  const dir = await setupBaseProject({
    agents: [
      {
        name: "orchestrator",
        role: "orchestrator",
        tools: "- read\n  - delegate",
        body: [
          "# Orchestrator",
          "",
          "You coordinate work by delegating to team leads.",
          'You have one team lead: "eng-lead". Delegate ALL tasks to eng-lead.',
          "Do not answer directly. Always delegate.",
          "",
          "{{TEAMS_BLOCK}}",
        ].join("\n"),
      },
      {
        name: "eng-lead",
        role: "lead",
        tools: "- read\n  - delegate",
        body: [
          "# Engineering Lead",
          "",
          "You are a team lead. You delegate work to your team members.",
          'You have one worker: "writer". Delegate ALL tasks to writer.',
          "Do not execute any work yourself. Always delegate.",
          "",
          "{{TEAM_MEMBERS_BLOCK}}",
        ].join("\n"),
      },
      { name: "writer", role: "worker", tools: "- read\n  - bash", body: "" },
    ],
    teamsMd: `---
paths:
  agents: .pi/agents/
orchestrator:
  agent: orchestrator
members:
  - lead: eng-lead
    consult-when: All engineering tasks
    members:
      - agent: writer
---
`,
  });

  const outputPath = join(dir, "output.txt");

  await writeFile(
    join(dir, ".pi/agents/writer.md"),
    agentMd({
      name: "writer",
      role: "worker",
      tools: "- read\n  - bash",
      body: [
        "# Writer",
        "",
        "You are a worker agent. You have one job:",
        `Write the text "nested_e2e: lead_to_worker" to: ${outputPath}`,
        `Use the bash tool: echo 'nested_e2e: lead_to_worker' > ${outputPath}`,
        "Do not explain, just write the file.",
      ].join("\n"),
    }),
  );

  const sessionDir = join(dir, ".pi", "sessions", "e2e");
  await mkdir(sessionDir, { recursive: true });

  return { dir, sessionDir, outputPath, conversationLogPath: join(sessionDir, "conversation.jsonl") };
}

describe("e2e: nested delegation (orchestrator → lead → worker)", () => {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  let project: Awaited<ReturnType<typeof setupNestedProject>> | undefined;

  afterEach(async () => {
    if (project) await rm(project.dir, { recursive: true, force: true });
  });

  it("orchestrator delegates to lead who delegates to worker", async () => {
    project = await setupNestedProject();

    const { graph, delegateTool, extraVariables, footerState } = await bootstrapTeam({
      dir: project.dir,
      sessionDir: project.sessionDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
    });

    const result = await runAgent({
      agentConfig: graph.orchestrator.config,
      task: 'Delegate to the engineering lead. Tell them to have the writer write "nested_e2e: lead_to_worker" to output.txt.',
      cwd: project.dir,
      sessionDir: project.sessionDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      customTools: [delegateTool],
      sharedContext: [],
      extraVariables,
    });

    // Orchestrator should not error
    expect(result.error).toBeUndefined();

    // Writer should have created the file through the lead
    expect(await fileExists(project.outputPath)).toBe(true);
    const content = await readFile(project.outputPath, "utf-8");
    expect(content).toContain("nested_e2e");

    // Conversation log should have both delegation hops
    const log = await readLog(project.conversationLogPath);
    expect(log).toContain("eng-lead");
    expect(log).toContain("writer");

    // Footer state should have tracked all agents
    const engStatus = footerState.get("eng-lead");
    const writerStatus = footerState.get("writer");
    expect(engStatus.status).not.toBe("idle");
    expect(writerStatus.status).not.toBe("idle");

    // Conversation events should capture the full chain
    const events = footerState.getEvents();
    expect(events.length).toBeGreaterThanOrEqual(4); // 2 delegations + 2 responses
    const delegations = events.filter((e) => e.type === "delegation");
    const responses = events.filter((e) => e.type === "response");
    expect(delegations.length).toBeGreaterThanOrEqual(2);
    expect(responses.length).toBeGreaterThanOrEqual(2);
  }, 120_000);
});
