import { describe, expect, it } from "vitest";
import { buildDelegateGuidelines } from "./guidelines.js";

describe("buildDelegateGuidelines", () => {
  it("returns exactly three guideline strings", () => {
    const lines = buildDelegateGuidelines();
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(typeof line).toBe("string");
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it("covers delegation, parallelism, and direct answers", () => {
    const lines = buildDelegateGuidelines();
    expect(lines[0]).toContain("delegate");
    expect(lines[1]).toContain("parallel");
    expect(lines[2]).toContain("directly");
  });
});
