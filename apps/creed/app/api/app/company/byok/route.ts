import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { setCompanyByok } from "@/lib/company-admin";

// POST /api/app/company/byok { creedId, key, mode } - owner-only. key: null clears.
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const b = (await request.json().catch(() => ({}))) as { creedId?: unknown; key?: unknown; mode?: unknown };
  if (typeof b.creedId !== "string") {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }
  const key = b.key === null ? null : typeof b.key === "string" ? b.key : undefined;
  if (key === undefined) {
    return NextResponse.json({ error: "key must be a string or null." }, { status: 400 });
  }
  const mode = b.mode === "byok" ? "byok" : b.mode === "credits" ? "credits" : undefined;
  const result = await setCompanyByok({ creedId: b.creedId, actor: auth.user, key, mode });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
