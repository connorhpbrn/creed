import { NextResponse } from "next/server";
import { loadCreedState, persistCreedState } from "@/lib/creed-backend";
import { requireApiAuth } from "@/lib/api-auth";
import { validateCreedState } from "@/lib/validation/creed-state";

export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const result = await loadCreedState(auth.supabase, auth.user);
  return NextResponse.json(result);
}

export async function PUT(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const candidate =
    body && typeof body === "object" && "state" in body
      ? (body as { state: unknown }).state
      : null;

  const parsed = validateCreedState(candidate);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  await persistCreedState(auth.supabase, auth.user.id, parsed.data);
  return NextResponse.json({ ok: true });
}
