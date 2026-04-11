import { describe, expect, it } from "vitest";
import { buildDelegateGuidelines } from "./guidelines.js";

describe("buildDelegateGuidelines", () => {
  it("includes routing rules", () => {
    const lines = buildDelegateGuidelines();
    const joined = lines.join("\n");
    expect(joined).toContain("delegate");
    expect(joined).toContain("parallel");
    expect(joined).toContain("directly");
  });
});
