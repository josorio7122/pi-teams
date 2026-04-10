import type { AgentMetrics, AgentStatus, ConversationEvent } from "pi-agents";

export type { AgentStatus, ConversationEvent };

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
  getEventsForScope: (scopeId: number) => ReadonlyArray<ConversationEvent>;
  nextScopeId: (parentScopeId?: number) => number;
  subscribe: (listener: () => void) => () => void;
}>;

const IDLE: AgentStatus = { status: "idle" };

export function createFooterState(params: { readonly onUpdate: () => void }): FooterState {
  const agents = new Map<string, AgentStatus>();
  const events: ConversationEvent[] = [];
  const listeners = new Set<() => void>();
  let scopeCounter = 0;
  const scopeChildren = new Map<number, Set<number>>();

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
    getEventsForScope: (scopeId) => {
      const validScopes = new Set<number>([scopeId]);
      // Collect all descendant scopes via BFS
      const queue = [scopeId];
      while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined) continue;
        const children = scopeChildren.get(current);
        if (children) {
          for (const child of children) {
            if (!validScopes.has(child)) {
              validScopes.add(child);
              queue.push(child);
            }
          }
        }
      }
      return events.filter((e) => e._scopeId !== undefined && validScopes.has(e._scopeId));
    },
    nextScopeId: (parentScopeId?: number) => {
      const id = scopeCounter++;
      if (parentScopeId !== undefined) {
        let children = scopeChildren.get(parentScopeId);
        if (!children) {
          children = new Set();
          scopeChildren.set(parentScopeId, children);
        }
        children.add(id);
      }
      return id;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
