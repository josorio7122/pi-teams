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

  it("accumulates metrics across re-invocations of same agent", () => {
    const state = createFooterState({ onUpdate: () => {} });
    const m1: AgentMetrics = {
      turns: 2,
      inputTokens: 500,
      outputTokens: 200,
      cost: 0.03,
      toolCalls: [{ name: "read", args: {} }],
    };
    const m2: AgentMetrics = {
      turns: 3,
      inputTokens: 800,
      outputTokens: 300,
      cost: 0.05,
      toolCalls: [{ name: "bash", args: {} }],
    };
    state.setDone({ name: "scout", metrics: m1 });
    // Re-invoke same agent
    state.setRunning("scout");
    state.setDone({ name: "scout", metrics: m2 });
    const s = state.get("scout");
    expect(s.status).toBe("done");
    if (s.status === "done") {
      expect(s.metrics.turns).toBe(5); // 2 + 3
      expect(s.metrics.inputTokens).toBe(1300); // 500 + 800
      expect(s.metrics.cost).toBe(0.08); // 0.03 + 0.05
      expect(s.metrics.toolCalls).toHaveLength(2); // 1 + 1
    }
  });

  it("allMetrics returns accumulated totals across re-invocations", () => {
    const state = createFooterState({ onUpdate: () => {} });
    const m1: AgentMetrics = {
      turns: 2,
      inputTokens: 500,
      outputTokens: 200,
      cost: 0.03,
      toolCalls: [{ name: "read", args: {} }],
    };
    const m2: AgentMetrics = {
      turns: 3,
      inputTokens: 800,
      outputTokens: 300,
      cost: 0.05,
      toolCalls: [{ name: "bash", args: {} }],
    };
    state.setDone({ name: "scout", metrics: m1 });
    state.setRunning("scout");
    state.setDone({ name: "scout", metrics: m2 });
    const all = state.allMetrics();
    expect(all).toHaveLength(1); // one agent, accumulated
    expect(all[0]!.turns).toBe(5);
    expect(all[0]!.cost).toBe(0.08);
  });

  it("calls onUpdate when event is added", () => {
    const onUpdate = vi.fn();
    const state = createFooterState({ onUpdate });
    state.addEvent({ type: "response", agent: "a", output: "x" });
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("hasRunning returns false after setDone even without setRunning first", () => {
    const state = createFooterState({ onUpdate: () => {} });
    state.setDone({ name: "orphan", metrics });
    expect(state.hasRunning()).toBe(false);
  });

  it("hasRunning returns false after setError on non-running agent", () => {
    const state = createFooterState({ onUpdate: () => {} });
    state.setError({ name: "orphan", error: "boom" });
    expect(state.hasRunning()).toBe(false);
  });

  it("hasRunning returns false after setError on a running agent", () => {
    const state = createFooterState({ onUpdate: () => {} });
    state.setRunning("builder");
    expect(state.hasRunning()).toBe(true);
    state.setError({ name: "builder", error: "boom" });
    expect(state.hasRunning()).toBe(false);
  });

  it("hasRunning tracks multiple concurrent agents correctly", () => {
    const state = createFooterState({ onUpdate: () => {} });
    state.setRunning("a");
    state.setRunning("b");
    expect(state.hasRunning()).toBe(true);
    state.setDone({ name: "a", metrics });
    expect(state.hasRunning()).toBe(true); // b still running
    state.setDone({ name: "b", metrics });
    expect(state.hasRunning()).toBe(false);
  });

  it("double setRunning on same agent does not corrupt counter", () => {
    const state = createFooterState({ onUpdate: () => {} });
    state.setRunning("scout");
    state.setRunning("scout"); // double-set
    expect(state.hasRunning()).toBe(true);
    state.setDone({ name: "scout", metrics });
    expect(state.hasRunning()).toBe(false); // should not be stuck at true
  });

  it("accumulates metrics when agent errors on re-invocation", () => {
    const state = createFooterState({ onUpdate: () => {} });
    const m1: AgentMetrics = {
      turns: 2,
      inputTokens: 500,
      outputTokens: 200,
      cost: 0.03,
      toolCalls: [{ name: "read", args: {} }],
    };
    const m2: AgentMetrics = {
      turns: 1,
      inputTokens: 300,
      outputTokens: 100,
      cost: 0.02,
      toolCalls: [{ name: "bash", args: {} }],
    };
    state.setDone({ name: "scout", metrics: m1 });
    state.setRunning("scout");
    state.setError({ name: "scout", error: "timeout", metrics: m2 });
    const s = state.get("scout");
    expect(s.status).toBe("error");
    if (s.status === "error") {
      expect(s.error).toBe("timeout");
      expect(s.metrics?.turns).toBe(3);
      expect(s.metrics?.inputTokens).toBe(800);
      expect(s.metrics?.cost).toBeCloseTo(0.05);
      expect(s.metrics?.toolCalls).toHaveLength(2);
    }
  });

  it("getEventsForScope includes events from nested child scopes", () => {
    const state = createFooterState({ onUpdate: () => {} });
    const parent = state.nextScopeId();
    const child = state.nextScopeId(parent);
    const grandchild = state.nextScopeId(child);
    const sibling = state.nextScopeId();

    state.addEvent({ type: "delegation", from: "orch", to: "lead", task: "plan", _scopeId: parent });
    state.addEvent({ type: "delegation", from: "lead", to: "dev", task: "build", _scopeId: child });
    state.addEvent({ type: "response", agent: "dev", output: "done", _scopeId: grandchild });
    state.addEvent({ type: "response", agent: "other", output: "unrelated", _scopeId: sibling });

    const parentEvents = state.getEventsForScope(parent);
    expect(parentEvents).toHaveLength(3);
    expect(parentEvents.map((e) => e.type)).toEqual(["delegation", "delegation", "response"]);

    const childEvents = state.getEventsForScope(child);
    expect(childEvents).toHaveLength(2);

    const siblingEvents = state.getEventsForScope(sibling);
    expect(siblingEvents).toHaveLength(1);
    expect(siblingEvents[0]!.type).toBe("response");
  });

  it("excludes events without _scopeId from scope queries", () => {
    const state = createFooterState({ onUpdate: () => {} });
    const scope = state.nextScopeId();
    state.addEvent({ type: "delegation", from: "orch", to: "lead", task: "scoped", _scopeId: scope });
    state.addEvent({ type: "response", agent: "other", output: "no scope" });
    const scopeEvents = state.getEventsForScope(scope);
    expect(scopeEvents).toHaveLength(1);
    expect(scopeEvents[0]!.type).toBe("delegation");
  });
});
