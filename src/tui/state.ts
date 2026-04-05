import type { AgentMetrics } from "pi-agents";

export type AgentStatus = Readonly<
  | { status: "idle" }
  | { status: "running"; metrics?: AgentMetrics }
  | { status: "done"; metrics: AgentMetrics }
  | { status: "error"; error: string; metrics?: AgentMetrics }
>;

export type FooterState = Readonly<{
  get: (name: string) => AgentStatus;
  setRunning: (name: string) => void;
  updateMetrics: (params: { readonly name: string; readonly metrics: AgentMetrics }) => void;
  setDone: (params: { readonly name: string; readonly metrics: AgentMetrics }) => void;
  setError: (params: { readonly name: string; readonly error: string; readonly metrics?: AgentMetrics }) => void;
  hasRunning: () => boolean;
  allMetrics: () => ReadonlyArray<AgentMetrics>;
  addEvent: (event: ConversationEvent) => void;
  getEvents: () => ReadonlyArray<ConversationEvent>;
  subscribe: (listener: () => void) => () => void;
}>;

export type ConversationEvent = Readonly<
  { type: "delegation"; from: string; to: string; task: string } | { type: "response"; agent: string; output: string }
>;

const IDLE: AgentStatus = { status: "idle" };

export function createFooterState(params: { readonly onUpdate: () => void }): FooterState {
  const agents = new Map<string, AgentStatus>();
  const events: ConversationEvent[] = [];
  const listeners = new Set<() => void>();

  const notify = () => params.onUpdate();
  const notifyWithListeners = () => {
    params.onUpdate();
    for (const listener of listeners) listener();
  };

  return {
    get: (name) => agents.get(name) ?? IDLE,
    setRunning: (name) => {
      agents.set(name, { status: "running" });
      notify();
    },
    updateMetrics: ({ name, metrics }) => {
      const current = agents.get(name);
      if (current?.status === "running") {
        agents.set(name, { status: "running", metrics });
        notify();
      }
    },
    setDone: ({ name, metrics }) => {
      agents.set(name, { status: "done", metrics });
      notify();
    },
    setError: ({ name, error, metrics }) => {
      agents.set(name, { status: "error", error, ...(metrics ? { metrics } : {}) });
      notify();
    },
    hasRunning: () => [...agents.values()].some((s) => s.status === "running"),
    allMetrics: () => {
      const result: AgentMetrics[] = [];
      for (const s of agents.values()) {
        if ("metrics" in s && s.metrics) result.push(s.metrics);
      }
      return result;
    },
    addEvent: (event) => {
      events.push(event);
      notifyWithListeners();
    },
    getEvents: () => events,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
