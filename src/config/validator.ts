import type { TeamConfig } from "./parser.js";

type ValidateSuccess = { readonly ok: true; readonly agentNames: ReadonlyArray<string> };
type ValidateFailure = { readonly ok: false; readonly errors: ReadonlyArray<string> };
type ValidateResult = ValidateSuccess | ValidateFailure;

function flattenMembers(members: Readonly<TeamConfig["members"]>): ReadonlyArray<string> {
  return members.flatMap((member) =>
    "agent" in member ? [member.agent] : [member.lead, ...flattenMembers(member.members)],
  );
}

function collectAgents(config: TeamConfig): ReadonlyArray<string> {
  return [config.orchestrator.agent, ...flattenMembers(config.members)];
}

export function validateTeamConfig(config: TeamConfig): ValidateResult {
  const agents = collectAgents(config);

  const errors = agents
    .filter((name, i) => agents.indexOf(name) !== i)
    .map((name) => `Agent "${name}" appears more than once — duplicate agent references are not allowed`);

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, agentNames: agents };
}
