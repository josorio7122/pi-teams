import type { AgentConfig } from "pi-agents";
import type { GraphNode } from "../graph/builder.js";

export type DelegateTarget = Readonly<{
  name: string;
  config: AgentConfig;
  consultWhen?: string | undefined;
  teamMembers?: ReadonlyArray<GraphNode> | undefined;
}>;

export function extractTargets(members: ReadonlyArray<GraphNode>): ReadonlyArray<DelegateTarget> {
  return members.map((node) => {
    if (node.type === "agent") {
      return {
        name: node.config.frontmatter.name,
        config: node.config,
        ...(node.consultWhen ? { consultWhen: node.consultWhen } : {}),
      };
    }

    return {
      name: node.lead.config.frontmatter.name,
      config: node.lead.config,
      teamMembers: node.members,
      ...(node.consultWhen ? { consultWhen: node.consultWhen } : {}),
    };
  });
}
