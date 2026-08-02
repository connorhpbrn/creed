import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { updateCompanyGeneral } from "@/lib/company-admin";

// POST /api/app/company/general { creedId, name?, email? } - update the company's
// name and/or shared contact email (owner/admin). Fields are independent so the
// settings screen can save each on blur.
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const b = (await request.json().catch(() => ({}))) as { creedId?: unknown; name?: unknown; email?: unknown };
  if (typeof b.creedId !== "string") {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }
  if (b.name !== undefined && typeof b.name !== "string") {
    return NextResponse.json({ error: "Invalid name." }, { status: 400 });
  }
  if (b.email !== undefined && typeof b.email !== "string") {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }
  const result = await updateCompanyGeneral({
    creedId: b.creedId,
    actor: auth.user,
    name: typeof b.name === "string" ? b.name : undefined,
    email: typeof b.email === "string" ? b.email : undefined,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
