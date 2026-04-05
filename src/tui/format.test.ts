import { describe, expect, it } from "vitest";
import { formatStats, formatTokens } from "./format.js";

describe("formatTokens", () => {
  it("returns raw number under 1000", () => {
    expect(formatTokens(500)).toBe("500");
  });

  it("formats thousands with one decimal under 10k", () => {
    expect(formatTokens(3500)).toBe("3.5k");
  });

  it("formats thousands rounded above 10k", () => {
    expect(formatTokens(12345)).toBe("12k");
  });

  it("formats millions", () => {
    expect(formatTokens(1500000)).toBe("1.5M");
  });
});

describe("formatStats", () => {
  it("formats full metrics", () => {
    const result = formatStats({
      turns: 3,
      inputTokens: 12000,
      outputTokens: 4000,
      cost: 0.08,
      toolCalls: [
        { name: "read", args: {} },
        { name: "bash", args: {} },
      ],
    });
    expect(result).toBe("3 turns ↑12k ↓4.0k 2 tools $0.080");
  });

  it("uses singular for 1 turn", () => {
    const result = formatStats({
      turns: 1,
      inputTokens: 100,
      outputTokens: 50,
      cost: 0.01,
      toolCalls: [{ name: "read", args: {} }],
    });
    expect(result).toContain("1 turn ");
    expect(result).toContain("1 tool ");
  });

  it("omits tools when none", () => {
    const result = formatStats({
      turns: 1,
      inputTokens: 100,
      outputTokens: 50,
      cost: 0.01,
      toolCalls: [],
    });
    expect(result).not.toContain("tool");
  });
});
