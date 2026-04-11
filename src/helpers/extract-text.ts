import { isRecord } from "pi-agents";

export function extractLastAssistantText(messages: ReadonlyArray<unknown>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!isRecord(msg) || msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
    const text = (msg.content as ReadonlyArray<Record<string, unknown>>)
      .filter((p) => "type" in p && p.type === "text" && "text" in p)
      .map((p) => String(p.text))
      .join("");
    if (text.trim()) return text;
  }
  return "";
}
