import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAgents } from "./resolver.js";

const tmpDir = join(import.meta.dirname, "__test-agents__");

function writeAgent(name: string, content: string) {
  writeFileSync(join(tmpDir, `${name}.md`), content, "utf-8");
}

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

beforeEach(() => {
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  const { rmSync } = require("node:fs");
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("resolveAgents", () => {
  it("resolves a single agent by name", () => {
    writeAgent("builder", validAgent("builder"));
    const result = resolveAgents({ agentsDir: tmpDir, names: ["builder"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agents.get("builder")).toBeDefined();
    expect(result.agents.get("builder")!.frontmatter.name).toBe("builder");
  });

  it("resolves multiple agents", () => {
    writeAgent("builder", validAgent("builder"));
    writeAgent("reviewer", validAgent("reviewer"));
    const result = resolveAgents({ agentsDir: tmpDir, names: ["builder", "reviewer"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agents.size).toBe(2);
  });

  it("fails when agent file is missing", () => {
    const result = resolveAgents({ agentsDir: tmpDir, names: ["nonexistent"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("nonexistent");
    expect(result.errors[0]).toContain("not found");
  });

  it("fails when agent file has invalid frontmatter", () => {
    writeFileSync(join(tmpDir, "broken.md"), "---\nname: broken\n---\nBody", "utf-8");
    const result = resolveAgents({ agentsDir: tmpDir, names: ["broken"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("fails when frontmatter name does not match referenced name", () => {
    writeAgent("wrong", validAgent("actually-different"));
    const result = resolveAgents({ agentsDir: tmpDir, names: ["wrong"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("wrong");
    expect(result.errors[0]).toContain("actually-different");
  });

  it("collects all errors instead of failing on first", () => {
    const result = resolveAgents({ agentsDir: tmpDir, names: ["missing-a", "missing-b"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(2);
  });
});
