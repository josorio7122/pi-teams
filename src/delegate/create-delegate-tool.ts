import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { RunAgentResult } from "pi-agents";
import { buildDelegateGuidelines } from "./guidelines.js";
import type { DelegateTarget } from "./targets.js";
import { extractTargets } from "./targets.js";
import { buildTeamMembersBlock } from "./variables.js";

type RunAgentFn = (params: Record<string, unknown>) => Promise<RunAgentResult>;

type CreateDelegateToolParams = Readonly<{
  callerName: string;
  targets: ReadonlyArray<DelegateTarget>;
  conversationLogPath: string;
  cwd: string;
  sessionDir: string;
  modelRegistry: ModelRegistry;
  runAgentFn: RunAgentFn;
}>;

type DelegateTool = Readonly<{
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: ReadonlyArray<string>;
  parameters: unknown;
  execute(
    toolCallId: string,
    params: { target: string; task: string },
    signal: AbortSignal | undefined,
    onUpdate: unknown,
  ): Promise<{ content: ReadonlyArray<{ type: string; text: string }>; details: Record<string, unknown> }>;
}>;

export function createDelegateTool(params: CreateDelegateToolParams): DelegateTool {
  const { callerName, targets, conversationLogPath, cwd, sessionDir, modelRegistry, runAgentFn } = params;

  return {
    name: "delegate",
    label: "Delegate",
    description: "Delegate a task to a specialized agent or team lead.",
    promptSnippet: "Delegate tasks to specialized agents by name",
    promptGuidelines: buildDelegateGuidelines(targets),
    parameters: Type.Object({
      target: Type.String({ description: "Agent name to delegate to" }),
      task: Type.String({ description: "The task or question to delegate" }),
    }),

    // biome-ignore lint/complexity/useMaxParams: implements Pi's ToolDefinition.execute (4 positional params)
    async execute(_toolCallId, toolParams, signal, _onUpdate) {
      const match = targets.find((t) => t.name === toolParams.target);
      if (!match) {
        const available = targets.map((t) => `"${t.name}"`).join(", ");
        throw new Error(`Unknown delegate target "${toolParams.target}". Available: ${available}`);
      }

      // Build extraVariables for the target
      const extraVariables: Record<string, string> = {};
      if (match.leadsTeam && match.teamMembers) {
        const memberTargets = extractTargets(match.teamMembers);
        extraVariables.TEAM_MEMBERS_BLOCK = buildTeamMembersBlock(memberTargets);
      }

      // Build customTools if the target has delegate in its tools (it's a lead)
      const targetHasDelegate = match.config.frontmatter.tools.includes("delegate");
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
              }),
            ]
          : undefined;

      const result = await runAgentFn({
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
      });

      return {
        content: [{ type: "text", text: result.output }],
        details: { metrics: result.metrics, error: result.error },
      };
    },
  };
}
