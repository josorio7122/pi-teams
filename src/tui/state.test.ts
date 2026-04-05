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

  it("updates metrics for running agent", () => {
    const onUpdate = vi.fn();
    const state = createFooterState({ onUpdate });
    state.setRunning("builder");
    state.updateMetrics({ name: "builder", metrics });
    const s = state.get("builder");
    expect(s.status).toBe("running");
    if (s.status === "running") expect(s.metrics).toBe(metrics);
    expect(onUpdate).toHaveBeenCalledTimes(2); // setRunning + updateMetrics
  });

  it("ignores updateMetrics for non-running agent", () => {
    const onUpdate = vi.fn();
    const state = createFooterState({ onUpdate });
    state.setDone({ name: "builder", metrics });
    onUpdate.mockClear();
    state.updateMetrics({ name: "builder", metrics });
    expect(onUpdate).not.toHaveBeenCalled(); // no update — agent is done, not running
  });

  it("includes running agent metrics in allMetrics", () => {
    const state = createFooterState({ onUpdate: () => {} });
    state.setRunning("a");
    state.updateMetrics({ name: "a", metrics });
    state.setDone({ name: "b", metrics });
    expect(state.allMetrics()).toHaveLength(2);
  });

  it("collects all metrics from done and error agents", () => {
    const state = createFooterState({ onUpdate: () => {} });
    state.setDone({ name: "a", metrics });
    state.setDone({ name: "b", metrics });
    state.setRunning("c");
    expect(state.allMetrics()).toHaveLength(2); // running without metrics excluded
  });

  it("tracks conversation events", () => {
    const state = createFooterState({ onUpdate: () => {} });
    state.addEvent({ type: "delegation", from: "orch", to: "lead", task: "do it" });
    state.addEvent({ type: "response", agent: "lead", output: "done" });
    expect(state.getEvents()).toHaveLength(2);
    expect(state.getEvents()[0]!.type).toBe("delegation");
    expect(state.getEvents()[1]!.type).toBe("response");
  });

  it("subscribe fires only on addEvent", () => {
    const state = createFooterState({ onUpdate: () => {} });
    const listener = vi.fn();
    state.subscribe(listener);
    state.setRunning("a");
    expect(listener).toHaveBeenCalledTimes(0); // status changes don't notify
    state.addEvent({ type: "response", agent: "a", output: "x" });
    expect(listener).toHaveBeenCalledTimes(1); // only addEvent notifies
    state.setDone({ name: "a", metrics });
    expect(listener).toHaveBeenCalledTimes(1); // still 1
  });

  it("unsubscribe stops notifications", () => {
    const state = createFooterState({ onUpdate: () => {} });
    const listener = vi.fn();
    const unsub = state.subscribe(listener);
    state.addEvent({ type: "response", agent: "a", output: "x" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    state.addEvent({ type: "response", agent: "a", output: "y" });
    expect(listener).toHaveBeenCalledTimes(1); // no more after unsub
  });

  it("calls onUpdate when event is added", () => {
    const onUpdate = vi.fn();
    const state = createFooterState({ onUpdate });
    state.addEvent({ type: "response", agent: "a", output: "x" });
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});
