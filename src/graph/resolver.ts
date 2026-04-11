import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentConfig } from "pi-agents";
import { parseAgentFile, validateAgent } from "pi-agents";

type ResolveSuccess = { readonly ok: true; readonly agents: ReadonlyMap<string, AgentConfig> };
type ResolveFailure = { readonly ok: false; readonly errors: ReadonlyArray<string> };
type ResolveResult = ResolveSuccess | ResolveFailure;
type AgentResult =
  | { readonly ok: true; readonly name: string; readonly config: AgentConfig }
  | { readonly ok: false; readonly errors: ReadonlyArray<string> };

async function loadAgent(params: { readonly agentsDir: string; readonly name: string }): Promise<AgentResult> {
  const filePath = join(params.agentsDir, `${params.name}.md`);

  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return { ok: false, errors: [`Agent "${params.name}" not found at ${filePath}`] };
  }
  const parsed = parseAgentFile(content);
  if (!parsed.ok) {
    return { ok: false, errors: [`Agent "${params.name}" parse error: ${parsed.error}`] };
  }

  const validated = validateAgent({
    frontmatter: parsed.value.frontmatter,
    body: parsed.value.body,
    filePath,
    source: "project",
  });

  if (!validated.ok) {
    return { ok: false, errors: validated.errors.map((d) => `Agent "${params.name}": ${d.message}`) };
  }

  if (validated.value.frontmatter.name !== params.name) {
    return {
      ok: false,
      errors: [
        `Agent "${params.name}": frontmatter name is "${validated.value.frontmatter.name}" but expected "${params.name}"`,
      ],
    };
  }

  return { ok: true, name: params.name, config: validated.value };
}

export async function resolveAgents(params: {
  readonly agentsDir: string;
  readonly names: ReadonlyArray<string>;
}): Promise<ResolveResult> {
  const results = await Promise.all(params.names.map((name) => loadAgent({ agentsDir: params.agentsDir, name })));

  const errors = results.filter((r): r is AgentResult & { ok: false } => !r.ok).flatMap((r) => r.errors);

  if (errors.length > 0) return { ok: false, errors };

  const agents = new Map(
    results.filter((r): r is AgentResult & { ok: true } => r.ok).map((r) => [r.name, r.config] as const),
  );

  return { ok: true, agents };
}
