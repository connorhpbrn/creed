import { NextResponse } from "next/server";
import type { CreedSection } from "@/lib/creed-data";
import { loadCreedState, persistCreedState } from "@/lib/creed-backend";
import { requireApiAuth } from "@/lib/api-auth";
import { parseCreedMarkdown } from "@/lib/creed-markdown";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordAuditEvent } from "@/lib/audit-log";

// Onboarding compose via copy-paste (replaces the old MCP compose_creed). The
// user pastes the markdown Creed their assistant produced; we parse it and map
// the bodies onto their seed sections. Session-authed (not the MCP write token):
// onboarding never touches MCP, which stays a paid-only feature.
//
// Initialize-only: it runs only while the Creed is still the pristine seed (no
// section is agent-authored yet), so it can never wipe real edits. Parsing reuse
// is parseCreedMarkdown, which already runs markdownToRichHtml per body, so the
// resulting `content` is normalized, XSS-safe HTML - do NOT normalize it again.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MARKDOWN = 100_000;
// parseCreedMarkdown fills an empty section body with this placeholder; treat it
// as "no content" so an empty heading keeps the seed draft rather than blanking.
const EMPTY_PLACEHOLDER = "Start shaping this section.";

// The prompt asks the assistant to wrap the Creed in one fenced code block. If
// the user pastes the whole reply (fence + any preamble), pull the fenced body
// so stray ``` markers don't get parsed as a code block; otherwise use as-is
// (covers users who copied just the code block, which drops the fences).
function stripCodeFence(input: string): string {
  const match = input.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);
  return match && match[1].trim() ? match[1] : input;
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const verdict = await checkRateLimit({
    scope: "onboarding-compose",
    identifier: auth.user.id,
    limit: 10,
    windowMs: 60_000,
  });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const markdown =
    body && typeof body === "object" && typeof (body as { markdown?: unknown }).markdown === "string"
      ? (body as { markdown: string }).markdown
      : null;
  if (!markdown || !markdown.trim()) {
    return NextResponse.json({ error: "Paste your Creed first." }, { status: 400 });
  }
  if (markdown.length > MAX_MARKDOWN) {
    return NextResponse.json({ error: "That's too long to be a Creed." }, { status: 400 });
  }

  const result = await loadCreedState(auth.supabase, auth.user, {
    proposalLimit: 1,
    activityLimit: 1,
  });

  if (result.state.sections.length === 0) {
    return NextResponse.json(
      { error: "Finish the onboarding questions first." },
      { status: 409 }
    );
  }
  // Pristine-window guard: only the seed (nothing agent-authored) can be
  // composed. A re-paste after composing returns already_composed so the client
  // can just advance to the preview instead of dead-ending.
  if (result.state.sections.some((section) => section.lastEditedType === "agent")) {
    return NextResponse.json({ error: "already_composed" }, { status: 409 });
  }

  const parsed = parseCreedMarkdown(stripCodeFence(markdown));

  // Map parsed bodies onto the seed sections by id. parseCreedMarkdown normalizes
  // each heading to the same ids the seed uses, so this upgrades content while
  // keeping the seed spine (id/name/accent/template/permission). Unmatched seed
  // sections keep their draft; extra pasted sections are ignored.
  const parsedById = new Map<string, string>();
  for (const section of parsed.sections) {
    const text = section.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!text || text === EMPTY_PLACEHOLDER) continue;
    parsedById.set(section.id, section.content);
  }

  let matched = 0;
  const nextSections: CreedSection[] = result.state.sections.map((section) => {
    const content = parsedById.get(section.id);
    if (!content || content === section.content) {
      return section;
    }
    matched += 1;
    return {
      ...section,
      content,
      // Stays "propose": ongoing edits need approval; this paste is the one
      // allowed initialize. Marked agent-authored so resume/composed detection
      // treats the Creed as composed.
      lastEditedBy: "Your assistant",
      lastEditedType: "agent" as const,
      lastEditedLabel: "just now",
    };
  });

  if (matched === 0) {
    // Nothing recognizable in the paste; write nothing and let the client show
    // an inline "that doesn't look right" message.
    return NextResponse.json({ ok: false, matched: 0 }, { status: 200 });
  }

  const nextState = {
    ...result.state,
    lastSavedAt: Date.now(),
    sections: nextSections,
    proposals: [],
    mutationTick: result.state.mutationTick + 1,
  };

  await persistCreedState(auth.supabase, auth.user.id, nextState);

  void recordAuditEvent({
    userId: auth.user.id,
    action: "creed.composed",
    request,
    metadata: { matched },
  });

  return NextResponse.json({ ok: true, matched, sections: nextSections });
}
