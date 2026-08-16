import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { listUserCreeds } from "@/lib/creed-membership";
import { deleteOwnedCreed } from "@/lib/creed-delete";
import { validateNewCreedInput } from "@creed/core/creed-creation";
import { setActiveCreed } from "@/lib/creed-context";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";

// Open exposes Personal Creeds only, including if its database was previously
// used by a Cloud development build.
export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const creeds = (await listUserCreeds(auth.supabase, auth.user.id)).filter(
    (creed) => creed.type === "personal",
  );
  return NextResponse.json({ creeds });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const rateLimit = await checkRateLimit({
    scope: "creed-create",
    identifier: auth.user.id,
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many Creeds were created recently. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    type?: unknown;
    forOnboarding?: unknown;
  } | null;
  const validation = validateNewCreedInput(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  if (validation.value.type !== "personal") {
    return NextResponse.json(
      { error: "Creed Open supports Personal Creeds only." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data, error } = await admin.rpc("create_owned_creed", {
    p_user_id: auth.user.id,
    p_name: validation.value.name,
    p_type: validation.value.type,
  });
  const created = (
    data as Array<{
      id: string;
      type: "personal" | "shared";
      name: string;
      onboarding_stage: string | null;
    }> | null
  )?.[0];
  if (error || !created) {
    return NextResponse.json(
      { error: "Could not create this Creed." },
      { status: 500 },
    );
  }

  const role = await setActiveCreed(auth.supabase, auth.user, created.id);
  if (role !== "owner") {
    return NextResponse.json(
      { error: "The Creed was created, but could not be opened." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      creed: {
        id: created.id,
        type: created.type,
        name: created.name,
        role,
        needsSetup: created.onboarding_stage != null,
      },
    },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => ({}))) as {
    creedId?: unknown;
    preferredNextCreedId?: unknown;
  };
  if (typeof body.creedId !== "string") {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }
  const preferredNextCreedId =
    typeof body.preferredNextCreedId === "string"
      ? body.preferredNextCreedId
      : null;

  const result = await deleteOwnedCreed({
    creedId: body.creedId,
    actor: auth.user,
    preferredNextCreedId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const role = await setActiveCreed(
    auth.supabase,
    auth.user,
    result.nextCreedId,
  );
  if (!role) {
    return NextResponse.json(
      {
        error: "The Creed was deleted, but the next Creed could not be opened.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    nextCreedId: result.nextCreedId,
    createdBlankPersonal: result.createdBlankPersonal,
  });
}
