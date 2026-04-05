import { Text, visibleWidth } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import { BorderedBox } from "./bordered-box.js";

const noColor = (s: string) => s;

describe("BorderedBox", () => {
  it("renders top border with header text", () => {
    const box = new BorderedBox({ header: "hello", borderColor: noColor });
    box.addChild(new Text("body", 0, 0));
    const lines = box.render(40);
    expect(lines[0]).toContain("┌─");
    expect(lines[0]).toContain("hello");
    expect(lines[0]).toContain("┐");
  });

  it("renders bottom border", () => {
    const box = new BorderedBox({ header: "hello", borderColor: noColor });
    box.addChild(new Text("body", 0, 0));
    const lines = box.render(40);
    const last = lines[lines.length - 1];
    expect(last).toContain("└");
    expect(last).toContain("┘");
  });

  it("renders side borders on body lines", () => {
    const box = new BorderedBox({ header: "hello", borderColor: noColor });
    box.addChild(new Text("some content here", 0, 0));
    const lines = box.render(40);
    // Body lines (between top and bottom border)
    const bodyLines = lines.slice(1, -1);
    for (const line of bodyLines) {
      expect(line.startsWith("│")).toBe(true);
      expect(line.endsWith("│")).toBe(true);
    }
  });

  it("fills to exact width", () => {
    const box = new BorderedBox({ header: "hi", borderColor: noColor });
    box.addChild(new Text("x", 0, 0));
    const lines = box.render(50);
    for (const line of lines) {
      // All lines should be exactly 50 visible chars
      expect(visibleWidth(line)).toBe(50);
    }
  });

  it("renders padding lines inside border", () => {
    const box = new BorderedBox({ header: "hi", borderColor: noColor });
    box.addChild(new Text("content", 0, 0));
    const lines = box.render(40);
    // Line after top border should be an empty padded line
    expect(lines[1]).toMatch(/^│\s+│$/);
    // Line before bottom border should be an empty padded line
    expect(lines[lines.length - 2]).toMatch(/^│\s+│$/);
  });

  it("renders without header", () => {
    const box = new BorderedBox({ borderColor: noColor });
    box.addChild(new Text("content", 0, 0));
    const lines = box.render(40);
    expect(lines[0]).toMatch(/^┌─+┐$/);
  });
});
