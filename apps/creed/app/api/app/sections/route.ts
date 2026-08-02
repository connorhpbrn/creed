import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { createCompanySection, type SectionCreateResult } from "@/lib/company-sections";

// POST /api/app/sections { creedId, name, contentHtml?, accent?, insertAfterSectionId?, sectionId? }
// Create a section on a company Creed (owner/admin). The optional sectionId lets
// the provider's optimistic row and the server row share an id; a taken id is
// rejected (409) rather than clobbering an existing section.
function statusFor(result: Extract<SectionCreateResult, { ok: false }>): number {
  switch (result.code) {
    case "exists":
      return 409;
    case "forbidden":
    case "frozen":
      return 403;
    case "not_found":
      return 404;
    default:
      return 400;
  }
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
  const b = (body ?? {}) as {
    creedId?: unknown;
    name?: unknown;
    contentHtml?: unknown;
    accent?: unknown;
    insertAfterSectionId?: unknown;
    sectionId?: unknown;
  };
  if (typeof b.creedId !== "string") {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }
  if (typeof b.name !== "string" || !b.name.trim()) {
    return NextResponse.json({ error: "A section name is required." }, { status: 400 });
  }

  const result = await createCompanySection({
    creedId: b.creedId,
    user: auth.user,
    name: b.name,
    contentHtml: typeof b.contentHtml === "string" ? b.contentHtml : undefined,
    accent: typeof b.accent === "string" ? b.accent : undefined,
    insertAfterSectionId:
      typeof b.insertAfterSectionId === "string" ? b.insertAfterSectionId : undefined,
    sectionId: typeof b.sectionId === "string" ? b.sectionId : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: statusFor(result) });
  }
  return NextResponse.json(result);
}
