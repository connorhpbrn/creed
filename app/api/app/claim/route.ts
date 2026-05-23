import { NextResponse } from "next/server";
import type { CreedSection } from "@/lib/creed-data";
import { createBlankCreedState, persistCreedState } from "@/lib/creed-backend";
import { requireApiAuth } from "@/lib/api-auth";
import { recordAuditEvent } from "@/lib/audit-log";

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

  const nextState = createBlankCreedState(auth.user);
  nextState.sections = sections;
  nextState.proposals = [];
  nextState.activity = [];

  await persistCreedState(auth.supabase, auth.user.id, nextState);

  void recordAuditEvent({
    userId: auth.user.id,
    action: "creed.claimed",
    request,
    metadata: { sectionCount: sections.length },
  });

  return NextResponse.json({ ok: true });
}
