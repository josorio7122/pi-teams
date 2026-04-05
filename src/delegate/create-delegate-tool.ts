import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Container } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import type { AgentConfig, RunAgentParams, RunAgentResult } from "pi-agents";
import { appendToLog } from "pi-agents";
import { renderConversation } from "../tui/conversation.js";
import type { RenderTheme } from "../tui/render.js";
import type { ConversationEvent, FooterState } from "../tui/state.js";
import { buildDelegateGuidelines } from "./guidelines.js";
import type { DelegateTarget } from "./targets.js";
import { extractTargets } from "./targets.js";
import { buildTargetsBlock } from "./variables.js";

type RunAgentFn = (params: RunAgentParams) => Promise<RunAgentResult>;

type CreateDelegateToolParams = Readonly<{
  callerName: string;
  targets: ReadonlyArray<DelegateTarget>;
  conversationLogPath: string;
  cwd: string;
  sessionDir: string;
  modelRegistry: RunAgentParams["modelRegistry"];
  runAgentFn: RunAgentFn;
  sharedContext: NonNullable<RunAgentParams["sharedContext"]>;
  footerState: FooterState;
  agents: ReadonlyMap<string, AgentConfig>;
  setWidget: (key: string, content: unknown) => void;
  sendMessage: (message: { customType: string; content: string; display: boolean; details: unknown }) => void;
}>;

const DelegateParams = Type.Object({
  target: Type.String({ description: "Agent name to delegate to" }),
  task: Type.String({ description: "The task or question to delegate" }),
});

type DelegateInput = Static<typeof DelegateParams>;

function buildRunParams(params: {
  readonly match: DelegateTarget;
  readonly task: string;
  readonly signal: AbortSignal | undefined;
  readonly toolParams: CreateDelegateToolParams;
}): RunAgentParams {
  const { match, task, signal, toolParams: tp } = params;
  const extraVariables: Readonly<Record<string, string>> = match.teamMembers
    ? { TEAM_MEMBERS_BLOCK: buildTargetsBlock(extractTargets(match.teamMembers)) }
    : {};

  const targetHasDelegate = match.config.frontmatter.tools?.includes("delegate") ?? false;
  const customTools =
    targetHasDelegate && match.teamMembers
      ? [createDelegateTool({ ...tp, callerName: match.name, targets: extractTargets(match.teamMembers) })]
      : undefined;

  return {
    agentConfig: match.config,
    task,
    caller: tp.callerName,
    cwd: tp.cwd,
    sessionDir: tp.sessionDir,
    conversationLogPath: tp.conversationLogPath,
    modelRegistry: tp.modelRegistry,
    ...(signal ? { signal } : {}),
    ...(Object.keys(extraVariables).length > 0 ? { extraVariables } : {}),
    ...(customTools ? { customTools } : {}),
    ...(tp.sharedContext.length > 0 ? { sharedContext: tp.sharedContext } : {}),
  };
}

export function createDelegateTool(params: CreateDelegateToolParams): ToolDefinition<typeof DelegateParams> {
  const { callerName, targets, conversationLogPath, runAgentFn, footerState } = params;

  return {
    name: "delegate",
    label: "Delegate",
    description: "Delegate a task to a specialized agent or team lead.",
    promptSnippet: "Delegate tasks to specialized agents by name",
    promptGuidelines: [...buildDelegateGuidelines(targets)],
    parameters: DelegateParams,

    renderCall() {
      return new Container(); // Widget handles real-time display
    },

    // biome-ignore lint/complexity/useMaxParams: implements Pi's ToolDefinition.renderResult (4 positional params)
    renderResult(_result, _options, _theme) {
      return new Container(); // Custom message handles permanent display
    },

    // biome-ignore lint/complexity/useMaxParams: implements Pi's ToolDefinition.execute (5 positional params)
    async execute(_toolCallId, toolParams: DelegateInput, signal: AbortSignal | undefined, _onUpdate, _ctx) {
      // Bail immediately if already cancelled
      if (signal?.aborted) throw new Error("Delegation cancelled");

      const match = targets.find((t) => t.name === toolParams.target);
      if (!match) {
        const available = targets.map((t) => `"${t.name}"`).join(", ");
        throw new Error(`Unknown delegate target "${toolParams.target}". Available: ${available}`);
      }

      // Record delegation event
      const scopeStart = footerState.getEvents().length;
      footerState.addEvent({ type: "delegation", from: callerName, to: toolParams.target, task: toolParams.task });

      // Show widget with delegation block + pending response box
      const targetName = toolParams.target;
      const showPending = (phase: "initializing" | "working") => {
        const events = footerState.getEvents().slice(scopeStart);
        params.setWidget("pi-teams-conv", (_tui: unknown, theme: RenderTheme) => {
          const dots = ".".repeat((Math.floor(Date.now() / 500) % 3) + 1);
          const pending: ConversationEvent = { type: "response", agent: targetName, output: `${phase}${dots}` };
          const comp = renderConversation({ events: [...events, pending], agents: params.agents, theme });
          return { render: (w: number) => comp.render(w), invalidate: () => comp.invalidate() };
        });
      };
      showPending("initializing");

      footerState.setRunning(toolParams.target);

      await appendToLog(conversationLogPath, {
        ts: new Date().toISOString(),
        from: callerName,
        to: toolParams.target,
        message: toolParams.task,
        type: "delegation",
      });

      // Switch to "working." phase
      showPending("working");

      const runParams = buildRunParams({ match, task: toolParams.task, signal, toolParams: params });

      let result: Awaited<ReturnType<RunAgentFn>>;
      try {
        result = await runAgentFn(runParams);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        footerState.setError({ name: toolParams.target, error: message });
        params.setWidget("pi-teams-conv", undefined);
        throw err;
      }

      if (result.error) {
        footerState.setError({ name: toolParams.target, error: result.error, metrics: result.metrics });
      } else {
        footerState.setDone({ name: toolParams.target, metrics: result.metrics });
      }

      // Record response event
      footerState.addEvent({ type: "response", agent: toolParams.target, output: result.output });
      const scopeEvents = footerState.getEvents().slice(scopeStart);

      // Clear widget, inject permanent custom message
      params.setWidget("pi-teams-conv", undefined);
      params.sendMessage({
        customType: "pi-teams-conversation",
        content: "delegation",
        display: true,
        details: { events: scopeEvents },
      });

      return {
        content: [{ type: "text", text: result.output }],
        details: { metrics: result.metrics, error: result.error },
      };
    },
  };
}
