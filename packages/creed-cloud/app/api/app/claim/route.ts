import { NextResponse } from "next/server";
import type { CreedSection } from "@creed/core/creed-data";
import { ensurePersonalCreedId } from "@/lib/creed-context";
import { requireApiAuth } from "@/lib/api-auth";
import { recordAuditEvent } from "@/lib/audit-log";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";

const ALLOWED_KINDS = new Set([
  "rich-text",
  "chips",
  "rules",
  "decisions",
  "focus",
]);

const ALLOWED_ACCENTS = new Set([
  "identity",
  "stack",
  "operating-principles",
  "decisions",
  "preferences",
  "workflows",
  "tools",
  "boundaries",
  "questions",
  "skills",
  "mini-skills",
  "projects",
  "output",
  "rose",
  "custom",
]);

function isString(value: unknown, max = 5000): value is string {
  return typeof value === "string" && value.length <= max;
}

function validateSections(value: unknown): CreedSection[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) {
    return null;
  }

  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const section = item as Record<string, unknown>;
    if (!isString(section.id, 200)) return null;
    if (!isString(section.name, 500)) return null;
    if (typeof section.kind !== "string" || !ALLOWED_KINDS.has(section.kind)) return null;
    if (typeof section.accent !== "string" || !ALLOWED_ACCENTS.has(section.accent)) return null;
  }

  return value as CreedSection[];
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sections =
    body && typeof body === "object" && "sections" in body
      ? validateSections((body as { sections: unknown }).sections)
      : null;

  if (!sections) {
    return NextResponse.json(
      { error: "Missing or invalid starter sections" },
      { status: 400 }
    );
  }

  const creedId = await ensurePersonalCreedId(auth.supabase, auth.user);
  const sectionRows = sections.map((section, position) => ({
    section_id: section.id,
    position,
    kind: section.kind,
    name: section.name,
    accent: section.accent,
    payload: {
      content: section.content,
      template: section.template,
      agentWritable: section.agentWritable,
      agentPermission: section.agentPermission,
    },
    agent_permission: section.agentPermission,
    agent_writable: section.agentWritable,
    template: section.template,
    last_edited_by: section.lastEditedBy,
    last_edited_type: section.lastEditedType,
    revision: 1,
  }));
  const db = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { error } = await db.rpc("apply_creed_onboarding_action", {
    p_creed_id: creedId,
    p_actor_user_id: auth.user.id,
    p_action: "replace-placeholder",
    p_sections: sectionRows,
  });
  if (error) {
    return NextResponse.json({ error: "Could not save starter sections." }, { status: 500 });
  }

  void recordAuditEvent({
    userId: auth.user.id,
    action: "creed.claimed",
    request,
    metadata: { sectionCount: sections.length },
  });

  return NextResponse.json({ ok: true });
}
