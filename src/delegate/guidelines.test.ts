import { describe, expect, it } from "vitest";
import { buildDelegateGuidelines } from "./guidelines.js";
import type { DelegateTarget } from "./targets.js";

function target(name: string, opts?: { leadsTeam?: string; consultWhen?: string }): DelegateTarget {
  return {
    name,
    config: {} as DelegateTarget["config"],
    ...(opts?.leadsTeam ? { leadsTeam: opts.leadsTeam } : {}),
    ...(opts?.consultWhen ? { consultWhen: opts.consultWhen } : {}),
  };
}

describe("buildDelegateGuidelines", () => {
  it("lists flat agent targets", () => {
    const lines = buildDelegateGuidelines([target("architect", { consultWhen: "Design decisions" })]);
    const joined = lines.join("\n");
    expect(joined).toContain('"architect"');
    expect(joined).toContain("Design decisions");
  });

  it("lists lead targets with team context", () => {
    const lines = buildDelegateGuidelines([
      target("eng-lead", { leadsTeam: "Engineering", consultWhen: "Code, APIs" }),
    ]);
    const joined = lines.join("\n");
    expect(joined).toContain('"eng-lead"');
    expect(joined).toContain("leads Engineering");
    expect(joined).toContain("Code, APIs");
  });

  it("lists mixed targets", () => {
    const lines = buildDelegateGuidelines([
      target("architect", { consultWhen: "Design" }),
      target("eng-lead", { leadsTeam: "Engineering", consultWhen: "Code" }),
      target("val-lead", { leadsTeam: "Validation", consultWhen: "Testing" }),
    ]);
    const joined = lines.join("\n");
    expect(joined).toContain('"architect"');
    expect(joined).toContain('"eng-lead" (leads Engineering)');
    expect(joined).toContain('"val-lead" (leads Validation)');
  });

  it("handles target without consultWhen", () => {
    const lines = buildDelegateGuidelines([target("scout")]);
    const joined = lines.join("\n");
    expect(joined).toContain('"scout"');
    expect(joined).not.toContain("undefined");
  });

  it("includes routing rules", () => {
    const lines = buildDelegateGuidelines([target("builder")]);
    const joined = lines.join("\n");
    expect(joined).toContain("ONE target");
    expect(joined).toContain("sequentially");
    expect(joined).toContain("directly");
  });
});
