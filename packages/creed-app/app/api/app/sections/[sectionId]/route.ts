import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import {
  updateSharedSection,
  deleteSharedSection,
  setSharedSectionArchived,
  type SectionWriteResult,
} from "@/lib/shared-sections";
import { updatePersonalSectionContent } from "@/lib/creed-backend";

type Ctx = { params: Promise<{ sectionId: string }> };

function statusFor(result: Extract<SectionWriteResult, { ok: false }>): number {
  switch (result.code) {
    case "conflict":
      return 409;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    default:
      return 400;
  }
}

// PUT /api/app/sections/[sectionId] { creedId, baseRevision, content?, name?, accent? }
// Shared per-section save. Direct-edit members write; Proposal-only members
// file a proposal. baseRevision conflict returns 409 with the current revision.
export async function PUT(request: Request, ctx: Ctx) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const { sectionId } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (body ?? {}) as {
    creedId?: unknown;
    baseRevision?: unknown;
    content?: unknown;
    name?: unknown;
    accent?: unknown;
    archived?: unknown;
  };
  if (typeof b.creedId !== "string") {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }

  // Archive / restore is a metadata-only lifecycle change (owner/admin), so it
  // takes its own path: no baseRevision, no content write.
  if (typeof b.archived === "boolean") {
    const result = await setSharedSectionArchived({
      creedId: b.creedId,
      user: auth.user,
      sectionId,
      archived: b.archived,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: statusFor(result) });
    }
    return NextResponse.json(result);
  }

  if (typeof b.baseRevision !== "number") {
    return NextResponse.json({ error: "creedId and baseRevision are required." }, { status: 400 });
  }

  let result: SectionWriteResult;
  if (typeof b.content === "string" && b.name === undefined && b.accent === undefined) {
    const personalResult = await updatePersonalSectionContent(
      auth.supabase,
      auth.user.id,
      {
          creedId: b.creedId,
          sectionId,
          baseRevision: b.baseRevision,
          content: b.content,
      },
    );
    result =
      !personalResult.ok && personalResult.code === "forbidden"
        ? await updateSharedSection({
            creedId: b.creedId,
            user: auth.user,
            sectionId,
            baseRevision: b.baseRevision,
            content: b.content,
          })
        : personalResult;
  } else {
    result = await updateSharedSection({
          creedId: b.creedId,
          user: auth.user,
          sectionId,
          baseRevision: b.baseRevision,
          content: typeof b.content === "string" ? b.content : undefined,
          name: typeof b.name === "string" ? b.name : undefined,
          accent: typeof b.accent === "string" ? b.accent : undefined,
        });
  }

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code, currentRevision: result.currentRevision },
      { status: statusFor(result) }
    );
  }
  return NextResponse.json(result);
}

// DELETE /api/app/sections/[sectionId] { creedId } - permanently delete (owner/admin).
export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const { sectionId } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const creedId = body && typeof body === "object" && "creedId" in body ? (body as { creedId: unknown }).creedId : null;
  if (typeof creedId !== "string") {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }

  const result = await deleteSharedSection({ creedId, user: auth.user, sectionId });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: statusFor(result) });
  }
  return NextResponse.json(result);
}
