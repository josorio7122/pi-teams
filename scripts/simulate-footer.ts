/** Simulates the pi-teams footer. Usage: npx tsx scripts/simulate-footer.ts */
import type { AgentConfig, AgentMetrics } from "pi-agents";
import type { RenderTheme } from "../src/tui/render.js";
import type { TeamGraph } from "../src/graph/builder.js";
import { renderFooter } from "../src/tui/render.js";
import { createFooterState } from "../src/tui/state.js";

// ── ANSI theme ──────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const COLORS: Record<string, string> = {
  dim: "\x1b[90m",
  muted: "\x1b[37m",
  success: "\x1b[32m",
  error: "\x1b[31m",
  accent: "\x1b[36m",
  warning: "\x1b[33m",
};

const theme: RenderTheme = {
  fg: (_color, text) => `${COLORS[_color] ?? ""}${text}${RESET}`,
  bold: (text) => `${BOLD}${text}${RESET}`,
};

// ── Helpers ─────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clearAndPrint(lines: ReadonlyArray<string>, prevCount: number) {
  if (prevCount > 0) process.stdout.write(`\x1b[${prevCount}A\x1b[J`);
  for (const line of lines) process.stdout.write(`${line}\n`);
  return lines.length;
}

function randomMetrics(params: { readonly turns: number; readonly scale: number }): AgentMetrics {
  const toolNames = ["read", "bash", "grep", "find", "edit", "write"];
  const toolCount = Math.floor(Math.random() * params.scale * 3) + 1;
  return {
    turns: params.turns,
    inputTokens: Math.floor(Math.random() * 3000 * params.scale) + 200,
    outputTokens: Math.floor(Math.random() * 2000 * params.scale) + 100,
    cost: Number((Math.random() * 0.05 * params.scale + 0.002).toFixed(4)),
    toolCalls: Array.from({ length: toolCount }, () => ({
      name: toolNames[Math.floor(Math.random() * toolNames.length)]!,
      args: {},
    })),
  };
}

function agent(params: { readonly name: string; readonly model: string; readonly icon: string; readonly color: string }): AgentConfig {
  return {
    frontmatter: {
      name: params.name,
      description: `${params.name} agent`,
      model: params.model,
      role: "worker",
      color: params.color,
      icon: params.icon,
      domain: [{ path: "src/", read: true, write: true, delete: false }],
      tools: ["read"],
      skills: [{ path: ".pi/skills/test.md", when: "Always" }],
      knowledge: {
        project: { path: ".pi/k/p/x.yaml", description: "P", updatable: true, "max-lines": 100 },
        general: { path: ".pi/k/g/x.yaml", description: "G", updatable: true, "max-lines": 100 },
      },
      conversation: { path: ".pi/sessions/x/conversation.jsonl" },
    },
    systemPrompt: `You are ${params.name}.`,
    filePath: `.pi/agents/${params.name}.md`,
    source: "project",
  };
}

// ── Build graph ─────────────────────────────────────────────

const a = agent;

const graph: TeamGraph = {
  orchestrator: {
    type: "agent",
    config: a({ name: "orchestrator", model: "anthropic/claude-opus-4-6", icon: "🤖", color: "#72f1b8" }),
  },
  members: [
    {
      type: "team",
      lead: {
        type: "agent",
        config: a({ name: "planning-lead", model: "anthropic/claude-opus-4-6", icon: "📋", color: "#fede5d" }),
      },
      members: [
        { type: "agent", config: a({ name: "product-mgr", model: "anthropic/claude-sonnet-4-6", icon: "📋", color: "#f8c674" }) },
        { type: "agent", config: a({ name: "ux-researcher", model: "anthropic/claude-sonnet-4-6", icon: "🔬", color: "#d9381e" }) },
      ],
    },
    {
      type: "team",
      lead: {
        type: "agent",
        config: a({ name: "eng-lead", model: "anthropic/claude-opus-4-6", icon: "🔧", color: "#ff6e96" }),
      },
      members: [
        { type: "agent", config: a({ name: "frontend-dev", model: "anthropic/claude-sonnet-4-6", icon: "💻", color: "#36f9f6" }) },
        { type: "agent", config: a({ name: "backend-dev", model: "anthropic/claude-sonnet-4-6", icon: "💻", color: "#ff7edb" }) },
      ],
    },
    {
      type: "team",
      lead: {
        type: "agent",
        config: a({ name: "validation-lead", model: "anthropic/claude-opus-4-6", icon: "🛡", color: "#ff9e64" }),
      },
      members: [
        { type: "agent", config: a({ name: "qa-engineer", model: "anthropic/claude-sonnet-4-6", icon: "🧪", color: "#7dcfff" }) },
        { type: "agent", config: a({ name: "security-rev", model: "anthropic/claude-sonnet-4-6", icon: "🔒", color: "#bb9af7" }) },
      ],
    },
  ],
};

// ── Animate ─────────────────────────────────────────────────

async function animate() {
  const state = createFooterState({ onUpdate: () => {} });
  let lc = 0;

  const render = () => {
    const lines = renderFooter({ graph, state, theme });
    lc = clearAndPrint(lines, lc);
  };

  // Phase 1: All idle
  render();
  await sleep(1500);

  // Phase 2: Engineering team activates
  state.setRunning("eng-lead");
  for (let i = 0; i < 15; i++) {
    render();
    await sleep(80);
  }

  state.setRunning("frontend-dev");
  state.setRunning("backend-dev");
  for (let i = 0; i < 25; i++) {
    render();
    await sleep(80);
  }

  // Phase 3: frontend finishes
  state.setDone({ name: "frontend-dev", metrics: randomMetrics({ turns: 2, scale: 1.5 }) });
  for (let i = 0; i < 15; i++) {
    render();
    await sleep(80);
  }

  // Phase 4: backend finishes
  state.setDone({ name: "backend-dev", metrics: randomMetrics({ turns: 3, scale: 2 }) });
  for (let i = 0; i < 10; i++) {
    render();
    await sleep(80);
  }

  // Phase 5: eng-lead finishes
  state.setDone({ name: "eng-lead", metrics: randomMetrics({ turns: 4, scale: 3 }) });
  render();
  await sleep(1000);

  // Phase 6: Validation team activates
  state.setRunning("validation-lead");
  state.setRunning("qa-engineer");
  for (let i = 0; i < 20; i++) {
    render();
    await sleep(80);
  }

  // Phase 7: qa finishes, security fails
  state.setDone({ name: "qa-engineer", metrics: randomMetrics({ turns: 2, scale: 1 }) });
  state.setRunning("security-rev");
  for (let i = 0; i < 15; i++) {
    render();
    await sleep(80);
  }

  state.setError({ name: "security-rev", error: "Domain violation: /etc/hosts" });
  for (let i = 0; i < 10; i++) {
    render();
    await sleep(80);
  }

  state.setDone({ name: "validation-lead", metrics: randomMetrics({ turns: 3, scale: 2 }) });
  render();
  await sleep(2000);

  console.log("");
}

animate().catch(console.error);
