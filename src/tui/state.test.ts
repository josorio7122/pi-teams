import type { AgentMetrics } from "pi-agents";
import { describe, expect, it, vi } from "vitest";
import { createFooterState } from "./state.js";

const metrics: AgentMetrics = {
  turns: 3,
  inputTokens: 1000,
  outputTokens: 500,
  cost: 0.05,
  toolCalls: [{ name: "read", args: {} }],
};

describe("createFooterState", () => {
  it("returns idle for unknown agent", () => {
    const state = createFooterState({ onUpdate: () => {} });
    expect(state.get("unknown")).toEqual({ status: "idle" });
  });

  it("tracks running state", () => {
    const state = createFooterState({ onUpdate: () => {} });
    state.setRunning("builder");
    expect(state.get("builder").status).toBe("running");
  });

  it("tracks done state with metrics", () => {
    const state = createFooterState({ onUpdate: () => {} });
    state.setDone({ name: "builder", metrics });
    const s = state.get("builder");
    expect(s.status).toBe("done");
    if (s.status === "done") expect(s.metrics).toBe(metrics);
  });

  it("tracks error state", () => {
    const state = createFooterState({ onUpdate: () => {} });
    state.setError({ name: "builder", error: "boom" });
    const s = state.get("builder");
    expect(s.status).toBe("error");
    if (s.status === "error") expect(s.error).toBe("boom");
  });

  it("calls onUpdate on every state change", () => {
    const onUpdate = vi.fn();
    const state = createFooterState({ onUpdate });
    state.setRunning("a");
    state.setDone({ name: "b", metrics });
    state.setError({ name: "c", error: "x" });
    expect(onUpdate).toHaveBeenCalledTimes(3);
  });

  it("reports hasRunning correctly", () => {
    const state = createFooterState({ onUpdate: () => {} });
    expect(state.hasRunning()).toBe(false);
    state.setRunning("builder");
    expect(state.hasRunning()).toBe(true);
    state.setDone({ name: "builder", metrics });
    expect(state.hasRunning()).toBe(false);
  });

  it("collects all metrics from done and error agents", () => {
    const state = createFooterState({ onUpdate: () => {} });
    state.setDone({ name: "a", metrics });
    state.setDone({ name: "b", metrics });
    state.setRunning("c");
    expect(state.allMetrics()).toHaveLength(2);
  });
});
