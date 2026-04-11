import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function agentMd(p: {
  readonly name: string;
  readonly role: string;
  readonly tools: string;
  readonly body: string;
}) {
  return `---
name: ${p.name}
description: ${p.name} agent
model: anthropic/claude-haiku-4-5
role: ${p.role}
color: "#ffffff"
icon: "🤖"
domain:
  - path: .
    read: true
    write: false
    delete: false
tools:
  ${p.tools}
skills:
  - path: .pi/skills/e2e.md
    when: Always
knowledge:
  project:
    path: .pi/knowledge/project/${p.name}.yaml
    description: Project knowledge
    updatable: false
    max-lines: 100
  general:
    path: .pi/knowledge/general/${p.name}.yaml
    description: General knowledge
    updatable: false
    max-lines: 100
conversation:
  path: .pi/sessions/{{SESSION_ID}}/conversation.jsonl
---
${p.body}
`;
}

export async function setupBaseProject(params: {
  readonly agents: ReadonlyArray<{
    readonly name: string;
    readonly role: string;
    readonly tools: string;
    readonly body: string;
  }>;
  readonly teamsMd: string;
}) {
  const dir = await mkdtemp(join(tmpdir(), "pi-teams-e2e-"));

  for (const d of [".pi/agents", ".pi/teams", ".pi/skills", ".pi/knowledge/project", ".pi/knowledge/general"]) {
    await mkdir(join(dir, d), { recursive: true });
  }

  for (const a of params.agents) {
    await writeFile(join(dir, ".pi/agents", `${a.name}.md`), agentMd(a));
  }

  await writeFile(join(dir, ".pi/teams/teams.md"), params.teamsMd);
  await writeFile(join(dir, ".pi/skills/e2e.md"), "---\n---\nTest skill.");

  for (const a of params.agents) {
    await writeFile(join(dir, `.pi/knowledge/project/${a.name}.yaml`), "");
    await writeFile(join(dir, `.pi/knowledge/general/${a.name}.yaml`), "");
  }

  return dir;
}

export async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
