/**
 * Spike: widget for real-time + custom message for permanent record.
 * 
 * Usage: pi -e scripts/spike-onupdate.ts
 */
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { BorderedBox } from "../src/tui/bordered-box.js";

type ConvEvent =
  | { type: "delegation"; from: string; to: string; task: string }
  | { type: "response"; agent: string; output: string };

function renderEvents(params: {
  readonly events: ReadonlyArray<ConvEvent>;
  readonly theme: { fg: (c: string, t: string) => string; bold: (t: string) => string };
}) {
  const { events, theme } = params;
  const container = new Container();
  const mdTheme = getMarkdownTheme();
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event) continue;
    if (i > 0) container.addChild(new Spacer(1));
    const header =
      event.type === "delegation"
        ? `${theme.fg("accent", event.from)} ${theme.fg("dim", "→")} ${theme.fg("accent", event.to)}`
        : theme.fg("accent", event.agent);
    const body = event.type === "delegation" ? event.task : event.output;
    const box = new BorderedBox({ header, borderColor: (s) => theme.fg("dim", s) });
    box.addChild(new Markdown(body, 0, 0, mdTheme));
    container.addChild(box);
  }
  return container;
}

export default function (pi: ExtensionAPI) {
  const events: ConvEvent[] = [];
  let ctx: Parameters<Parameters<ExtensionAPI["on"]>[1]>[1] | undefined;

  function updateWidget() {
    if (!ctx) return;
    const snapshot = [...events];
    ctx.ui.setWidget("spike-conv", (_tui, theme) => {
      const comp = renderEvents({ events: snapshot, theme });
      return { render: (w: number) => comp.render(w), invalidate: () => comp.invalidate() };
    });
  }

  // Register permanent message renderer (same visual as widget)
  pi.registerMessageRenderer("pi-teams-conversation", (message, _options, theme) => {
    const evts = (message.details as { events?: ConvEvent[] })?.events ?? [];
    return renderEvents({ events: evts, theme });
  });

  pi.on("resources_discover", () => {
    return { themePaths: [join(import.meta.dirname, "../themes")] };
  });

  pi.on("session_start", (_event, c) => {
    ctx = c;
    c.ui.setTheme("pi-teams-dark");
    c.ui.notify("[spike] Ask: 'Use the spike_test tool with message hello'", "info");
  });

  pi.registerTool({
    name: "spike_test",
    label: "Spike Test",
    description: "Test delegation with streaming conversation view",
    parameters: Type.Object({
      message: Type.String({ description: "A test message" }),
    }),

    renderCall(_args, _theme) {
      return new Container();
    },

    // biome-ignore lint/complexity/useMaxParams: Pi's ToolDefinition.renderResult
    renderResult(_result, _options, _theme) {
      return new Container();
    },

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      // Delegation appears immediately in widget
      events.push({
        type: "delegation",
        from: "orchestrator",
        to: "scout",
        task: `Find all API endpoints related to: **${params.message}**\n\nLook for FastAPI route definitions.`,
      });
      updateWidget();

      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Response appears in widget
      events.push({
        type: "response",
        agent: "scout",
        output: [
          "## Files Found",
          "",
          "- `src/api/app.py` — Main API with 6 endpoints",
          "",
          "## Key Patterns",
          "",
          "- **Async-first**: All endpoints use `async def`",
          `- Query: \`${params.message}\``,
        ].join("\n"),
      });
      updateWidget();

      // Clear widget + inject permanent custom message
      const snapshot = [...events];
      ctx?.ui.setWidget("spike-conv", undefined);

      pi.sendMessage(
        {
          customType: "pi-teams-conversation",
          content: "Delegation complete",
          display: true,
          details: { events: snapshot },
        },
        { deliverAs: "steer" },
      );

      return {
        content: [{ type: "text", text: snapshot.map((e) => (e.type === "response" ? e.output : "")).join("\n") }],
        details: {},
      };
    },
  });
}
