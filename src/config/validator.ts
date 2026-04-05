import type { TeamConfig } from "./parser.js";

type ValidateSuccess = { readonly ok: true; readonly agentNames: ReadonlyArray<string> };
type ValidateFailure = { readonly ok: false; readonly errors: ReadonlyArray<string> };
type ValidateResult = ValidateSuccess | ValidateFailure;

function collectAgents(config: TeamConfig) {
  const agents: string[] = [config.orchestrator.agent];

  function walk(members: Readonly<TeamConfig["members"]>) {
    for (const member of members) {
      if ("agent" in member) {
        agents.push(member.agent);
      } else {
        agents.push(member.lead);
        walk(member.members);
      }
    }
  }

  walk(config.members);
  return { agents };
}

export function validateTeamConfig(config: TeamConfig): ValidateResult {
  const { agents } = collectAgents(config);
  const errors: string[] = [];

  // Check duplicate agents
  const seen = new Set<string>();
  for (const name of agents) {
    if (seen.has(name)) {
      errors.push(`Agent "${name}" appears more than once — duplicate agent references are not allowed`);
    }
    seen.add(name);
  }

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, agentNames: agents };
}
