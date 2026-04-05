import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ContextFile } from "pi-agents";
import { assembleSystemPrompt, discoverContextFiles, ensureLogExists, readFileSafe, runAgent } from "pi-agents";
import { parseTeamFile } from "./config/parser.js";
import { validateTeamConfig } from "./config/validator.js";
import { createDelegateTool } from "./delegate/create-delegate-tool.js";
import type { DelegateTarget } from "./delegate/targets.js";
import { extractTargets } from "./delegate/targets.js";
import { buildTargetsBlock } from "./delegate/variables.js";
import type { TeamGraph } from "./graph/builder.js";
import { buildTeamGraph } from "./graph/builder.js";
import { resolveAgents } from "./graph/resolver.js";

export default function (pi: ExtensionAPI) {
  // NOTE: pi guarantees session_start completes before before_agent_start fires,
  // so reads of these closure variables in before_agent_start are always after writes.
  let teamGraph: TeamGraph | undefined;
  let orchestratorTargets: ReadonlyArray<DelegateTarget> = [];
  let conversationLogPath: string | undefined;
  let sessionDir: string | undefined;
  let sharedContextFiles: ReadonlyArray<ContextFile> = [];

  pi.on("session_start", async (_event, ctx) => {
    // Read teams.md — if missing, extension is inactive
    const teamsPath = join(ctx.cwd, ".pi", "teams", "teams.md");
    let teamsContent: string;
    try {
      teamsContent = await readFile(teamsPath, "utf-8");
    } catch {
      return;
    }

    try {
      // Phase 1: Parse and validate team config
      const parsed = parseTeamFile(teamsContent);
      if (!parsed.ok) {
        ctx.ui.notify(`[pi-teams] Config error: ${parsed.error}`, "error");
        return;
      }

      const validated = validateTeamConfig(parsed.value);
      if (!validated.ok) {
        for (const err of validated.errors) {
          ctx.ui.notify(`[pi-teams] ${err}`, "error");
        }
        return;
      }

      // Phase 2: Resolve all agents from disk
      const agentsDir = join(ctx.cwd, parsed.value.paths.agents);
      const resolved = await resolveAgents({ agentsDir, names: validated.agentNames });
      if (!resolved.ok) {
        for (const err of resolved.errors) {
          ctx.ui.notify(`[pi-teams] ${err}`, "error");
        }
        return;
      }

      // Phase 3: Build team graph
      teamGraph = buildTeamGraph(parsed.value, resolved.agents);
      orchestratorTargets = extractTargets(teamGraph.members);

      // Session setup
      const sid = randomUUID();
      sessionDir = join(ctx.cwd, ".pi", "sessions", sid);
      conversationLogPath = join(sessionDir, "conversation.jsonl");
      await ensureLogExists(conversationLogPath);

      // Discover shared context files (AGENTS.md, CLAUDE.md)
      sharedContextFiles = await discoverContextFiles({ cwd: ctx.cwd });

      // Register delegate tool for the Orchestrator
      const delegateTool = createDelegateTool({
        callerName: teamGraph.orchestrator.config.frontmatter.name,
        targets: orchestratorTargets,
        conversationLogPath,
        cwd: ctx.cwd,
        sessionDir,
        modelRegistry: ctx.modelRegistry,
        runAgentFn: runAgent,
        sharedContext: sharedContextFiles,
      });
      pi.registerTool(delegateTool);

      // Restrict tools to only what the orchestrator is configured for
      pi.setActiveTools(teamGraph.orchestrator.config.frontmatter.tools ?? []);

      const agentCount = validated.agentNames.length;
      const teamCount = orchestratorTargets.filter((t) => t.teamMembers).length;
      ctx.ui.notify(`[pi-teams] ${agentCount} agents, ${teamCount} teams loaded`, "info");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.ui.notify(`[pi-teams] Unexpected error during session start: ${message}`, "error");
    }
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    if (!teamGraph || !sessionDir || !conversationLogPath) return;

    const orch = teamGraph.orchestrator.config;
    const fm = orch.frontmatter;

    // Read orchestrator's skills, knowledge, and conversation log — parallel I/O
    const [projectKnowledge, generalKnowledge, conversationLog, ...skillResults] = await Promise.all([
      readFileSafe(join(ctx.cwd, fm.knowledge.project.path)),
      readFileSafe(join(ctx.cwd, fm.knowledge.general.path)),
      readFileSafe(conversationLogPath),
      ...fm.skills.map((s) => readFileSafe(join(ctx.cwd, s.path))),
    ]);

    const skillContents = fm.skills.map((s, i) => ({
      name: s.path.split("/").pop()?.replace(".md", "") ?? s.path,
      when: s.when,
      content: skillResults[i] ?? "",
    }));

    // Assemble orchestrator system prompt with fresh content
    const systemPrompt = assembleSystemPrompt({
      agentConfig: orch,
      sessionDir,
      conversationLogContent: conversationLog,
      skillContents,
      projectKnowledgeContent: projectKnowledge,
      generalKnowledgeContent: generalKnowledge,
      extraVariables: { TEAMS_BLOCK: buildTargetsBlock(orchestratorTargets) },
      ...(sharedContextFiles.length > 0 ? { sharedContextContents: sharedContextFiles } : {}),
    });

    return { systemPrompt };
  });
}
