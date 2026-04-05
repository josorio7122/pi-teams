import { describe, expect, it } from "vitest";
import { parseTeamFile } from "./parser.js";

const minimal = `---
paths:
  agents: .pi/agents/
orchestrator:
  agent: orchestrator
members:
  - agent: builder
---
`;

const nested = `---
paths:
  agents: .pi/agents/
orchestrator:
  agent: orchestrator
members:
  - lead: engineering-lead
    consult-when: Architecture, implementation
    members:
      - agent: frontend-dev
      - agent: backend-dev
---
`;

const mixed = `---
paths:
  agents: .pi/agents/
orchestrator:
  agent: orchestrator
members:
  - agent: architect
  - lead: engineering-lead
    members:
      - agent: builder
  - agent: code-reviewer
---
`;

const deepNested = `---
paths:
  agents: .pi/agents/
orchestrator:
  agent: orchestrator
members:
  - lead: eng-lead
    members:
      - lead: frontend-lead
        members:
          - agent: react-dev
      - agent: devops
---
`;

describe("parseTeamFile", () => {
  describe("happy path", () => {
    it("parses minimal flat config", () => {
      const result = parseTeamFile(minimal);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.paths.agents).toBe(".pi/agents/");
      expect(result.value.orchestrator.agent).toBe("orchestrator");
      expect(result.value.members).toEqual([{ agent: "builder" }]);
    });

    it("parses nested team config", () => {
      const result = parseTeamFile(nested);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.members).toHaveLength(1);
      const team = result.value.members[0]!;
      expect(team).toMatchObject({
        lead: "engineering-lead",
        "consult-when": "Architecture, implementation",
      });
      if (!("lead" in team)) return;
      expect(team.members).toEqual([{ agent: "frontend-dev" }, { agent: "backend-dev" }]);
    });

    it("parses mixed config", () => {
      const result = parseTeamFile(mixed);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.members).toHaveLength(3);
      expect(result.value.members[0]).toEqual({ agent: "architect" });
      expect(result.value.members[2]).toEqual({ agent: "code-reviewer" });
    });

    it("parses consult-when on flat agent", () => {
      const result = parseTeamFile(`---
paths:
  agents: .pi/agents/
orchestrator:
  agent: orchestrator
members:
  - agent: architect
    consult-when: Design decisions, technical planning
---`);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const member = result.value.members[0]!;
      expect(member).toMatchObject({ agent: "architect", "consult-when": "Design decisions, technical planning" });
    });

    it("parses deep nested config", () => {
      const result = parseTeamFile(deepNested);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const eng = result.value.members[0]!;
      if (!("lead" in eng)) return;
      expect(eng.members).toHaveLength(2);
      const frontend = eng.members[0]!;
      if (!("lead" in frontend)) return;
      expect(frontend.lead).toBe("frontend-lead");
      expect(frontend.members).toEqual([{ agent: "react-dev" }]);
    });
  });

  describe("errors", () => {
    it("rejects empty content", () => {
      const result = parseTeamFile("");
      expect(result.ok).toBe(false);
    });

    it("rejects missing frontmatter", () => {
      const result = parseTeamFile("just some text");
      expect(result.ok).toBe(false);
    });

    it("rejects missing paths", () => {
      const result = parseTeamFile(`---
orchestrator:
  agent: orchestrator
members:
  - agent: builder
---`);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain("paths");
    });

    it("rejects missing orchestrator", () => {
      const result = parseTeamFile(`---
paths:
  agents: .pi/agents/
members:
  - agent: builder
---`);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain("orchestrator");
    });

    it("rejects missing members", () => {
      const result = parseTeamFile(`---
paths:
  agents: .pi/agents/
orchestrator:
  agent: orchestrator
---`);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain("members");
    });

    it("rejects team without lead", () => {
      const result = parseTeamFile(`---
paths:
  agents: .pi/agents/
orchestrator:
  agent: orchestrator
members:
  - members:
      - agent: builder
---`);
      expect(result.ok).toBe(false);
    });

    it("rejects empty members", () => {
      const result = parseTeamFile(`---
paths:
  agents: .pi/agents/
orchestrator:
  agent: orchestrator
members: []
---`);
      expect(result.ok).toBe(false);
    });
  });
});
