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
}>;

export type ConversationEvent = Readonly<
  { type: "delegation"; from: string; to: string; task: string } | { type: "response"; agent: string; output: string }
>;

const IDLE: AgentStatus = { status: "idle" };

export function createFooterState(params: { readonly onUpdate: () => void }): FooterState {
  const agents = new Map<string, AgentStatus>();
  const events: ConversationEvent[] = [];

  return {
    get: (name) => agents.get(name) ?? IDLE,
    setRunning: (name) => {
      agents.set(name, { status: "running" });
      params.onUpdate();
    },
    updateMetrics: ({ name, metrics }) => {
      const current = agents.get(name);
      if (current?.status === "running") {
        agents.set(name, { status: "running", metrics });
        params.onUpdate();
      }
    },
    setDone: ({ name, metrics }) => {
      agents.set(name, { status: "done", metrics });
      params.onUpdate();
    },
    setError: ({ name, error, metrics }) => {
      agents.set(name, { status: "error", error, ...(metrics ? { metrics } : {}) });
      params.onUpdate();
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
      params.onUpdate();
    },
    getEvents: () => events,
  };
}
