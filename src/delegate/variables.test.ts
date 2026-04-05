import { describe, expect, it } from "vitest";
import type { DelegateTarget } from "./targets.js";
import { buildTeamMembersBlock, buildTeamsBlock } from "./variables.js";

function target(name: string, opts?: { leadsTeam?: string; consultWhen?: string }): DelegateTarget {
  return {
    name,
    config: {} as DelegateTarget["config"],
    ...(opts?.leadsTeam ? { leadsTeam: opts.leadsTeam } : {}),
    ...(opts?.consultWhen ? { consultWhen: opts.consultWhen } : {}),
  };
}

describe("buildTeamsBlock", () => {
  it("formats flat agent targets", () => {
    const result = buildTeamsBlock([target("architect", { consultWhen: "Design decisions" })]);
    expect(result).toContain("name: architect");
    expect(result).toContain("consult-when: Design decisions");
    expect(result).not.toContain("leads:");
  });

  it("formats lead targets with team context", () => {
    const result = buildTeamsBlock([target("eng-lead", { leadsTeam: "Engineering", consultWhen: "Code, APIs" })]);
    expect(result).toContain("name: eng-lead");
    expect(result).toContain("leads: Engineering");
    expect(result).toContain("consult-when: Code, APIs");
  });

  it("formats mixed targets", () => {
    const result = buildTeamsBlock([
      target("architect", { consultWhen: "Design" }),
      target("eng-lead", { leadsTeam: "Engineering", consultWhen: "Code" }),
    ]);
    expect(result).toContain("name: architect");
    expect(result).toContain("name: eng-lead");
    expect(result).toContain("leads: Engineering");
  });

  it("omits consult-when when absent", () => {
    const result = buildTeamsBlock([target("scout")]);
    expect(result).toContain("name: scout");
    expect(result).not.toContain("consult-when");
  });
});

describe("buildTeamMembersBlock", () => {
  it("formats member targets", () => {
    const result = buildTeamMembersBlock([
      target("frontend-dev", { consultWhen: "UI, components" }),
      target("backend-dev", { consultWhen: "APIs, databases" }),
    ]);
    expect(result).toContain("name: frontend-dev");
    expect(result).toContain("consult-when: UI, components");
    expect(result).toContain("name: backend-dev");
    expect(result).toContain("consult-when: APIs, databases");
  });

  it("omits consult-when when absent", () => {
    const result = buildTeamMembersBlock([target("devops")]);
    expect(result).toContain("name: devops");
    expect(result).not.toContain("consult-when");
  });
});
