import type { AgentConfig } from "pi-agents";
import { describe, expect, it } from "vitest";
import type { TeamConfig } from "../config/parser.js";
import { buildTeamGraph } from "./builder.js";

function stubAgent(name: string): AgentConfig {
  return {
    frontmatter: {
      name,
      description: `${name} agent`,
      model: "anthropic/claude-sonnet-4-6",
      role: "worker",
      color: "#36f9f6",
      icon: "🔨",
      domain: [{ path: "src/", read: true, write: true, delete: false }],
      tools: ["read", "write"],
      skills: [{ path: ".pi/skills/test.md", when: "Always" }],
      knowledge: {
        project: {
          path: `.pi/knowledge/project/${name}.yaml`,
          description: "Project",
          updatable: true,
          "max-lines": 5000,
        },
        general: {
          path: `.pi/knowledge/general/${name}.yaml`,
          description: "General",
          updatable: true,
          "max-lines": 3000,
        },
      },
      conversation: { path: ".pi/sessions/{{SESSION_ID}}/conversation.jsonl" },
    },
    systemPrompt: `You are ${name}.`,
    filePath: `.pi/agents/${name}.md`,
    source: "project",
  };
}

function agentMap(...names: string[]) {
  return new Map(names.map((n) => [n, stubAgent(n)]));
}

describe("buildTeamGraph", () => {
  it("builds flat graph", () => {
    const config: TeamConfig = {
      paths: { agents: ".pi/agents/" },
      orchestrator: { agent: "orchestrator" },
      members: [{ agent: "builder" }, { agent: "reviewer" }],
    };
    const agents = agentMap("orchestrator", "builder", "reviewer");
    const graph = buildTeamGraph(config, agents);

    expect(graph.orchestrator.config.frontmatter.name).toBe("orchestrator");
    expect(graph.members).toHaveLength(2);
    const first = graph.members[0];
    expect(first?.type).toBe("agent");
    if (first?.type === "agent") {
      expect(first.config.frontmatter.name).toBe("builder");
    }
  });

  it("builds nested team graph", () => {
    const config: TeamConfig = {
      paths: { agents: ".pi/agents/" },
      orchestrator: { agent: "orchestrator" },
      members: [
        {
          team: "Engineering",
          color: "#ff6e96",
          lead: "eng-lead",
          "consult-when": "Code stuff",
          members: [{ agent: "frontend" }, { agent: "backend" }],
        },
      ],
    };
    const agents = agentMap("orchestrator", "eng-lead", "frontend", "backend");
    const graph = buildTeamGraph(config, agents);

    expect(graph.members).toHaveLength(1);
    const team = graph.members[0];
    expect(team?.type).toBe("team");
    if (team?.type === "team") {
      expect(team.name).toBe("Engineering");
      expect(team.color).toBe("#ff6e96");
      expect(team.consultWhen).toBe("Code stuff");
      expect(team.lead.config.frontmatter.name).toBe("eng-lead");
      expect(team.members).toHaveLength(2);
    }
  });

  it("builds mixed graph", () => {
    const config: TeamConfig = {
      paths: { agents: ".pi/agents/" },
      orchestrator: { agent: "orchestrator" },
      members: [{ agent: "architect" }, { team: "Eng", lead: "eng-lead", members: [{ agent: "builder" }] }],
    };
    const agents = agentMap("orchestrator", "architect", "eng-lead", "builder");
    const graph = buildTeamGraph(config, agents);

    expect(graph.members).toHaveLength(2);
    expect(graph.members[0]?.type).toBe("agent");
    expect(graph.members[1]?.type).toBe("team");
  });

  it("builds deep nested graph", () => {
    const config: TeamConfig = {
      paths: { agents: ".pi/agents/" },
      orchestrator: { agent: "orchestrator" },
      members: [
        {
          team: "Eng",
          lead: "eng-lead",
          members: [
            {
              team: "Frontend",
              lead: "fe-lead",
              members: [{ agent: "react-dev" }],
            },
          ],
        },
      ],
    };
    const agents = agentMap("orchestrator", "eng-lead", "fe-lead", "react-dev");
    const graph = buildTeamGraph(config, agents);

    const eng = graph.members[0];
    expect(eng?.type).toBe("team");
    if (eng?.type === "team") {
      const frontend = eng.members[0];
      expect(frontend?.type).toBe("team");
      if (frontend?.type === "team") {
        expect(frontend.lead.config.frontmatter.name).toBe("fe-lead");
        const dev = frontend.members[0];
        if (dev?.type === "agent") {
          expect(dev.config.frontmatter.name).toBe("react-dev");
        }
      }
    }
  });

  it("propagates consultWhen on flat agents", () => {
    const config: TeamConfig = {
      paths: { agents: ".pi/agents/" },
      orchestrator: { agent: "orchestrator" },
      members: [{ agent: "builder", "consult-when": "Implementation, code" }, { agent: "reviewer" }],
    };
    const agents = agentMap("orchestrator", "builder", "reviewer");
    const graph = buildTeamGraph(config, agents);

    const builder = graph.members[0];
    if (builder?.type === "agent") {
      expect(builder.consultWhen).toBe("Implementation, code");
    }
    const reviewer = graph.members[1];
    if (reviewer?.type === "agent") {
      expect(reviewer.consultWhen).toBeUndefined();
    }
  });

  it("throws a descriptive error when an agent is missing from the resolved map", () => {
    const config: TeamConfig = {
      paths: { agents: ".pi/agents/" },
      orchestrator: { agent: "orchestrator" },
      members: [{ agent: "missing-agent" }],
    };
    const agents = agentMap("orchestrator");
    expect(() => buildTeamGraph(config, agents)).toThrow(/Agent "missing-agent" not found in resolved agents map/);
  });

  it("requires lead on every team", () => {
    const config: TeamConfig = {
      paths: { agents: ".pi/agents/" },
      orchestrator: { agent: "orchestrator" },
      members: [{ team: "Eng", lead: "eng-lead", members: [{ agent: "dev-a" }, { agent: "dev-b" }] }],
    };
    const agents = agentMap("orchestrator", "eng-lead", "dev-a", "dev-b");
    const graph = buildTeamGraph(config, agents);

    const team = graph.members[0];
    expect(team?.type).toBe("team");
    if (team?.type === "team") {
      expect(team.lead.config.frontmatter.name).toBe("eng-lead");
      expect(team.members).toHaveLength(2);
    }
  });
});
