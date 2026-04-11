import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { runAgent } from "pi-agents";
import { parseTeamFile } from "../config/parser.js";
import { validateTeamConfig } from "../config/validator.js";
import { createDelegateTool } from "../delegate/create-delegate-tool.js";
import { buildDelegateGuidelines } from "../delegate/guidelines.js";
import { extractTargets } from "../delegate/targets.js";
import { buildTargetsBlock } from "../delegate/variables.js";
import { buildTeamGraph } from "../graph/builder.js";
import { resolveAgents } from "../graph/resolver.js";
import { createFooterState } from "../tui/state.js";

export function agentMd(p: {
  readonly name: string;
  readonly role: string;
  readonly tools: string;
  readonly body: string;
}) {
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
    write: false
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

export async function setupBaseProject(params: {
  readonly agents: ReadonlyArray<{
    readonly name: string;
    readonly role: string;
    readonly tools: string;
    readonly body: string;
  }>;
  readonly teamsMd: string;
}) {
  const dir = await mkdtemp(join(tmpdir(), "pi-teams-e2e-"));

  for (const d of [".pi/agents", ".pi/teams", ".pi/skills", ".pi/knowledge/project", ".pi/knowledge/general"]) {
    await mkdir(join(dir, d), { recursive: true });
  }

  for (const a of params.agents) {
    await writeFile(join(dir, ".pi/agents", `${a.name}.md`), agentMd(a));
  }

  await writeFile(join(dir, ".pi/teams/teams.md"), params.teamsMd);
  await writeFile(join(dir, ".pi/skills/e2e.md"), "---\n---\nTest skill.");

  for (const a of params.agents) {
    await writeFile(join(dir, `.pi/knowledge/project/${a.name}.yaml`), "");
    await writeFile(join(dir, `.pi/knowledge/general/${a.name}.yaml`), "");
  }

  return dir;
}

export async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function bootstrapTeam(params: {
  readonly dir: string;
  readonly sessionDir: string;
  readonly conversationLogPath: string;
  readonly modelRegistry: ModelRegistry;
  readonly callerName?: string;
}) {
  const teamsContent = await readFile(join(params.dir, ".pi", "teams", "teams.md"), "utf-8");
  const parsed = parseTeamFile(teamsContent);
  if (!parsed.ok) throw new Error(parsed.error);

  const validated = validateTeamConfig(parsed.value);
  if (!validated.ok) throw new Error(validated.errors.join(", "));

  const resolved = await resolveAgents({
    agentsDir: join(params.dir, parsed.value.paths.agents),
    names: validated.agentNames,
  });
  if (!resolved.ok) throw new Error(resolved.errors.join(", "));

  const graph = buildTeamGraph(parsed.value, resolved.agents);
  const targets = extractTargets(graph.members);
  const footerState = createFooterState({ onUpdate: () => {} });

  const callerName = params.callerName ?? graph.orchestrator.config.frontmatter.name;
  const delegateTool = createDelegateTool({
    callerName,
    targets,
    session: { conversationLogPath: params.conversationLogPath, sessionDir: params.sessionDir },
    cwd: params.dir,
    modelRegistry: params.modelRegistry,
    runAgentFn: runAgent,
    sharedContext: [],
    footerState,
    agents: resolved.agents,
  });

  const guidelines = buildDelegateGuidelines();
  const teamsBlock = buildTargetsBlock(targets);
  const guidelinesBlock = guidelines.join("\n");
  const extraVariables = {
    TEAMS_BLOCK: `## Available Agents\n${teamsBlock}\n\n## Delegation Guidelines\n${guidelinesBlock}`,
  };

  return { graph, delegateTool, extraVariables, footerState, resolved };
}
