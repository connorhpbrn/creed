import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireApiAuth } from "@/lib/api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseLikeClient } from "@/lib/supabase/types";
import { getCreedRole } from "@/lib/creed-membership";
import { setActiveCreed } from "@/lib/creed-context";
import { parseCreedMarkdown } from "@/lib/creed-markdown";
import {
  buildCompanyOnboardingSections,
  companyNameFromOnboarding,
  EMPTY_COMPANY_ONBOARDING,
  type CompanyOnboardingState,
} from "@/lib/onboarding/compile-company";

// Company onboarding, mirroring the personal compose flow with three actions:
//   seed     - persist the deterministic starter sections from the answers,
//              set the company name, keep onboarding in progress.
//   compose  - map the markdown the owner's assistant produced onto the seeded
//              sections (the copy-paste "build my Creed" step).
//   complete - finish onboarding (clear the resume pointer).
// Owner-only. The seed is a valid company Creed on its own, so compose is
// optional (the owner can skip pasting and go straight to the file).

const EMPTY_PLACEHOLDER = "Start shaping this section.";
const MAX_MARKDOWN = 100_000;

function admin(): SupabaseLikeClient {
  return getSupabaseAdminClient() as unknown as SupabaseLikeClient;
}

function stripCodeFence(input: string): string {
  const match = input.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);
  return match && match[1].trim() ? match[1] : input;
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as {
    creedId?: unknown;
    action?: unknown;
    answers?: Partial<CompanyOnboardingState>;
    markdown?: unknown;
  };
  if (typeof body.creedId !== "string") {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }
  const creedId = body.creedId;
  const action = body.action === "compose" || body.action === "complete" ? body.action : "seed";

  const role = await getCreedRole(auth.supabase, auth.user.id, creedId);
  if (role !== "owner") {
    return NextResponse.json({ error: "Only the owner can set up the company." }, { status: 403 });
  }

  const db = admin();
  const now = new Date().toISOString();

  // ── complete ──────────────────────────────────────────────────────────────
  if (action === "complete") {
    await db.from("creed_activity").insert({
      id: randomBytes(16).toString("hex"),
      creed_id: creedId,
      user_id: auth.user.id,
      actor_user_id: auth.user.id,
      actor: "You",
      actor_type: "user",
      summary: "Set up the company Creed",
      status: "direct",
      event_kind: "edit",
    });
    await db.from("creeds").update({ onboarding_stage: null, updated_at: now }).eq("id", creedId);
    // Activate the company Creed the owner just finished building. Without this
    // the active-Creed cookie stays unset, and resolveActiveCreed prefers a
    // personal Creed, so a dual-Creed owner would land back in their personal
    // Creed instead of the company they just set up.
    await setActiveCreed(auth.supabase, auth.user, creedId);
    return NextResponse.json({ ok: true });
  }

  // ── compose ───────────────────────────────────────────────────────────────
  if (action === "compose") {
    const markdown = typeof body.markdown === "string" ? body.markdown : "";
    if (!markdown.trim()) {
      return NextResponse.json({ error: "Paste your Creed first." }, { status: 400 });
    }
    if (markdown.length > MAX_MARKDOWN) {
      return NextResponse.json({ error: "That's too long to be a Creed." }, { status: 400 });
    }
    const { data: sectionRows } = (await db
      .from("creed_sections")
      .select("section_id, name, accent, payload, revision, position")
      .eq("creed_id", creedId)
      .is("deleted_at", null)
      .order("position", { ascending: true })) as {
      data: Array<{ section_id: string; name: string; accent: string; payload: { content?: string } & Record<string, unknown>; revision: number; position: number }> | null;
    };
    if (!sectionRows || sectionRows.length === 0) {
      return NextResponse.json({ error: "Finish the questions first." }, { status: 409 });
    }

    // Map parsed bodies onto the seeded sections by matching heading name.
    const parsed = parseCreedMarkdown(stripCodeFence(markdown));
    const byName = new Map<string, string>();
    for (const section of parsed.sections) {
      const text = section.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      if (!text || text === EMPTY_PLACEHOLDER) continue;
      byName.set(section.name.trim().toLowerCase(), section.content);
    }

    let matched = 0;
    const sections = sectionRows.map((row) => {
      const composed = byName.get(row.name.trim().toLowerCase());
      const content = composed && composed !== row.payload.content ? composed : (row.payload.content ?? "");
      return { id: row.section_id, name: row.name, accent: row.accent, content, changed: Boolean(composed && composed !== row.payload.content) };
    });
    for (const [i, row] of sectionRows.entries()) {
      if (!sections[i].changed) continue;
      matched += 1;
      await db
        .from("creed_sections")
        .update({
          payload: { ...row.payload, content: sections[i].content },
          revision: row.revision + 1,
          last_edited_by: "Your assistant",
          last_edited_type: "agent",
          last_edited_at: now,
          updated_at: now,
        })
        .eq("creed_id", creedId)
        .eq("section_id", row.section_id);
    }

    return NextResponse.json({
      ok: matched > 0,
      matched,
      sections: sections.map(({ id, name, accent, content }) => ({ id, name, accent, content })),
    });
  }

  // ── seed (default) ──────────────────────────────────────────────────────────
  const answers: CompanyOnboardingState = { ...EMPTY_COMPANY_ONBOARDING, ...(body.answers ?? {}) };
  const sections = buildCompanyOnboardingSections(answers);
  const name = companyNameFromOnboarding(answers);

  // creed_sections' primary key is (user_id, section_id), so one user cannot
  // hold the same section_id twice - and the owner's PERSONAL Creed already owns
  // ids like "people" and "agent-rules". Seeding the company's semantic ids
  // as-is collides with those personal rows (the PK conflict is separate from
  // the ON CONFLICT (creed_id, section_id) target, so the upsert aborts).
  // Namespacing every company section id to its Creed guarantees uniqueness per
  // user without touching the personal write path. The id is internal (React
  // keys / DOM anchors); the display name is unchanged.
  const scopedId = (id: string) => `${creedId}__${id}`;

  const sectionRows = sections.map((section, index) => ({
    creed_id: creedId,
    user_id: auth.user.id,
    section_id: scopedId(section.id),
    position: index,
    kind: "rich-text",
    name: section.name,
    accent: section.accent,
    payload: { content: section.content, template: section.template, agentWritable: true },
    agent_permission: section.agentPermission,
    last_edited_by: "You",
    last_edited_type: "user",
    last_edited_at: now,
    revision: 1,
    created_at: now,
    updated_at: now,
  }));

  const { error: sectionsError } = await db
    .from("creed_sections")
    .upsert(sectionRows, { onConflict: "creed_id,section_id" });
  if (sectionsError) {
    return NextResponse.json({ error: "Could not seed the company Creed." }, { status: 500 });
  }

  await db
    .from("creeds")
    .update({ name, onboarding_stage: "composing", updated_at: now })
    .eq("id", creedId);

  return NextResponse.json({ ok: true });
}
