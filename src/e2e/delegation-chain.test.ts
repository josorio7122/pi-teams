import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { readLog, runAgent } from "pi-agents";
import { afterEach, describe, expect, it } from "vitest";
import { parseTeamFile } from "../config/parser.js";
import { validateTeamConfig } from "../config/validator.js";
import { createDelegateTool } from "../delegate/create-delegate-tool.js";
import { buildDelegateGuidelines } from "../delegate/guidelines.js";
import { extractTargets } from "../delegate/targets.js";
import { buildTargetsBlock } from "../delegate/variables.js";
import { buildTeamGraph } from "../graph/builder.js";
import { resolveAgents } from "../graph/resolver.js";
import { createFooterState } from "../tui/state.js";
import { agentMd, fileExists, setupBaseProject } from "./helpers.js";

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

    const teamsContent = await readFile(join(project.dir, ".pi", "teams", "teams.md"), "utf-8");
    const parsed = parseTeamFile(teamsContent);
    if (!parsed.ok) throw new Error(parsed.error);

    const validated = validateTeamConfig(parsed.value);
    if (!validated.ok) throw new Error(validated.errors.join(", "));

    const resolved = await resolveAgents({
      agentsDir: join(project.dir, parsed.value.paths.agents),
      names: validated.agentNames,
    });
    if (!resolved.ok) throw new Error(resolved.errors.join(", "));

    const graph = buildTeamGraph(parsed.value, resolved.agents);
    const targets = extractTargets(graph.members);

    const delegateTool = createDelegateTool({
      callerName: "orchestrator",
      targets,
      session: { conversationLogPath: project.conversationLogPath, sessionDir: project.sessionDir },
      cwd: project.dir,
      modelRegistry,
      runAgentFn: runAgent,
      sharedContext: [],
      footerState: createFooterState({ onUpdate: () => {} }),
      agents: resolved.agents,
    });

    const guidelines = buildDelegateGuidelines();
    const teamsBlock = buildTargetsBlock(targets);
    const guidelinesBlock = guidelines.join("\n");

    const result = await runAgent({
      agentConfig: graph.orchestrator.config,
      task: 'Delegate to the writer agent. Tell it to write "e2e_marker: delegation_works" to output.txt.',
      cwd: project.dir,
      sessionDir: project.sessionDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      customTools: [delegateTool],
      sharedContext: [],
      extraVariables: {
        TEAMS_BLOCK: `## Available Agents\n${teamsBlock}\n\n## Delegation Guidelines\n${guidelinesBlock}`,
      },
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
