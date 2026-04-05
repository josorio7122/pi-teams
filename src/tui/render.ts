import type { ThemeColor } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import type { AgentMetrics } from "pi-agents";
import { colorize } from "pi-agents";
import type { AgentNode, GraphNode, TeamGraph } from "../graph/builder.js";
import { formatStats } from "./format.js";
import type { AgentStatus, FooterState } from "./state.js";

export type RenderTheme = Readonly<{
  fg: (color: ThemeColor, text: string) => string;
  bold: (text: string) => string;
}>;

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function spinnerFrame() {
  return SPINNER[Math.floor(Date.now() / 80) % SPINNER.length] ?? "⠋";
}

function statusText(params: { readonly status: AgentStatus; readonly theme: RenderTheme }) {
  const { status, theme } = params;
  switch (status.status) {
    case "idle":
      return theme.fg("dim", "idle");
    case "running": {
      const spinner = theme.fg("accent", spinnerFrame());
      return status.metrics ? `${spinner} ${theme.fg("dim", formatStats(status.metrics))}` : spinner;
    }
    case "done":
      return `${theme.fg("success", "✓")} ${theme.fg("dim", formatStats(status.metrics))}`;
    case "error":
      return `${theme.fg("error", "✗")} ${theme.fg("error", status.error)}`;
  }
}

function agentLine(params: {
  readonly node: AgentNode;
  readonly state: FooterState;
  readonly theme: RenderTheme;
  readonly nameWidth: number;
}) {
  const { node, state, theme, nameWidth } = params;
  const fm = node.config.frontmatter;
  const padded = fm.name.length < nameWidth ? fm.name + " ".repeat(nameWidth - fm.name.length) : fm.name;
  const paddedColored = colorize(fm.color, padded);
  const model = theme.fg("dim", `(${fm.model})`);
  const status = statusText({ status: state.get(fm.name), theme });
  return `${fm.icon} ${paddedColored}  ${model}  ${status}`;
}

function computeMaxNameLen(params: { readonly graph: TeamGraph }) {
  let max = params.graph.orchestrator.config.frontmatter.name.length;

  function walk(members: ReadonlyArray<GraphNode>) {
    for (const node of members) {
      if (node.type === "agent") {
        max = Math.max(max, node.config.frontmatter.name.length);
      } else {
        max = Math.max(max, node.lead.config.frontmatter.name.length);
        walk(node.members);
      }
    }
  }

  walk(params.graph.members);
  return max;
}

function aggregateMetrics(all: ReadonlyArray<AgentMetrics>): AgentMetrics {
  let turns = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  for (const m of all) {
    turns += m.turns;
    inputTokens += m.inputTokens;
    outputTokens += m.outputTokens;
    cost += m.cost;
    toolCalls.push(...m.toolCalls);
  }
  return { turns, inputTokens, outputTokens, cost, toolCalls };
}

function renderMembers(params: {
  readonly members: ReadonlyArray<GraphNode>;
  readonly prefix: string;
  readonly state: FooterState;
  readonly theme: RenderTheme;
  readonly nameWidth: number;
}) {
  const { members, prefix, state, theme, nameWidth } = params;
  const lines: string[] = [];

  for (let i = 0; i < members.length; i++) {
    const node = members[i];
    if (!node) continue;
    const isLast = i === members.length - 1;
    const connector = isLast ? "└─ " : "├─ ";
    const continuation = isLast ? "   " : "│  ";

    // Spacer before each member
    lines.push(theme.fg("dim", `${prefix}│`));

    const agent = node.type === "agent" ? node : node.lead;
    lines.push(`${theme.fg("dim", prefix + connector)}${agentLine({ node: agent, state, theme, nameWidth })}`);

    // If team node, render children indented under lead
    if (node.type === "team") {
      lines.push(...renderMembers({ members: node.members, prefix: prefix + continuation, state, theme, nameWidth }));
    }
  }

  return lines;
}

export function renderFooter(params: {
  readonly graph: TeamGraph;
  readonly state: FooterState;
  readonly theme: RenderTheme;
  readonly width?: number;
}) {
  const { graph, state, theme, width } = params;
  const nameWidth = computeMaxNameLen({ graph });

  // Header
  const allMetrics = state.allMetrics();
  const headerLabel = theme.bold("pi-teams");
  const headerStats =
    allMetrics.length > 0 ? `  ${theme.fg("dim", `Σ ${formatStats(aggregateMetrics(allMetrics))}`)}` : "";
  const header = `${headerLabel}${headerStats}`;

  // Orchestrator
  const orchLine = agentLine({ node: graph.orchestrator, state, theme, nameWidth });

  // Tree
  const treeLines = renderMembers({ members: graph.members, prefix: "", state, theme, nameWidth });

  const lines = [header, "", orchLine, ...treeLines];
  if (!width) return lines;
  return lines.map((l) => truncateToWidth(l, width));
}
