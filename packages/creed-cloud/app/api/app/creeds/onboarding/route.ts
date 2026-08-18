import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireApiAuth } from "@/lib/api-auth";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";
import { getCreedRole } from "@/lib/creed-membership";
import { setActiveCreed } from "@/lib/creed-context";
import { parseCreedMarkdown } from "@creed/core/creed-markdown";
import {
  buildSharedOnboardingSections,
  sharedNameFromOnboarding,
  EMPTY_SHARED_ONBOARDING,
  type SharedOnboardingState,
} from "@creed/cloud/lib/onboarding/compile-shared";

// Shared onboarding, mirroring the personal compose flow with three actions:
//   seed     - persist the deterministic starter sections from the answers,
//              set the shared name, keep onboarding in progress.
//   compose  - map the markdown the owner's assistant produced onto the seeded
//              sections (the copy-paste "build my Creed" step).
//   complete - finish onboarding (clear the resume pointer).
// Owner-only. The seed is a valid shared Creed on its own, so compose is
// optional (the owner can skip pasting and go straight to the file).
// First-run creates the Shared Creed with forOnboarding so onboarding_stage is
// set; switcher-created Creeds stay ready with a null stage.

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
    answers?: Partial<SharedOnboardingState>;
    markdown?: unknown;
  };
  if (typeof body.creedId !== "string") {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }
  const creedId = body.creedId;
  if (
    body.action !== "seed" &&
    body.action !== "compose" &&
    body.action !== "complete"
  ) {
    return NextResponse.json({ error: "Unknown onboarding action." }, { status: 400 });
  }
  const action = body.action;

  const role = await getCreedRole(auth.supabase, auth.user.id, creedId);
  if (role !== "owner") {
    return NextResponse.json({ error: "Only the owner can set up this Creed." }, { status: 403 });
  }

  const db = admin();
  // ── complete ──────────────────────────────────────────────────────────────
  if (action === "complete") {
    const { error } = await db.rpc("apply_creed_onboarding_action", {
      p_creed_id: creedId,
      p_actor_user_id: auth.user.id,
      p_action: "complete",
      p_activity_id: randomBytes(16).toString("hex"),
    });
    if (error) {
      return NextResponse.json({ error: "Could not complete onboarding." }, { status: 500 });
    }
    // Activate the shared Creed the owner just finished building. Without this
    // the active-Creed cookie stays unset, and resolveActiveCreed prefers a
    // personal Creed, so a dual-Creed owner would land back in their personal
    // Creed instead of the shared they just set up.
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
    const updates = sections.flatMap((section) => {
      if (!section.changed) return [];
      matched += 1;
      return [{ section_id: section.id, content: section.content }];
    });
    if (updates.length > 0) {
      const { error } = await db.rpc("apply_creed_onboarding_action", {
        p_creed_id: creedId,
        p_actor_user_id: auth.user.id,
        p_action: "compose",
        p_sections: updates,
      });
      if (error) {
        return NextResponse.json({ error: "Could not compose this Creed." }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: matched > 0,
      matched,
      sections: sections.map(({ id, name, accent, content }) => ({ id, name, accent, content })),
    });
  }

  // ── seed (default) ──────────────────────────────────────────────────────────
  const answers: SharedOnboardingState = { ...EMPTY_SHARED_ONBOARDING, ...(body.answers ?? {}) };
  const sections = buildSharedOnboardingSections(answers);
  const name = sharedNameFromOnboarding(answers);

  // creed_sections' primary key is (user_id, section_id), so one user cannot
  // hold the same section_id twice - and the owner's PERSONAL Creed already owns
  // ids like "people" and "agent-rules". Seeding the shared's semantic ids
  // as-is collides with those personal rows (the PK conflict is separate from
  // the ON CONFLICT (creed_id, section_id) target, so the upsert aborts).
  // Namespacing every shared section id to its Creed guarantees uniqueness per
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
    agent_writable: true,
    template: section.template,
    last_edited_by: "You",
    last_edited_type: "user",
    revision: 1,
  }));

  const { error } = await db.rpc("apply_creed_onboarding_action", {
    p_creed_id: creedId,
    p_actor_user_id: auth.user.id,
    p_action: "seed-shared",
    p_name: name,
    p_sections: sectionRows,
  });
  if (error) {
    return NextResponse.json({ error: "Could not save Shared Creed setup." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
