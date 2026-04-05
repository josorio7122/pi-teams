import { describe, expect, it } from "vitest";
import type { TeamConfig } from "./parser.js";
import { validateTeamConfig } from "./validator.js";

function flat(...agents: string[]): TeamConfig {
  return {
    paths: { agents: ".pi/agents/" },
    orchestrator: { agent: "orchestrator" },
    members: agents.map((a) => ({ agent: a })),
  };
}

describe("validateTeamConfig", () => {
  describe("happy path", () => {
    it("accepts flat config with unique agents", () => {
      const result = validateTeamConfig(flat("builder", "reviewer"));
      expect(result.ok).toBe(true);
    });

    it("accepts nested teams", () => {
      const result = validateTeamConfig({
        paths: { agents: ".pi/agents/" },
        orchestrator: { agent: "orchestrator" },
        members: [
          {
            team: "Engineering",
            lead: "eng-lead",
            members: [{ agent: "frontend-dev" }, { agent: "backend-dev" }],
          },
        ],
      });
      expect(result.ok).toBe(true);
    });

    it("accepts mixed flat agents and teams", () => {
      const result = validateTeamConfig({
        paths: { agents: ".pi/agents/" },
        orchestrator: { agent: "orchestrator" },
        members: [
          { agent: "architect" },
          {
            team: "Engineering",
            lead: "eng-lead",
            members: [{ agent: "builder" }],
          },
        ],
      });
      expect(result.ok).toBe(true);
    });

    it("accepts deep nesting", () => {
      const result = validateTeamConfig({
        paths: { agents: ".pi/agents/" },
        orchestrator: { agent: "orchestrator" },
        members: [
          {
            team: "Engineering",
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
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("duplicate agents", () => {
    it("rejects duplicate agent in flat members", () => {
      const result = validateTeamConfig(flat("builder", "builder"));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors[0]).toContain("builder");
      expect(result.errors[0]).toContain("duplicate");
    });

    it("rejects agent that duplicates the orchestrator", () => {
      const result = validateTeamConfig(flat("orchestrator"));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors[0]).toContain("orchestrator");
    });

    it("rejects duplicate across flat and nested", () => {
      const result = validateTeamConfig({
        paths: { agents: ".pi/agents/" },
        orchestrator: { agent: "orchestrator" },
        members: [
          { agent: "builder" },
          {
            team: "Engineering",
            lead: "eng-lead",
            members: [{ agent: "builder" }],
          },
        ],
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors[0]).toContain("builder");
    });

    it("rejects lead that duplicates a member", () => {
      const result = validateTeamConfig({
        paths: { agents: ".pi/agents/" },
        orchestrator: { agent: "orchestrator" },
        members: [
          {
            team: "Engineering",
            lead: "builder",
            members: [{ agent: "builder" }],
          },
        ],
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors[0]).toContain("builder");
    });
  });

  describe("duplicate team names", () => {
    it("rejects duplicate team names at same level", () => {
      const result = validateTeamConfig({
        paths: { agents: ".pi/agents/" },
        orchestrator: { agent: "orchestrator" },
        members: [
          { team: "Engineering", lead: "lead-a", members: [{ agent: "dev-a" }] },
          { team: "Engineering", lead: "lead-b", members: [{ agent: "dev-b" }] },
        ],
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors[0]).toContain("Engineering");
    });
  });

  describe("collects all agent names", () => {
    it("returns all unique agent names on success", () => {
      const result = validateTeamConfig({
        paths: { agents: ".pi/agents/" },
        orchestrator: { agent: "orchestrator" },
        members: [
          { agent: "architect" },
          {
            team: "Engineering",
            lead: "eng-lead",
            members: [{ agent: "builder" }, { agent: "reviewer" }],
          },
        ],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect([...result.agentNames].sort()).toEqual(["architect", "builder", "eng-lead", "orchestrator", "reviewer"]);
    });
  });
});
