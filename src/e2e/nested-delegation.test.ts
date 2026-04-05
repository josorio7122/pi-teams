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

async function setupNestedProject() {
  const dir = await mkdtemp(join(tmpdir(), "pi-teams-e2e-nested-"));

  for (const d of [".pi/agents", ".pi/teams", ".pi/skills", ".pi/knowledge/project", ".pi/knowledge/general"]) {
    await mkdir(join(dir, d), { recursive: true });
  }
  const sessionDir = join(dir, ".pi", "sessions", "e2e");
  await mkdir(sessionDir, { recursive: true });

  await writeFile(join(dir, ".pi", "skills", "e2e.md"), "# E2E Skill\nFollow instructions exactly.");

  // Team: orchestrator → eng-lead → writer
  await writeFile(
    join(dir, ".pi", "teams", "teams.md"),
    `---
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
  );

  const outputPath = join(dir, "output.txt");

  await writeFile(
    join(dir, ".pi", "agents", "orchestrator.md"),
    agentMd({
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
    }),
  );

  await writeFile(
    join(dir, ".pi", "agents", "eng-lead.md"),
    agentMd({
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
    }),
  );

  await writeFile(
    join(dir, ".pi", "agents", "writer.md"),
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

  return { dir, sessionDir, outputPath, conversationLogPath: join(sessionDir, "conversation.jsonl") };
}

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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
      callerName: "orchestrator",
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
    const guidelinesBlock = guidelines.join("\n");

    const result = await runAgent({
      agentConfig: graph.orchestrator.config,
      task: 'Delegate to the engineering lead. Tell them to have the writer write "nested_e2e: lead_to_worker" to output.txt.',
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
