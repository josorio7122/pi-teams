import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { readLog, runAgent } from "pi-agents";
import { afterEach, describe, expect, it } from "vitest";
import { agentMd, bootstrapTeam, fileExists, setupBaseProject } from "./helpers.js";

async function setupProject() {
  const dir = await setupBaseProject({
    agents: [
      {
        name: "orchestrator",
        role: "orchestrator",
        tools: "- read\n  - delegate",
        body: [
          "# Orchestrator",
          "",
          "You coordinate work. You have one job:",
          'Delegate to the "writer" agent. Pass the user\'s task exactly.',
          "Do not answer directly. Always delegate.",
          "",
          "{{TEAMS_BLOCK}}",
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
  - agent: writer
    consult-when: All writing tasks
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
        "You are a test agent. You have one job:",
        `Write the text "e2e_marker: delegation_works" to the file at: ${outputPath}`,
        `Use the bash tool: echo 'e2e_marker: delegation_works' > ${outputPath}`,
        "Do not explain, just write the file.",
      ].join("\n"),
    }),
  );

  const sessionDir = join(dir, ".pi", "sessions", "e2e");
  await mkdir(sessionDir, { recursive: true });

  return { dir, sessionDir, outputPath, conversationLogPath: join(sessionDir, "conversation.jsonl") };
}

describe("e2e: delegation chain with real LLM", () => {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  let project: Awaited<ReturnType<typeof setupProject>> | undefined;

  afterEach(async () => {
    if (project) await rm(project.dir, { recursive: true, force: true });
  });

  it("orchestrator delegates to worker who writes a file", async () => {
    project = await setupProject();

    const { graph, delegateTool, extraVariables } = await bootstrapTeam({
      dir: project.dir,
      sessionDir: project.sessionDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
    });

    const result = await runAgent({
      agentConfig: graph.orchestrator.config,
      task: 'Delegate to the writer agent. Tell it to write "e2e_marker: delegation_works" to output.txt.',
      cwd: project.dir,
      sessionDir: project.sessionDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      customTools: [delegateTool],
      sharedContext: [],
      extraVariables,
    });

    // The orchestrator should not error
    expect(result.error).toBeUndefined();

    // The writer should have created the file
    expect(await fileExists(project.outputPath)).toBe(true);
    const content = await readFile(project.outputPath, "utf-8");
    expect(content).toContain("e2e_marker");

    // Conversation log should have delegation entry
    const log = await readLog(project.conversationLogPath);
    expect(log).toContain("delegation");
    expect(log).toContain("writer");
  }, 60_000);
});
