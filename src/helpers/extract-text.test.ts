import { describe, expect, it } from "vitest";
import { extractLastAssistantText } from "./extract-text.js";

describe("extractLastAssistantText", () => {
  it("returns text from last assistant message", () => {
    const messages = [
      { role: "user", content: [{ type: "text", text: "hello" }] },
      { role: "assistant", content: [{ type: "text", text: "response" }] },
    ];
    expect(extractLastAssistantText(messages)).toBe("response");
  });

  it("returns empty string when no assistant messages", () => {
    const messages = [{ role: "user", content: [{ type: "text", text: "hello" }] }];
    expect(extractLastAssistantText(messages)).toBe("");
  });

  it("skips assistant messages with empty text", () => {
    const messages = [
      { role: "assistant", content: [{ type: "text", text: "first" }] },
      { role: "assistant", content: [{ type: "text", text: "  " }] },
    ];
    expect(extractLastAssistantText(messages)).toBe("first");
  });

  it("joins multiple text parts", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "part1" },
          { type: "text", text: "part2" },
        ],
      },
    ];
    expect(extractLastAssistantText(messages)).toBe("part1part2");
  });

  it("ignores non-text content parts", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "tool_use", text: "ignored" },
          { type: "text", text: "kept" },
        ],
      },
    ];
    expect(extractLastAssistantText(messages)).toBe("kept");
  });
});
