import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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

function agentMd(p: { readonly name: string; readonly role: string; readonly tools: string; readonly body: string }) {
  return `---
name: ${p.name}
description: ${p.name} agent
model: anthropic/claude-haiku-4-5
role: ${p.role}
color: "#ffffff"
icon: "🤖"
domain:
  - path: .
    read: true
    write: true
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

async function setupParallelProject() {
  const dir = await mkdtemp(join(tmpdir(), "pi-teams-e2e-parallel-"));

  for (const d of [".pi/agents", ".pi/teams", ".pi/skills", ".pi/knowledge/project", ".pi/knowledge/general"]) {
    await mkdir(join(dir, d), { recursive: true });
  }
  const sessionDir = join(dir, ".pi", "sessions", "e2e");
  await mkdir(sessionDir, { recursive: true });

  await writeFile(join(dir, ".pi", "skills", "e2e.md"), "# E2E Skill\nFollow instructions exactly.");

  const outputA = join(dir, "output-a.txt");
  const outputB = join(dir, "output-b.txt");

  // Team: lead → worker-a + worker-b
  await writeFile(
    join(dir, ".pi", "teams", "teams.md"),
    `---
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
  );

  await writeFile(
    join(dir, ".pi", "agents", "lead.md"),
    agentMd({
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
    }),
  );

  await writeFile(
    join(dir, ".pi", "agents", "worker-a.md"),
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
    join(dir, ".pi", "agents", "worker-b.md"),
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

  return {
    dir,
    sessionDir,
    outputA,
    outputB,
    conversationLogPath: join(sessionDir, "conversation.jsonl"),
  };
}

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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
    const footerState = createFooterState({ onUpdate: () => {} });

    const delegateTool = createDelegateTool({
      callerName: "lead",
      targets,
      session: { conversationLogPath: project.conversationLogPath, sessionDir: project.sessionDir },
      cwd: project.dir,
      modelRegistry,
      runAgentFn: runAgent,
      sharedContext: [],
      footerState,
      agents: resolved.agents,
    });

    const guidelines = buildDelegateGuidelines(targets);
    const teamsBlock = buildTargetsBlock(targets);

    const result = await runAgent({
      agentConfig: graph.orchestrator.config,
      task: "Delegate to BOTH worker-a and worker-b at the same time. Worker-a should write its file and worker-b should write its file. Make both delegate calls in a single response.",
      cwd: project.dir,
      sessionDir: project.sessionDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      customTools: [delegateTool],
      sharedContext: [],
      extraVariables: {
        TEAMS_BLOCK: `## Available Agents\n${teamsBlock}\n\n## Delegation Guidelines\n${guidelines.join("\n")}`,
      },
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
