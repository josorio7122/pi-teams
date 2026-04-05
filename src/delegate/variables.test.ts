import { describe, expect, it } from "vitest";
import type { DelegateTarget } from "./targets.js";
import { buildTargetsBlock } from "./variables.js";

function target(name: string, opts?: { consultWhen?: string }): DelegateTarget {
  return {
    name,
    config: {} as DelegateTarget["config"],
    ...(opts?.consultWhen ? { consultWhen: opts.consultWhen } : {}),
  };
}

describe("buildTargetsBlock", () => {
  it("formats flat agent targets", () => {
    const result = buildTargetsBlock([target("architect", { consultWhen: "Design decisions" })]);
    expect(result).toContain("name: architect");
    expect(result).toContain("consult-when: Design decisions");
    expect(result).not.toContain("leads:");
  });

  it("formats lead targets", () => {
    const result = buildTargetsBlock([target("eng-lead", { consultWhen: "Code, APIs" })]);
    expect(result).toContain("name: eng-lead");
    expect(result).toContain("consult-when: Code, APIs");
    expect(result).not.toContain("leads:");
  });

  it("formats mixed targets", () => {
    const result = buildTargetsBlock([
      target("architect", { consultWhen: "Design" }),
      target("eng-lead", { consultWhen: "Code" }),
    ]);
    expect(result).toContain("name: architect");
    expect(result).toContain("name: eng-lead");
    expect(result).not.toContain("leads:");
  });

  it("omits consult-when when absent", () => {
    const result = buildTargetsBlock([target("scout")]);
    expect(result).toContain("name: scout");
    expect(result).not.toContain("consult-when");
  });

  it("formats member targets for leads", () => {
    const result = buildTargetsBlock([
      target("frontend-dev", { consultWhen: "UI, components" }),
      target("backend-dev", { consultWhen: "APIs, databases" }),
    ]);
    expect(result).toContain("name: frontend-dev");
    expect(result).toContain("consult-when: UI, components");
    expect(result).toContain("name: backend-dev");
    expect(result).toContain("consult-when: APIs, databases");
  });
});
