/** Simulates the pi-teams conversation view. Usage: npm run simulate:conversation */
import { Markdown, type MarkdownTheme, Text } from "@mariozechner/pi-tui";
import { BorderedBox } from "pi-agents";
import { agents, conversation } from "./conversation-data.js";
import type { Agent, ConversationEvent } from "./conversation-data.js";

// ── ANSI ────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[90m";

function rgb(hex: string, text: string) {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m${text}${RESET}`;
}

function agentLabel(a: Agent) {
  return `${a.icon} ${rgb(a.color, a.name)}`;
}

const dim = (s: string) => `${DIM}${s}${RESET}`;

// ── Markdown theme ──────────────────────────────────────────

const mdTheme: MarkdownTheme = {
  heading: (s) => `${BOLD}${s}${RESET}`,
  link: (s) => `\x1b[36m${s}${RESET}`,
  linkUrl: (s) => `${DIM}${s}${RESET}`,
  code: (s) => `\x1b[36m${s}${RESET}`,
  codeBlock: (s) => s,
  codeBlockBorder: (s) => `${DIM}${s}${RESET}`,
  quote: (s) => s,
  quoteBorder: (s) => `${DIM}${s}${RESET}`,
  hr: (s) => `${DIM}${s}${RESET}`,
  listBullet: (s) => `${DIM}${s}${RESET}`,
  bold: (s) => `${BOLD}${s}${RESET}`,
  italic: (s) => `\x1b[3m${s}${RESET}`,
  strikethrough: (s) => `\x1b[9m${s}${RESET}`,
  underline: (s) => `\x1b[4m${s}${RESET}`,
};

// ── Render ───────────────────────────────────────────────────

const WIDTH = process.stdout.columns || 80;

function renderEvent(event: ConversationEvent) {
  const borderColor = dim;

  if (event.type === "delegation") {
    const from = agents[event.from];
    const to = agents[event.to];
    if (!from || !to) return [];
    const header = `${agentLabel(from)} ${dim("→")} ${agentLabel(to)}`;
    const box = new BorderedBox({ header, borderColor });
    box.addChild(new Markdown(event.task, 0, 0, mdTheme));
    return box.render(WIDTH);
  }

  const a = agents[event.agent];
  if (!a) return [];
  const box = new BorderedBox({ header: agentLabel(a), borderColor });
  box.addChild(new Markdown(event.output, 0, 0, mdTheme));
  return box.render(WIDTH);
}

// ── Animate ──────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function clearLines(count: number) {
  if (count > 0) process.stdout.write(`\x1b[${count}A\x1b[J`);
}

function printLines(lines: ReadonlyArray<string>) {
  for (const line of lines) process.stdout.write(`${line}\n`);
}

function stripAnsi(s: string) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

async function streamBlock(event: ConversationEvent) {
  const fullLines = renderEvent(event);
  if (fullLines.length === 0) return;

  // Find the body content lines (between padding lines)
  // Structure: topBorder, padTop, ...body, padBottom, bottomBorder
  const topBorder = fullLines[0];
  const padTop = fullLines[1];
  const padBottom = fullLines[fullLines.length - 2];
  const bottomBorder = fullLines[fullLines.length - 1];
  const bodyLines = fullLines.slice(2, -2);

  // Phase 1: show empty box (header + padding + bottom border)
  let currentLines = [topBorder, padTop, padBottom, bottomBorder].filter(
    (l): l is string => l !== undefined,
  );
  printLines(currentLines);
  await sleep(200);

  // Phase 2: grow body line by line
  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    if (!line) continue;
    clearLines(currentLines.length);
    const visibleBody = bodyLines.slice(0, i + 1);
    currentLines = [topBorder, padTop, ...visibleBody, padBottom, bottomBorder].filter(
      (l): l is string => l !== undefined,
    );
    printLines(currentLines);

    // Pause on content lines, skip spacers
    const stripped = stripAnsi(line);
    if (stripped.replace(/[│ ]/g, "") !== "") await sleep(40);
  }
}

async function animate() {
  console.log("");
  for (const event of conversation) {
    await streamBlock(event);
    console.log("");
    await sleep(300);
  }
}

animate().catch(console.error);
