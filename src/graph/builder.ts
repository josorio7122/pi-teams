import type { AgentConfig } from "pi-agents";
import type { TeamConfig } from "../config/parser.js";

export type AgentNode = Readonly<{
  type: "agent";
  config: AgentConfig;
  consultWhen?: string | undefined;
}>;

export type TeamNode = Readonly<{
  type: "team";
  consultWhen?: string | undefined;
  lead: AgentNode;
  members: ReadonlyArray<GraphNode>;
}>;

export type GraphNode = AgentNode | TeamNode;

export type TeamGraph = Readonly<{
  orchestrator: AgentNode;
  members: ReadonlyArray<GraphNode>;
}>;

function toAgentNode(params: {
  agents: ReadonlyMap<string, AgentConfig>;
  name: string;
  consultWhen?: string | undefined;
}): AgentNode {
  const { agents, name, consultWhen } = params;
  const config = agents.get(name);
  if (!config) throw new Error(`Agent "${name}" not found in resolved agents map`);
  return consultWhen ? { type: "agent", config, consultWhen } : { type: "agent", config };
}

function buildMembers(
  members: Readonly<TeamConfig["members"]>,
  agents: ReadonlyMap<string, AgentConfig>,
): ReadonlyArray<GraphNode> {
  return members.map((member) => {
    if ("agent" in member) {
      const cw = member["consult-when"];
      return cw
        ? toAgentNode({ agents, name: member.agent, consultWhen: cw })
        : toAgentNode({ agents, name: member.agent });
    }

    return {
      type: "team",
      ...(member["consult-when"] ? { consultWhen: member["consult-when"] } : {}),
      lead: toAgentNode({ agents, name: member.lead }),
      members: buildMembers(member.members, agents),
    } satisfies TeamNode;
  });
}

export function buildTeamGraph(config: TeamConfig, agents: ReadonlyMap<string, AgentConfig>): TeamGraph {
  return {
    orchestrator: toAgentNode({ agents, name: config.orchestrator.agent }),
    members: buildMembers(config.members, agents),
  };
}
