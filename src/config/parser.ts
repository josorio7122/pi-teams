import { parseFrontmatter } from "@mariozechner/pi-coding-agent";
import { z } from "zod/v4";

const AgentMemberSchema = z.object({
  agent: z.string().min(1),
  "consult-when": z.string().min(1).optional(),
});

type TeamMember = z.infer<typeof AgentMemberSchema> | TeamNode;
type TeamNode = {
  team: string;
  color?: string | undefined;
  lead: string;
  "consult-when"?: string | undefined;
  members: readonly TeamMember[];
};

const TeamMemberSchema: z.ZodType<TeamMember> = z.union([
  AgentMemberSchema,
  z.object({
    team: z.string().min(1),
    color: z.string().optional(),
    lead: z.string().min(1),
    "consult-when": z.string().min(1).optional(),
    members: z.lazy(() => z.array(TeamMemberSchema).min(1)),
  }),
]);

const TeamConfigSchema = z.object({
  paths: z.object({ agents: z.string().min(1) }),
  orchestrator: z.object({ agent: z.string().min(1) }),
  members: z.array(TeamMemberSchema).min(1),
});

export type TeamConfig = z.infer<typeof TeamConfigSchema>;

type ParseResult = { readonly ok: true; readonly value: TeamConfig } | { readonly ok: false; readonly error: string };

export function parseTeamFile(content: string): ParseResult {
  if (!content.trim()) {
    return { ok: false, error: "Empty file" };
  }

  if (!content.trimStart().startsWith("---")) {
    return { ok: false, error: "Missing frontmatter — file must start with ---" };
  }

  const { frontmatter } = parseFrontmatter(content);

  if (Object.keys(frontmatter).length === 0) {
    return { ok: false, error: "Missing frontmatter — no YAML fields found" };
  }

  const parsed = TeamConfigSchema.safeParse(frontmatter);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    if (!first) return { ok: false, error: "Validation failed" };
    return { ok: false, error: `${first.path.join(".")}: ${first.message}` };
  }

  return { ok: true, value: parsed.data };
}
