import type { AgentMetrics } from "pi-agents";

export function formatTokens(count: number) {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

export function formatStats(metrics: Readonly<AgentMetrics>) {
  const parts: string[] = [];
  if (metrics.turns > 0) parts.push(`${metrics.turns} turn${metrics.turns === 1 ? "" : "s"}`);
  parts.push(`↑${formatTokens(metrics.inputTokens)}`);
  parts.push(`↓${formatTokens(metrics.outputTokens)}`);
  if (metrics.toolCalls.length > 0) {
    parts.push(`${metrics.toolCalls.length} tool${metrics.toolCalls.length === 1 ? "" : "s"}`);
  }
  parts.push(`$${metrics.cost.toFixed(3)}`);
  return parts.join(" ");
}
