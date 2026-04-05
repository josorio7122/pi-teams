import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentConfig } from "pi-agents";
import { parseAgentFile, validateAgent } from "pi-agents";

type ResolveSuccess = { readonly ok: true; readonly agents: ReadonlyMap<string, AgentConfig> };
type ResolveFailure = { readonly ok: false; readonly errors: ReadonlyArray<string> };
type ResolveResult = ResolveSuccess | ResolveFailure;

export async function resolveAgents(params: {
  readonly agentsDir: string;
  readonly names: ReadonlyArray<string>;
}): Promise<ResolveResult> {
  const errors: string[] = [];
  const agents = new Map<string, AgentConfig>();

  for (const name of params.names) {
    const filePath = join(params.agentsDir, `${name}.md`);

    try {
      await access(filePath);
    } catch {
      errors.push(`Agent "${name}" not found at ${filePath}`);
      continue;
    }

    const content = await readFile(filePath, "utf-8");
    const parsed = parseAgentFile(content);
    if (!parsed.ok) {
      errors.push(`Agent "${name}" parse error: ${parsed.error}`);
      continue;
    }

    const validated = validateAgent({
      frontmatter: parsed.value.frontmatter,
      body: parsed.value.body,
      filePath,
      source: "project",
    });

    if (!validated.ok) {
      for (const d of validated.errors) {
        errors.push(`Agent "${name}": ${d.message}`);
      }
      continue;
    }

    if (validated.value.frontmatter.name !== name) {
      errors.push(`Agent "${name}": frontmatter name is "${validated.value.frontmatter.name}" but expected "${name}"`);
      continue;
    }

    agents.set(name, validated.value);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, agents };
}
