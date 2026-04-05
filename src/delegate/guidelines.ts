import type { DelegateTarget } from "./targets.js";

export function buildDelegateGuidelines(targets: ReadonlyArray<DelegateTarget>) {
  const entries = targets.map((t) => {
    const label = t.teamMembers ? `"${t.name}" (team lead)` : `"${t.name}"`;
    const hint = t.consultWhen ? ` — ${t.consultWhen}` : "";
    return `  • ${label}${hint}`;
  });

  return [
    "Use delegate to route tasks to specialized agents.",
    `Available targets:\n${entries.join("\n")}`,
    "Default to ONE target. Only involve multiple when the question genuinely spans domains.",
    "When work is dependent, delegate sequentially.",
    "Answer directly when the question is simple — not everything needs delegation.",
  ];
}
