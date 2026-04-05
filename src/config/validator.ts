import type { TeamConfig } from "./parser.js";

type ValidateSuccess = { readonly ok: true; readonly agentNames: ReadonlyArray<string> };
type ValidateFailure = { readonly ok: false; readonly errors: ReadonlyArray<string> };
type ValidateResult = ValidateSuccess | ValidateFailure;

function collectAgents(config: TeamConfig) {
  const agents: string[] = [config.orchestrator.agent];
  const teamNames: string[] = [];

  function walk(members: TeamConfig["members"]) {
    for (const member of members) {
      if ("agent" in member) {
        agents.push(member.agent);
      } else {
        teamNames.push(member.team);
        if (member.lead) agents.push(member.lead);
        walk(member.members);
      }
    }
  }

  walk(config.members);
  return { agents, teamNames };
}

export function validateTeamConfig(config: TeamConfig): ValidateResult {
  const { agents, teamNames } = collectAgents(config);
  const errors: string[] = [];

  // Check duplicate agents
  const seen = new Set<string>();
  for (const name of agents) {
    if (seen.has(name)) {
      errors.push(`Agent "${name}" appears more than once — duplicate agent references are not allowed`);
    }
    seen.add(name);
  }

  // Check duplicate team names
  const seenTeams = new Set<string>();
  for (const name of teamNames) {
    if (seenTeams.has(name)) {
      errors.push(`Team "${name}" appears more than once — duplicate team names are not allowed`);
    }
    seenTeams.add(name);
  }

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, agentNames: agents };
}
