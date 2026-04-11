import type { ThemeColor } from "@mariozechner/pi-coding-agent";
import type { AgentMetrics } from "pi-agents";
import { describe, expect, it } from "vitest";
import type { TeamGraph } from "../graph/builder.js";
import { stubConfig } from "../test-helpers.js";
import { renderFooter } from "./render.js";
import { createFooterState } from "./state.js";

// Strip ANSI for assertions
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

const noopTheme = {
  fg: (_color: ThemeColor, text: string) => text,
  bold: (text: string) => text,
};

const metrics: AgentMetrics = {
  turns: 3,
  inputTokens: 12000,
  outputTokens: 4000,
  cost: 0.08,
  toolCalls: [
    { name: "read", args: {} },
    { name: "bash", args: {} },
  ],
};

function flatGraph(): TeamGraph {
  return {
    orchestrator: { type: "agent", config: stubConfig("orchestrator", { model: "anthropic/claude-opus-4-6" }) },
    members: [
      { type: "agent", config: stubConfig("builder") },
      { type: "agent", config: stubConfig("reviewer") },
    ],
  };
}

function nestedGraph(): TeamGraph {
  return {
    orchestrator: { type: "agent", config: stubConfig("orchestrator", { model: "anthropic/claude-opus-4-6" }) },
    members: [
      {
        type: "team",
        lead: { type: "agent", config: stubConfig("eng-lead", { model: "anthropic/claude-opus-4-6" }) },
        members: [
          { type: "agent", config: stubConfig("frontend-dev") },
          { type: "agent", config: stubConfig("backend-dev") },
        ],
      },
    ],
  };
}

describe("renderFooter", () => {
  it("renders header with pi-teams label", () => {
    const state = createFooterState({ onUpdate: () => {} });
    const lines = renderFooter({ graph: flatGraph(), state, theme: noopTheme });
    expect(strip(lines[0] ?? "")).toContain("pi-teams");
  });

  it("renders orchestrator agent", () => {
    const state = createFooterState({ onUpdate: () => {} });
    const lines = renderFooter({ graph: flatGraph(), state, theme: noopTheme });
    const joined = lines.map(strip).join("\n");
    expect(joined).toContain("orchestrator");
    expect(joined).toContain("(anthropic/claude-opus-4-6)");
  });

  it("renders flat members with tree connectors", () => {
    const state = createFooterState({ onUpdate: () => {} });
    const lines = renderFooter({ graph: flatGraph(), state, theme: noopTheme });
    const joined = lines.map(strip).join("\n");
    expect(joined).toContain("├─");
    expect(joined).toContain("└─");
    expect(joined).toContain("builder");
    expect(joined).toContain("reviewer");
  });

  it("renders nested team with lead and indented members", () => {
    const state = createFooterState({ onUpdate: () => {} });
    const lines = renderFooter({ graph: nestedGraph(), state, theme: noopTheme });
    const joined = lines.map(strip).join("\n");
    expect(joined).toContain("eng-lead");
    expect(joined).toContain("frontend-dev");
    expect(joined).toContain("backend-dev");
    // Members should be indented under lead
    const frontendLine = lines.map(strip).find((l) => l.includes("frontend-dev"));
    expect(frontendLine).toMatch(/│?\s+├─/);
  });

  it("shows idle for agents with no state", () => {
    const state = createFooterState({ onUpdate: () => {} });
    const lines = renderFooter({ graph: flatGraph(), state, theme: noopTheme });
    const builderLine = lines.map(strip).find((l) => l.includes("builder"));
    expect(builderLine).toContain("idle");
  });

  it("shows done status with metrics", () => {
    const state = createFooterState({ onUpdate: () => {} });
    state.setDone({ name: "builder", metrics });
    const lines = renderFooter({ graph: flatGraph(), state, theme: noopTheme });
    const builderLine = lines.map(strip).find((l) => l.includes("builder"));
    expect(builderLine).toContain("✓");
    expect(builderLine).toContain("3 turns");
    expect(builderLine).toContain("$0.080");
  });

  it("shows error status", () => {
    const state = createFooterState({ onUpdate: () => {} });
    state.setError({ name: "builder", error: "Domain violation" });
    const lines = renderFooter({ graph: flatGraph(), state, theme: noopTheme });
    const builderLine = lines.map(strip).find((l) => l.includes("builder"));
    expect(builderLine).toContain("✗");
    expect(builderLine).toContain("Domain violation");
  });

  it("shows aggregate stats in header when metrics exist", () => {
    const state = createFooterState({ onUpdate: () => {} });
    state.setDone({ name: "builder", metrics });
    state.setDone({ name: "reviewer", metrics });
    const lines = renderFooter({ graph: flatGraph(), state, theme: noopTheme });
    const header = strip(lines[0] ?? "");
    expect(header).toContain("Σ");
    expect(header).toContain("$0.160");
  });

  it("includes spacer lines between agents", () => {
    const state = createFooterState({ onUpdate: () => {} });
    const lines = renderFooter({ graph: flatGraph(), state, theme: noopTheme });
    const spacers = lines.map(strip).filter((l) => l.trim() === "│" || l.trim() === "");
    expect(spacers.length).toBeGreaterThan(0);
  });
});
