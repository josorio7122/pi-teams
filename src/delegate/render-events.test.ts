import { describe, expect, it } from "vitest";
import type { ConversationEvent } from "../tui/state.js";
import { buildFinalEvents, buildPartialEvents } from "./render-events.js";

describe("buildPartialEvents", () => {
  it("adds pending boxes for delegations without responses", () => {
    const events: ReadonlyArray<ConversationEvent> = [
      { type: "delegation", from: "lead", to: "worker", task: "do stuff" },
    ];
    const getStatus = () => ({ status: "running" as const });
    const result = buildPartialEvents({ events, getStatus });
    expect(result).toHaveLength(2);
    expect(result[1]?.type).toBe("response");
  });

  it("skips delegations that already have responses", () => {
    const events: ReadonlyArray<ConversationEvent> = [
      { type: "delegation", from: "lead", to: "worker", task: "do stuff" },
      { type: "response", agent: "worker", output: "done" },
    ];
    const getStatus = () => ({
      status: "done" as const,
      metrics: { turns: 1, inputTokens: 0, outputTokens: 0, cost: 0, toolCalls: [] },
    });
    const result = buildPartialEvents({ events, getStatus });
    expect(result).toHaveLength(2);
    expect(result.filter((e) => e.type === "response")).toHaveLength(1);
  });
});

describe("buildFinalEvents", () => {
  it("drops orphaned delegations with no response", () => {
    const events: ReadonlyArray<ConversationEvent> = [
      { type: "delegation", from: "lead", to: "worker", task: "do stuff" },
    ];
    const result = buildFinalEvents(events);
    expect(result).toHaveLength(0);
  });

  it("drops empty responses", () => {
    const events: ReadonlyArray<ConversationEvent> = [
      { type: "delegation", from: "lead", to: "worker", task: "do stuff" },
      { type: "response", agent: "worker", output: "" },
    ];
    const result = buildFinalEvents(events);
    expect(result).toHaveLength(0);
  });

  it("keeps matched delegation-response pairs", () => {
    const events: ReadonlyArray<ConversationEvent> = [
      { type: "delegation", from: "lead", to: "worker", task: "do stuff" },
      { type: "response", agent: "worker", output: "done" },
    ];
    const result = buildFinalEvents(events);
    expect(result).toHaveLength(2);
  });
});
