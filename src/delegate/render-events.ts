import type { AgentStatus, ConversationEvent } from "../tui/state.js";

export function buildPartialEvents(params: {
  readonly events: ReadonlyArray<ConversationEvent>;
  readonly getStatus: (name: string) => AgentStatus;
}): ReadonlyArray<ConversationEvent> {
  const { events, getStatus } = params;
  const responded = new Set(
    events.filter((e): e is ConversationEvent & { type: "response" } => e.type === "response").map((e) => e.agent),
  );
  const pending = events.filter(
    (e): e is ConversationEvent & { type: "delegation" } => e.type === "delegation" && !responded.has(e.to),
  );
  const pendingBoxes: ReadonlyArray<ConversationEvent> = pending.map((e) => {
    const status = getStatus(e.to);
    const hasActivity = status.status === "running" && status.metrics && status.metrics.turns > 0;
    const phase = hasActivity ? "working" : "initializing";
    const dots = ".".repeat((Math.floor(Date.now() / 500) % 3) + 1);
    return { type: "response" as const, agent: e.to, output: `${phase}${dots}` };
  });
  return [...events, ...pendingBoxes];
}

export function buildFinalEvents(events: ReadonlyArray<ConversationEvent>): ReadonlyArray<ConversationEvent> {
  const responses = events.filter(
    (e): e is ConversationEvent & { type: "response" } => e.type === "response" && e.output.length > 0,
  );
  const responded = new Set(responses.map((e) => e.agent));
  return events.filter((e) => {
    if (e.type === "delegation") return responded.has(e.to);
    if (e.type === "response") return e.output.length > 0;
    return true;
  });
}
