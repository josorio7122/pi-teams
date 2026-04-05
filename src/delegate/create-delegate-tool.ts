import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import type { AgentConfig, RunAgentParams, RunAgentResult } from "pi-agents";
import { appendToLog } from "pi-agents";
import { renderConversation } from "../tui/conversation.js";
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
    onUpdate: (metrics) => {
      tp.footerState.updateMetrics({ name: match.config.frontmatter.name, metrics });
    },
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

    renderCall(args, theme) {
      const events: ConversationEvent[] = [{ type: "delegation", from: callerName, to: args.target, task: args.task }];
      return renderConversation({ events, agents: params.agents, theme });
    },

    // biome-ignore lint/complexity/useMaxParams: implements Pi's ToolDefinition.renderResult (4 positional params)
    renderResult(result, options, theme) {
      // Skip first event (delegation) — renderCall already shows it.
      const all = (result.details as { events?: ReadonlyArray<ConversationEvent> })?.events ?? [];
      let events = all.slice(1);

      if (options.isPartial) {
        // Show a pending box for the agent that's currently working
        const lastEvent = all[all.length - 1];
        if (lastEvent?.type === "delegation") {
          const status = footerState.get(lastEvent.to);
          const phase = status.status === "running" && status.metrics ? "working" : "initializing";
          const dots = ".".repeat((Math.floor(Date.now() / 500) % 3) + 1);
          events = [...events, { type: "response", agent: lastEvent.to, output: `${phase}${dots}` }];
        }
      } else {
        // Final render: drop orphaned delegations (no matching response, e.g. abort)
        const responded = new Set(events.filter((e) => e.type === "response").map((e) => e.agent));
        events = events.filter((e) => e.type !== "delegation" || responded.has(e.to));
      }

      return renderConversation({ events, agents: params.agents, theme });
    },

    // biome-ignore lint/complexity/useMaxParams: implements Pi's ToolDefinition.execute (5 positional params)
    async execute(_toolCallId, toolParams: DelegateInput, signal: AbortSignal | undefined, onUpdate, _ctx) {
      // Bail immediately if already cancelled
      if (signal?.aborted) throw new Error("Delegation cancelled");

      const match = targets.find((t) => t.name === toolParams.target);
      if (!match) {
        const available = targets.map((t) => `"${t.name}"`).join(", ");
        throw new Error(`Unknown delegate target "${toolParams.target}". Available: ${available}`);
      }

      // Record delegation event for conversation view
      const scopeStart = footerState.getEvents().length;
      footerState.addEvent({ type: "delegation", from: callerName, to: toolParams.target, task: toolParams.task });
      footerState.setRunning(toolParams.target);

      // Subscribe to footerState changes so nested events trigger re-renders
      const unsubscribe = footerState.subscribe(() => {
        const scopeEvents = footerState.getEvents().slice(scopeStart);
        onUpdate?.({
          content: [{ type: "text", text: "" }],
          details: { events: scopeEvents },
        });
      });

      await appendToLog(conversationLogPath, {
        ts: new Date().toISOString(),
        from: callerName,
        to: toolParams.target,
        message: toolParams.task,
        type: "delegation",
      });

      const runParams = buildRunParams({ match, task: toolParams.task, signal, toolParams: params });

      let result: Awaited<ReturnType<RunAgentFn>>;
      try {
        result = await runAgentFn(runParams);
      } catch (err) {
        unsubscribe();
        const message = err instanceof Error ? err.message : String(err);
        footerState.setError({ name: toolParams.target, error: message });
        throw err;
      }
      unsubscribe();

      if (result.error) {
        footerState.setError({ name: toolParams.target, error: result.error, metrics: result.metrics });
      } else {
        footerState.setDone({ name: toolParams.target, metrics: result.metrics });
      }

      // Record response event for conversation view
      footerState.addEvent({ type: "response", agent: toolParams.target, output: result.output });
      const scopeEvents = footerState.getEvents().slice(scopeStart);

      return {
        content: [{ type: "text", text: result.output }],
        details: { metrics: result.metrics, error: result.error, events: scopeEvents },
      };
    },
  };
}
