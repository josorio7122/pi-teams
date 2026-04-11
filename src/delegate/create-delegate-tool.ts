import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { isRecord } from "pi-agents";
import type { AgentConfig, ConversationEvent, RunAgentParams, RunAgentResult } from "pi-agents";
import { buildFinalEvents, buildPartialEvents, renderConversation } from "pi-agents";
import type { FooterState } from "../tui/state.js";
import { buildDelegateGuidelines } from "./guidelines.js";
import type { DelegateTarget } from "./targets.js";
import { extractTargets } from "./targets.js";
import { buildTargetsBlock } from "./variables.js";

type RunAgentFn = (params: RunAgentParams) => Promise<RunAgentResult>;

type CreateDelegateToolParams = Readonly<{
  callerName: string;
  targets: ReadonlyArray<DelegateTarget>;
  session: Readonly<{ conversationLogPath: string; sessionDir: string }>;
  cwd: string;
  modelRegistry: RunAgentParams["modelRegistry"];
  runAgentFn: RunAgentFn;
  sharedContext: NonNullable<RunAgentParams["sharedContext"]>;
  footerState: FooterState;
  agents: ReadonlyMap<string, AgentConfig>;
  parentScopeId?: number;
}>;

const DelegateParams = Type.Object({
  target: Type.String({ description: "Agent name to delegate to" }),
  task: Type.String({ description: "The task or question to delegate" }),
});

type DelegateInput = Static<typeof DelegateParams>;

function getDelegateEvents(details: unknown): ReadonlyArray<ConversationEvent> {
  if (!isRecord(details)) return [];
  return Array.isArray(details.events) ? (details.events as ReadonlyArray<ConversationEvent>) : [];
}

function buildRunParams(params: {
  readonly match: DelegateTarget;
  readonly task: string;
  readonly signal: AbortSignal | undefined;
  readonly toolParams: CreateDelegateToolParams;
  readonly emitPartial?: () => void;
  readonly scopeId: number;
}): RunAgentParams {
  const { match, task, signal, toolParams: tp, scopeId } = params;
  const extraVariables = match.teamMembers
    ? { TEAM_MEMBERS_BLOCK: buildTargetsBlock(extractTargets(match.teamMembers)) }
    : undefined;

  const targetHasDelegate = match.config.frontmatter.tools?.includes("delegate") ?? false;
  const customTools =
    targetHasDelegate && match.teamMembers
      ? [
          createDelegateTool({
            ...tp,
            callerName: match.name,
            targets: extractTargets(match.teamMembers),
            parentScopeId: scopeId,
          }),
        ]
      : undefined;

  return {
    agentConfig: match.config,
    task,
    caller: tp.callerName,
    cwd: tp.cwd,
    sessionDir: tp.session.sessionDir,
    conversationLogPath: tp.session.conversationLogPath,
    modelRegistry: tp.modelRegistry,
    signal,
    extraVariables,
    customTools,
    sharedContext: tp.sharedContext.length > 0 ? tp.sharedContext : undefined,
    onUpdate: (metrics) => {
      tp.footerState.updateMetrics({ name: match.config.frontmatter.name, metrics });
      params.emitPartial?.();
    },
  };
}

export function createDelegateTool(params: CreateDelegateToolParams): ToolDefinition<typeof DelegateParams> {
  const { callerName, targets, runAgentFn, footerState } = params;

  return {
    name: "delegate",
    label: "Delegate",
    description: "Delegate a task to a specialized agent or team lead.",
    promptSnippet: "Delegate tasks to specialized agents by name",
    promptGuidelines: [...buildDelegateGuidelines()],
    parameters: DelegateParams,

    renderCall(args, theme) {
      const events: ConversationEvent[] = [{ type: "delegation", from: callerName, to: args.target, task: args.task }];
      return renderConversation({ events, agents: params.agents, theme });
    },

    // biome-ignore lint/complexity/useMaxParams: implements Pi's ToolDefinition.renderResult (3 positional params)
    renderResult(result, options, theme) {
      const all = getDelegateEvents(result.details);
      const tail = all.slice(1);

      const events = options.isPartial
        ? buildPartialEvents({ events: tail, getStatus: (name) => footerState.get(name) })
        : buildFinalEvents(tail);

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

      // Create a scope for this execution to isolate events from sibling delegates
      const scopeId = footerState.nextScopeId(params.parentScopeId);

      // Subscribe BEFORE adding events so the first event triggers onUpdate
      const emitPartial = () => {
        const scopeEvents = footerState.getEventsForScope(scopeId);
        onUpdate?.({
          content: [{ type: "text", text: "" }],
          details: { events: scopeEvents },
        });
      };
      const unsubscribe = footerState.subscribe(emitPartial);

      footerState.addEvent({
        type: "delegation",
        from: callerName,
        to: toolParams.target,
        task: toolParams.task,
        _scopeId: scopeId,
      });
      footerState.setRunning(toolParams.target);

      const runParams = buildRunParams({
        match,
        task: toolParams.task,
        signal,
        toolParams: params,
        emitPartial,
        scopeId,
      });

      // Animate pending box dots (cycle every 500ms)
      const animationInterval = setInterval(emitPartial, 500);

      let result: Awaited<ReturnType<RunAgentFn>>;
      try {
        result = await runAgentFn(runParams);
      } catch (err) {
        clearInterval(animationInterval);
        unsubscribe();
        const message = err instanceof Error ? err.message : String(err);
        footerState.setError({ name: toolParams.target, error: message });
        throw err;
      }
      clearInterval(animationInterval);
      unsubscribe();

      if (result.error) {
        footerState.setError({ name: toolParams.target, error: result.error, metrics: result.metrics });
      } else {
        footerState.setDone({ name: toolParams.target, metrics: result.metrics });
      }

      // Record response event for conversation view
      footerState.addEvent({ type: "response", agent: toolParams.target, output: result.output, _scopeId: scopeId });
      const scopeEvents = footerState.getEventsForScope(scopeId);

      return {
        content: [{ type: "text", text: result.output }],
        details: { metrics: result.metrics, error: result.error, events: scopeEvents },
      };
    },
  };
}
