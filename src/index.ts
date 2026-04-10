import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ContextFile } from "pi-agents";
import {
  appendToLog,
  assembleSystemPrompt,
  discoverContextFiles,
  ensureLogExists,
  readFileSafe,
  runAgent,
} from "pi-agents";
import { parseTeamFile } from "./config/parser.js";
import { validateTeamConfig } from "./config/validator.js";
import { createDelegateTool } from "./delegate/create-delegate-tool.js";
import type { DelegateTarget } from "./delegate/targets.js";
import { extractTargets } from "./delegate/targets.js";
import { buildTargetsBlock } from "./delegate/variables.js";
import type { TeamGraph } from "./graph/builder.js";
import { buildTeamGraph } from "./graph/builder.js";
import { resolveAgents } from "./graph/resolver.js";
import { extractLastAssistantText } from "./helpers/extract-text.js";
import { renderFooter } from "./tui/render.js";
import { createFooterState } from "./tui/state.js";

export default function (pi: ExtensionAPI) {
  // Register theme path — resources_discover fires after session_start.
  // Theme is applied in before_agent_start (after pi loads the discovered paths).
  pi.on("resources_discover", async () => {
    const extDir = dirname(fileURLToPath(import.meta.url));
    return { themePaths: [join(extDir, "..", "themes")] };
  });

  // NOTE: pi guarantees session_start completes before before_agent_start fires,
  // so reads of these closure variables in before_agent_start are always after writes.
  let teamGraph: TeamGraph | undefined;
  let orchestratorTargets: ReadonlyArray<DelegateTarget> = [];
  // Mutable session ref — lazily initialized on first user message.
  // The delegate tool closure reads from this object at execution time.
  const sessionRef = { conversationLogPath: "", sessionDir: "" };
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

      // Discover shared context files (AGENTS.md, CLAUDE.md)
      sharedContextFiles = await discoverContextFiles({ cwd: ctx.cwd });

      // Footer state — wired to tui.requestRender after setFooter runs
      let requestRender = () => {};
      const footerState = createFooterState({ onUpdate: () => requestRender() });

      // Register delegate tool for the Orchestrator
      const delegateTool = createDelegateTool({
        callerName: teamGraph.orchestrator.config.frontmatter.name,
        targets: orchestratorTargets,
        session: sessionRef,
        cwd: ctx.cwd,
        modelRegistry: ctx.modelRegistry,
        runAgentFn: runAgent,
        sharedContext: sharedContextFiles,
        footerState,
        agents: resolved.agents,
      });
      pi.registerTool(delegateTool);

      // Persistent footer showing the team tree with live status
      const graph = teamGraph;
      ctx.ui.setFooter((tui, theme) => {
        requestRender = () => tui.requestRender();
        const interval = setInterval(() => {
          if (footerState.hasRunning()) tui.requestRender();
        }, 80);
        return {
          render: (width) => renderFooter({ graph, state: footerState, theme, width }),
          invalidate() {},
          dispose: () => clearInterval(interval),
        };
      });

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

  let themeApplied = false;

  pi.on("before_agent_start", async (event, ctx) => {
    if (!teamGraph) return;

    // Apply theme once — must happen after resources_discover so pi knows the theme
    if (!themeApplied) {
      themeApplied = true;
      ctx.ui.setTheme("pi-teams-dark");
    }

    // Lazy session setup — only create on first user message (avoids empty dirs on restart)
    if (!sessionRef.conversationLogPath) {
      const sid = ctx.sessionManager.getSessionId();
      sessionRef.sessionDir = join(ctx.cwd, ".pi", "sessions", sid);
      sessionRef.conversationLogPath = join(sessionRef.sessionDir, "conversation.jsonl");
      await ensureLogExists(sessionRef.conversationLogPath);
    }

    const orch = teamGraph.orchestrator.config;
    const fm = orch.frontmatter;

    // Read orchestrator's skills and conversation log — parallel I/O
    // Knowledge files are NOT pre-loaded; agent reads them via read-knowledge tool
    // Read skill files — conversation log and knowledge are NOT pre-loaded (agents use tools)
    const skillResults = await Promise.all(fm.skills.map((s) => readFileSafe(join(ctx.cwd, s.path))));

    const skillContents = fm.skills.map((s, i) => ({
      name: s.path.split("/").pop()?.replace(".md", "") ?? s.path,
      when: s.when,
      content: skillResults[i] ?? "",
    }));

    // Assemble orchestrator system prompt with fresh content
    const systemPrompt = assembleSystemPrompt({
      agentConfig: orch,
      sessionDir: sessionRef.sessionDir,
      skillContents,
      extraVariables: { TEAMS_BLOCK: buildTargetsBlock(orchestratorTargets) },
      ...(sharedContextFiles.length > 0 ? { sharedContextContents: sharedContextFiles } : {}),
    });

    // Log user message to conversation log
    await appendToLog(sessionRef.conversationLogPath, {
      ts: new Date().toISOString(),
      from: "user",
      to: teamGraph.orchestrator.config.frontmatter.name,
      message: event.prompt,
    });

    return { systemPrompt };
  });

  pi.on("agent_end", async (event) => {
    if (!sessionRef.conversationLogPath || !teamGraph) return;

    const text = extractLastAssistantText(event.messages as unknown as ReadonlyArray<Record<string, unknown>>);
    if (text.trim()) {
      await appendToLog(sessionRef.conversationLogPath, {
        ts: new Date().toISOString(),
        from: teamGraph.orchestrator.config.frontmatter.name,
        to: "user",
        message: text,
      });
    }
  });
}
