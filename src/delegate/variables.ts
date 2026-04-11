import type { DelegateTarget } from "./targets.js";

function formatEntry(t: DelegateTarget) {
  const lines = [`- name: ${t.name}`];
  if (t.consultWhen) lines.push(`  consult-when: ${t.consultWhen}`);
  return lines.join("\n");
}

export function buildTargetsBlock(targets: ReadonlyArray<DelegateTarget>) {
  const entries = targets.map(formatEntry).join("\n");
  return `## Team Members\n\n${entries}\n\nEach delegate call must address ONE concern. For independent concerns, make multiple parallel delegate calls in a single response — including to the same agent.`;
}
