import type { ThemeColor } from "@mariozechner/pi-coding-agent";
import type { AgentConfig } from "pi-agents";
import { describe, expect, it } from "vitest";
import { renderConversation } from "./conversation.js";
import type { ConversationEvent } from "./state.js";

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

const noopTheme = {
  fg: (_c: ThemeColor, t: string) => t,
  bold: (t: string) => t,
  bg: (_c: string, t: string) => t,
};

function stubConfig(name: string): AgentConfig {
  return {
    frontmatter: {
      name,
      description: `${name} agent`,
      model: "anthropic/claude-sonnet-4-6",
      role: "worker",
      color: "#36f9f6",
      icon: "🔨",
      domain: [{ path: "src/", read: true, write: true, delete: false }],
      tools: ["read"],
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

const agents = new Map([
  ["orchestrator", stubConfig("orchestrator")],
  ["builder", stubConfig("builder")],
]);

describe("renderConversation", () => {
  it("renders delegation event as bordered box with sender → receiver header", () => {
    const events: ConversationEvent[] = [{ type: "delegation", from: "orchestrator", to: "builder", task: "Build it" }];
    const comp = renderConversation({ events, agents, theme: noopTheme });
    const lines = comp.render(60);
    const joined = lines.map(strip).join("\n");
    expect(joined).toContain("orchestrator");
    expect(joined).toContain("→");
    expect(joined).toContain("builder");
    expect(joined).toContain("Build it");
  });

  it("renders response event as bordered box with agent header", () => {
    const events: ConversationEvent[] = [{ type: "response", agent: "builder", output: "Done. Created 3 files." }];
    const comp = renderConversation({ events, agents, theme: noopTheme });
    const lines = comp.render(60);
    const joined = lines.map(strip).join("\n");
    expect(joined).toContain("builder");
    expect(joined).toContain("Done. Created 3 files.");
  });

  it("renders multiple events as stacked blocks", () => {
    const events: ConversationEvent[] = [
      { type: "delegation", from: "orchestrator", to: "builder", task: "Build it" },
      { type: "response", agent: "builder", output: "Done." },
    ];
    const comp = renderConversation({ events, agents, theme: noopTheme });
    const lines = comp.render(60);
    // Should have two bordered boxes (two ┌ and two └)
    const tops = lines.filter((l) => strip(l).startsWith("┌"));
    const bottoms = lines.filter((l) => strip(l).startsWith("└"));
    expect(tops).toHaveLength(2);
    expect(bottoms).toHaveLength(2);
  });

  it("returns empty container for no events", () => {
    const comp = renderConversation({ events: [], agents, theme: noopTheme });
    const lines = comp.render(60);
    expect(lines).toHaveLength(0);
  });
});
