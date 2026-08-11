import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { listUserCreeds } from "@/lib/creed-membership";
import { deleteOwnedCreed } from "@/lib/creed-delete";
import { validateNewCreedInput } from "@creed/core/creed-creation";
import { setActiveCreed } from "@/lib/creed-context";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";

// GET /api/app/creeds - the Creed switcher list for the signed-in user.
// Personal first, then Shared Creeds. Reads membership under RLS via the
// user's session client.
export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const creeds = await listUserCreeds(auth.supabase, auth.user.id);
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

  // First-run Shared compose needs a non-null stage so /onboarding/shared
  // admits the owner. Switcher-created Creeds stay ready (stage null).
  const forOnboarding =
    body?.forOnboarding === true && validation.value.type === "shared";

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

  let onboardingStage = created.onboarding_stage;
  if (forOnboarding) {
    // creeds is select-only under RLS; owners finish setup through the
    // security-definer onboarding RPC. Mark first-run Shared here with admin
    // after create_owned_creed has already proven ownership.
    const { error: stageError } = await admin
      .from("creeds")
      .update({ onboarding_stage: "shared" })
      .eq("id", created.id)
      .eq("owner_user_id", auth.user.id);
    if (stageError) {
      return NextResponse.json(
        { error: "Could not start Shared onboarding." },
        { status: 500 },
      );
    }
    onboardingStage = "shared";
  }

  const role = await setActiveCreed(auth.supabase, auth.user, created.id);
  if (role !== "owner") {
    return NextResponse.json(
      { error: "The Creed was created, but could not be opened." },
      { status: 500 },
    );
  }

  // First owned Creed becomes the account credits home by default.
  const { ensureCreditsHomeCreed } = await import("@creed/edition/credits");
  await ensureCreditsHomeCreed(auth.user.id, created.id);

  return NextResponse.json(
    {
      creed: {
        id: created.id,
        type: created.type,
        name: created.name,
        role,
        needsSetup: onboardingStage != null,
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
