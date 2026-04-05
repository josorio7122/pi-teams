import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAgents } from "./resolver.js";

function validAgent(name: string) {
  return `---
name: ${name}
description: Test agent ${name}
model: anthropic/claude-sonnet-4-6
role: worker
color: "#36f9f6"
icon: "🔨"
domain:
  - path: src/
    read: true
    write: true
    delete: false
tools:
  - read
  - write
skills:
  - path: .pi/skills/test.md
    when: Always
knowledge:
  project:
    path: .pi/knowledge/project/${name}.yaml
    description: Project knowledge
    updatable: true
    max-lines: 5000
  general:
    path: .pi/knowledge/general/${name}.yaml
    description: General knowledge
    updatable: true
    max-lines: 3000
conversation:
  path: .pi/sessions/{{SESSION_ID}}/conversation.jsonl
---
# ${name}
You are ${name}.
`;
}

describe("resolveAgents", () => {
  let tmpDir: string;

  async function writeAgent(name: string, content: string) {
    await writeFile(join(tmpDir, `${name}.md`), content, "utf-8");
  }

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pi-teams-resolver-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("resolves a single agent by name", async () => {
    await writeAgent("builder", validAgent("builder"));
    const result = await resolveAgents({ agentsDir: tmpDir, names: ["builder"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agents.get("builder")).toBeDefined();
    expect(result.agents.get("builder")!.frontmatter.name).toBe("builder");
  });

  it("resolves multiple agents", async () => {
    await writeAgent("builder", validAgent("builder"));
    await writeAgent("reviewer", validAgent("reviewer"));
    const result = await resolveAgents({ agentsDir: tmpDir, names: ["builder", "reviewer"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agents.size).toBe(2);
  });

  it("fails when agent file is missing", async () => {
    const result = await resolveAgents({ agentsDir: tmpDir, names: ["nonexistent"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("nonexistent");
    expect(result.errors[0]).toContain("not found");
  });

  it("fails when agent file has invalid frontmatter", async () => {
    await writeFile(join(tmpDir, "broken.md"), "---\nname: broken\n---\nBody", "utf-8");
    const result = await resolveAgents({ agentsDir: tmpDir, names: ["broken"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("fails when frontmatter name does not match referenced name", async () => {
    await writeAgent("wrong", validAgent("actually-different"));
    const result = await resolveAgents({ agentsDir: tmpDir, names: ["wrong"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("wrong");
    expect(result.errors[0]).toContain("actually-different");
  });

  it("collects all errors instead of failing on first", async () => {
    const result = await resolveAgents({ agentsDir: tmpDir, names: ["missing-a", "missing-b"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(2);
  });
});
