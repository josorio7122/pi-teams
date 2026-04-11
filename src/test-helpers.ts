import type { AgentConfig } from "pi-agents";
import type { DelegateTarget } from "./delegate/targets.js";

export function stubConfig(
  name: string,
  overrides?: {
    readonly model?: string;
    readonly tools?: ReadonlyArray<string>;
  },
): AgentConfig {
  return {
    frontmatter: {
      name,
      description: `${name} agent`,
      model: overrides?.model ?? "anthropic/claude-sonnet-4-6",
      role: "worker",
      color: "#36f9f6",
      icon: "\ud83d\udd28",
      domain: [{ path: "src/", read: true, write: true, delete: false }],
      tools: overrides?.tools ? [...overrides.tools] : ["read"],
      skills: [{ path: ".pi/skills/test.md", when: "Always" }],
      knowledge: {
        project: { path: ".pi/k/p/x.yaml", description: "P", updatable: true, "max-lines": 100 },
        general: { path: ".pi/k/g/x.yaml", description: "G", updatable: true, "max-lines": 100 },
      },
      conversation: { path: ".pi/sessions/x/conversation.jsonl" },
    },
    systemPrompt: `You are ${name}.`,
    filePath: `.pi/agents/${name}.md`,
    source: "project",
  };
}

export function makeTarget(name: string, opts?: Partial<DelegateTarget>): DelegateTarget {
  return { name, config: stubConfig(name), ...opts };
}
