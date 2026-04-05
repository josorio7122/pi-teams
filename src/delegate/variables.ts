import type { DelegateTarget } from "./targets.js";

function formatEntry(t: DelegateTarget) {
  const lines = [`- name: ${t.name}`];
  if (t.leadsTeam) lines.push(`  leads: ${t.leadsTeam}`);
  if (t.consultWhen) lines.push(`  consult-when: ${t.consultWhen}`);
  return lines.join("\n");
}

export function buildTargetsBlock(targets: ReadonlyArray<DelegateTarget>) {
  return targets.map(formatEntry).join("\n");
}
