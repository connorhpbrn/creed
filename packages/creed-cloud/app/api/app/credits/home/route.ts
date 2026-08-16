import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getCreditsState } from "@creed/cloud/lib/ai/credits";
import {
  resolveCreditsHomeCreedId,
  setCreditsHomeCreed,
} from "@creed/cloud/lib/ai/credit-home";
import { listUserCreeds } from "@/lib/creed-membership";
import { NO_STORE_HEADERS } from "@/lib/http-headers";

// GET: account credits home + balance + owned Creed options.
// PUT: move the pot to another owned Creed.

export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const [creeds, homeCreedId, credits] = await Promise.all([
      listUserCreeds(auth.supabase, auth.user.id),
      resolveCreditsHomeCreedId(auth.user.id),
      getCreditsState(auth.supabase, auth.user.id),
    ]);
    const owned = creeds.filter((creed) => creed.role === "owner");
    return NextResponse.json(
      {
        homeCreedId,
        creeds: owned.map((creed) => ({
          id: creed.id,
          name: creed.name,
          type: creed.type,
          avatarUrl: creed.avatarUrl ?? null,
        })),
        credits,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not load bonus credits." },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => null)) as {
    creedId?: unknown;
  } | null;
  const creedId = typeof body?.creedId === "string" ? body.creedId.trim() : "";
  if (!creedId) {
    return NextResponse.json({ error: "Pick a Creed." }, { status: 400 });
  }

  const result = await setCreditsHomeCreed({
    userId: auth.user.id,
    creedId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const credits = await getCreditsState(auth.supabase, auth.user.id, creedId);
  return NextResponse.json(
    { homeCreedId: result.creedId, credits },
    { headers: NO_STORE_HEADERS },
  );
}
