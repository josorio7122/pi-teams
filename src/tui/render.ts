import { truncateToWidth } from "@mariozechner/pi-tui";
import type { AgentStatus, RenderTheme } from "pi-agents";
import { aggregateMetricsArray, colorize, formatUsageStats, spinnerFrame } from "pi-agents";
import type { AgentNode, GraphNode, TeamGraph } from "../graph/builder.js";
import type { FooterState } from "./state.js";

function statusText(params: { readonly status: AgentStatus; readonly theme: RenderTheme }) {
  const { status, theme } = params;
  switch (status.status) {
    case "idle":
      return theme.fg("dim", "idle");
    case "running": {
      const spinner = theme.fg("accent", spinnerFrame());
      return status.metrics ? `${spinner} ${theme.fg("dim", formatUsageStats(status.metrics))}` : spinner;
    }
    case "done":
      return `${theme.fg("success", "✓")} ${theme.fg("dim", formatUsageStats(status.metrics))}`;
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
  const padded = fm.name.padEnd(nameWidth);
  const paddedColored = colorize(fm.color, padded);
  const model = theme.fg("dim", `(${fm.model})`);
  const status = statusText({ status: state.get(fm.name), theme });
  return `${fm.icon} ${paddedColored}  ${model}  ${status}`;
}

function collectNameLengths(members: ReadonlyArray<GraphNode>): ReadonlyArray<number> {
  return members.flatMap((node) =>
    node.type === "agent"
      ? [node.config.frontmatter.name.length]
      : [node.lead.config.frontmatter.name.length, ...collectNameLengths(node.members)],
  );
}

function computeMaxNameLen(params: { readonly graph: TeamGraph }) {
  return Math.max(
    params.graph.orchestrator.config.frontmatter.name.length,
    ...collectNameLengths(params.graph.members),
  );
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
  const header = theme.bold("pi-teams");

  // Orchestrator + aggregate
  const orchLine = agentLine({ node: graph.orchestrator, state, theme, nameWidth });
  const allMetrics = state.allMetrics();
  const aggSuffix =
    allMetrics.length > 0 ? `  ${theme.fg("dim", `Σ ${formatUsageStats(aggregateMetricsArray(allMetrics))}`)}` : "";
  const orchWithAgg = `${orchLine}${aggSuffix}`;

  // Tree
  const treeLines = renderMembers({ members: graph.members, prefix: "", state, theme, nameWidth });

  const lines = [header, "", orchWithAgg, ...treeLines];
  if (!width) return lines;
  return lines.map((l) => truncateToWidth(l, width));
}
