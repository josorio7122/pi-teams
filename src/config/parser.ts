import { extractFrontmatter } from "pi-agents";
import { z } from "zod/v4";

const AgentMemberSchema = z.object({
  agent: z.string().min(1),
  "consult-when": z.string().min(1).optional(),
});

type TeamMember = z.infer<typeof AgentMemberSchema> | TeamNode;
type TeamNode = {
  lead: string;
  "consult-when"?: string | undefined;
  members: readonly TeamMember[];
};

const TeamMemberSchema: z.ZodType<TeamMember> = z.union([
  AgentMemberSchema,
  z.object({
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
  const extracted = extractFrontmatter(content);
  if (!extracted.ok) return extracted;

  const parsed = TeamConfigSchema.safeParse(extracted.value.frontmatter);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    if (!first) return { ok: false, error: "Validation failed" };
    return { ok: false, error: `${first.path.join(".")}: ${first.message}` };
  }

  return { ok: true, value: parsed.data };
}
