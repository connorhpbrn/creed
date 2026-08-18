import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/http-headers";
import { getCreditsState, getSharedCreditsState } from "@creed/cloud/lib/ai/credits";
import { requireApiAuth } from "@/lib/api-auth";
import { resolveActiveCreed, resolveMemberCreedById } from "@/lib/creed-context";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";

// Balance + recent ledger for Model usage. Purchased is this Creed's lasting
// credit balance. Granted / Bonus figures come from the assigned home Creed.

export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const requestedCreedId = new URL(request.url).searchParams.get("creedId")?.trim();
    const requested = requestedCreedId
      ? await resolveMemberCreedById(auth.supabase, auth.user, requestedCreedId)
      : null;
    if (requestedCreedId && !requested) {
      return NextResponse.json({ error: "Creed not found." }, { status: 403 });
    }

    const active = requested
      ? null
      : await resolveActiveCreed(auth.supabase, auth.user);
    const creedId = requested?.id ?? active?.creedId ?? null;
    if (!creedId) {
      return NextResponse.json({ error: "Creed not found." }, { status: 403 });
    }

    const creedType =
      requested?.type ??
      active?.creeds.find((creed) => creed.id === creedId)?.type ??
      null;
    const role = requested?.role ?? active?.role ?? null;

    let credits;
    if (creedType === "shared") {
      const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
      const { data: creed } = (await admin
        .from("creeds")
        .select("owner_user_id")
        .eq("id", creedId)
        .maybeSingle()) as { data: { owner_user_id?: string } | null };
      const ownerId = creed?.owner_user_id;
      if (!ownerId) {
        return NextResponse.json({ error: "Creed not found." }, { status: 403 });
      }
      // Members see the owner's pot figures but not the ledger.
      credits = await getSharedCreditsState(creedId, ownerId);
    } else {
      credits = await getCreditsState(auth.supabase, auth.user.id, creedId);
    }

    if (role !== "owner") {
      credits.transactions = [];
    }
    return NextResponse.json({ credits }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "Could not load credits." },
      { status: 400 },
    );
  }
}
