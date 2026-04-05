import type { Component } from "@mariozechner/pi-tui";
import { visibleWidth } from "@mariozechner/pi-tui";

type BorderedBoxParams = Readonly<{
  header?: string;
  borderColor: (s: string) => string;
}>;

// Class required: pi-tui's Component interface mandates render/invalidate methods
// and addChild for container-style components. All pi-tui components use classes.
export class BorderedBox implements Component {
  private children: Component[] = [];
  private header: string | undefined;
  private borderColor: (s: string) => string;

  constructor(params: BorderedBoxParams) {
    this.header = params.header;
    this.borderColor = params.borderColor;
  }

  addChild(component: Component) {
    this.children.push(component);
  }

  invalidate() {
    for (const child of this.children) child.invalidate();
  }

  render(width: number): string[] {
    const bc = this.borderColor;
    const inner = Math.max(1, width - 4); // "│  " content " │"
    const lines: string[] = [];

    // Top border with optional header
    // Layout: ┌─ {header} ─...─┐  →  2 + 1 + headerVis + 1 + fill + 1 = width
    if (this.header) {
      const headerVis = visibleWidth(this.header);
      const fill = Math.max(0, width - 5 - headerVis);
      lines.push(`${bc("┌─")} ${this.header} ${bc("─".repeat(fill) + "┐")}`);
    } else {
      lines.push(bc(`┌${"─".repeat(width - 2)}┐`));
    }

    // Top padding
    lines.push(`${bc("│")}${" ".repeat(width - 2)}${bc("│")}`);

    // Children
    for (const child of this.children) {
      for (const line of child.render(inner)) {
        const vis = visibleWidth(line);
        const pad = Math.max(0, inner - vis);
        lines.push(`${bc("│")}  ${line}${" ".repeat(pad)}${bc("│")}`);
      }
    }

    // Bottom padding
    lines.push(`${bc("│")}${" ".repeat(width - 2)}${bc("│")}`);

    // Bottom border
    lines.push(bc(`└${"─".repeat(width - 2)}┘`));

    return lines;
  }
}
