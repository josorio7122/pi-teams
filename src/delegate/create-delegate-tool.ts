import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import type { RunAgentParams, RunAgentResult } from "pi-agents";
import { appendToLog } from "pi-agents";
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
}>;

const DelegateParams = Type.Object({
  target: Type.String({ description: "Agent name to delegate to" }),
  task: Type.String({ description: "The task or question to delegate" }),
});

type DelegateInput = Static<typeof DelegateParams>;

export function createDelegateTool(params: CreateDelegateToolParams): ToolDefinition<typeof DelegateParams> {
  const { callerName, targets, conversationLogPath, cwd, sessionDir, modelRegistry, runAgentFn, sharedContext } =
    params;

  return {
    name: "delegate",
    label: "Delegate",
    description: "Delegate a task to a specialized agent or team lead.",
    promptSnippet: "Delegate tasks to specialized agents by name",
    promptGuidelines: [...buildDelegateGuidelines(targets)],
    parameters: DelegateParams,

    // biome-ignore lint/complexity/useMaxParams: implements Pi's ToolDefinition.execute (5 positional params)
    async execute(_toolCallId, toolParams: DelegateInput, signal, _onUpdate, _ctx) {
      const match = targets.find((t) => t.name === toolParams.target);
      if (!match) {
        const available = targets.map((t) => `"${t.name}"`).join(", ");
        throw new Error(`Unknown delegate target "${toolParams.target}". Available: ${available}`);
      }

      // Write delegation entry to shared conversation ledger.
      // NOTE: appendFile writes are atomic for single lines under the OS page size,
      // so concurrent delegations will not corrupt individual JSON lines. However,
      // parallel delegation may interleave entry order in the log file.
      await appendToLog(conversationLogPath, {
        ts: new Date().toISOString(),
        from: callerName,
        to: toolParams.target,
        message: toolParams.task,
        type: "delegation",
      });

      // Build extraVariables for the target
      const extraVariables: Readonly<Record<string, string>> =
        match.leadsTeam && match.teamMembers
          ? { TEAM_MEMBERS_BLOCK: buildTargetsBlock(extractTargets(match.teamMembers)) }
          : {};

      // Build customTools if the target has delegate in its tools (it's a lead)
      const targetHasDelegate = match.config.frontmatter.tools?.includes("delegate") ?? false;
      const customTools =
        targetHasDelegate && match.teamMembers
          ? [
              createDelegateTool({
                callerName: match.name,
                targets: extractTargets(match.teamMembers),
                conversationLogPath,
                cwd,
                sessionDir,
                modelRegistry,
                runAgentFn,
                sharedContext,
              }),
            ]
          : undefined;

      const runParams: RunAgentParams = {
        agentConfig: match.config,
        task: toolParams.task,
        caller: callerName,
        cwd,
        sessionDir,
        conversationLogPath,
        modelRegistry,
        ...(signal ? { signal } : {}),
        ...(Object.keys(extraVariables).length > 0 ? { extraVariables } : {}),
        ...(customTools ? { customTools } : {}),
        ...(sharedContext.length > 0 ? { sharedContext } : {}),
      };

      const result = await runAgentFn(runParams);

      return {
        content: [{ type: "text", text: result.output }],
        details: { metrics: result.metrics, error: result.error },
      };
    },
  };
}
