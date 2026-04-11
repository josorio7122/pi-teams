import { describe, expect, it } from "vitest";
import type { AgentNode, GraphNode, TeamNode } from "../graph/builder.js";
import { stubConfig } from "../test-helpers.js";
import { extractTargets } from "./targets.js";

function agentNode(name: string, consultWhen?: string): AgentNode {
  return consultWhen
    ? { type: "agent", config: stubConfig(name), consultWhen }
    : { type: "agent", config: stubConfig(name) };
}

function teamNode(params: { leadName: string; members: GraphNode[]; consultWhen?: string }): TeamNode {
  return {
    type: "team",
    lead: agentNode(params.leadName),
    members: params.members,
    ...(params.consultWhen ? { consultWhen: params.consultWhen } : {}),
  };
}

describe("extractTargets", () => {
  it("extracts flat agents as targets", () => {
    const members: GraphNode[] = [agentNode("builder", "Implementation"), agentNode("reviewer")];
    const targets = extractTargets(members);

    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({ name: "builder", consultWhen: "Implementation" });
    expect(targets[1]).toMatchObject({ name: "reviewer" });
    expect(targets[1]!.consultWhen).toBeUndefined();
  });

  it("extracts team leads as targets", () => {
    const members: GraphNode[] = [
      teamNode({
        leadName: "eng-lead",
        members: [agentNode("frontend"), agentNode("backend")],
        consultWhen: "Code, APIs",
      }),
    ];
    const targets = extractTargets(members);

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      name: "eng-lead",
      consultWhen: "Code, APIs",
    });
    expect(targets[0]!.teamMembers).toBeDefined();
    expect(targets[0]!.config.frontmatter.name).toBe("eng-lead");
  });

  it("extracts mixed flat + team targets", () => {
    const members: GraphNode[] = [
      agentNode("architect", "Design"),
      teamNode({
        leadName: "eng-lead",
        members: [agentNode("dev")],
        consultWhen: "Implementation",
      }),
      agentNode("reviewer", "Reviews"),
    ];
    const targets = extractTargets(members);

    expect(targets).toHaveLength(3);
    expect(targets[0]!.name).toBe("architect");
    expect(targets[1]!.name).toBe("eng-lead");
    expect(targets[1]!.teamMembers).toBeDefined();
    expect(targets[2]!.name).toBe("reviewer");
  });

  it("includes teamMembers for team targets", () => {
    const devs = [agentNode("frontend"), agentNode("backend")];
    const members: GraphNode[] = [teamNode({ leadName: "eng-lead", members: devs })];
    const targets = extractTargets(members);

    expect(targets[0]!.teamMembers).toHaveLength(2);
  });

  it("returns empty array for empty members", () => {
    expect(extractTargets([])).toEqual([]);
  });

  it("handles nested teams (team containing team members)", () => {
    const members: GraphNode[] = [
      teamNode({
        leadName: "eng-lead",
        members: [
          agentNode("dev"),
          teamNode({
            leadName: "fe-lead",
            members: [agentNode("designer"), agentNode("stylist")],
            consultWhen: "Frontend work",
          }),
        ],
        consultWhen: "Engineering",
      }),
    ];
    const targets = extractTargets(members);

    expect(targets).toHaveLength(1);
    expect(targets[0]!.name).toBe("eng-lead");
    expect(targets[0]!.consultWhen).toBe("Engineering");
    expect(targets[0]!.teamMembers).toHaveLength(2);

    // The nested team is preserved as a GraphNode for recursive extraction
    const nestedTeam = targets[0]!.teamMembers![1]!;
    expect(nestedTeam.type).toBe("team");
    if (nestedTeam.type === "team") {
      expect(nestedTeam.lead.config.frontmatter.name).toBe("fe-lead");
      expect(nestedTeam.members).toHaveLength(2);
    }
  });
});
