import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { deleteCompany } from "@/lib/company-admin";

// DELETE /api/app/company { creedId } - delete the company Creed (owner-only).
export async function DELETE(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const b = (await request.json().catch(() => ({}))) as { creedId?: unknown };
  if (typeof b.creedId !== "string") {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }
  const result = await deleteCompany({ creedId: b.creedId, actor: auth.user });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
