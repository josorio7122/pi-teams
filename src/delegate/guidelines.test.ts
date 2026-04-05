import { describe, expect, it } from "vitest";
import { buildDelegateGuidelines } from "./guidelines.js";
import type { DelegateTarget } from "./targets.js";

function target(name: string, opts?: { isLead?: boolean; consultWhen?: string }): DelegateTarget {
  return {
    name,
    config: {} as DelegateTarget["config"],
    ...(opts?.isLead ? { teamMembers: [] } : {}),
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

  it("lists lead targets", () => {
    const lines = buildDelegateGuidelines([target("eng-lead", { isLead: true, consultWhen: "Code, APIs" })]);
    const joined = lines.join("\n");
    expect(joined).toContain('"eng-lead"');
    expect(joined).toContain("team lead");
    expect(joined).toContain("Code, APIs");
  });

  it("lists mixed targets", () => {
    const lines = buildDelegateGuidelines([
      target("architect", { consultWhen: "Design" }),
      target("eng-lead", { isLead: true, consultWhen: "Code" }),
      target("val-lead", { isLead: true, consultWhen: "Testing" }),
    ]);
    const joined = lines.join("\n");
    expect(joined).toContain('"architect"');
    expect(joined).toContain('"eng-lead" (team lead)');
    expect(joined).toContain('"val-lead" (team lead)');
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
