import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getCreedRole } from "@/lib/creed-membership";
import { buyCompanySeats, setCompanySeatQuantity } from "@/lib/company-billing";
import { getSiteUrl } from "@/lib/supabase/env";
import { MAX_SEATS, MIN_SEATS } from "@/lib/seat-config";
import { recordAuditEvent } from "@/lib/audit-log";
import { log } from "@/lib/observability";

// POST /api/app/company/seats { creedId, quantity, mode? } - manage extra seats.
// Owner-only (billing belongs to the owner).
//   mode "add" (default): buy `quantity` more seats. Subscription charges the
//     proration now and returns { ok, extraSeats }; lifetime returns { url }.
//   mode "set": set the absolute EXTRA-seat count to `quantity` (0 allowed) on a
//     subscription; used to reduce seats. Credits proration at the next cycle.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const b = (await request.json().catch(() => ({}))) as {
    creedId?: unknown;
    quantity?: unknown;
    mode?: unknown;
  };
  if (typeof b.creedId !== "string") {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }
  const mode = b.mode === "set" ? "set" : "add";
  const quantity =
    typeof b.quantity === "number" ? Math.trunc(b.quantity) : Number.NaN;
  // "set" allows 0 (remove all extra seats); "add" needs at least MIN_SEATS.
  const floor = mode === "set" ? 0 : MIN_SEATS;
  if (!Number.isInteger(quantity) || quantity < floor || quantity > MAX_SEATS) {
    return NextResponse.json(
      { error: `Choose between ${floor} and ${MAX_SEATS} seats.` },
      { status: 400 },
    );
  }

  const role = await getCreedRole(auth.supabase, auth.user.id, b.creedId);
  if (role !== "owner") {
    return NextResponse.json({ error: "Only the owner can manage seats." }, { status: 403 });
  }

  try {
    const result =
      mode === "set"
        ? await setCompanySeatQuantity({ creedId: b.creedId, extraSeats: quantity })
        : await buyCompanySeats({ creedId: b.creedId, quantity, baseUrl: getSiteUrl() });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    if (result.kind === "redirect") {
      return NextResponse.json({ url: result.url });
    }
    await recordAuditEvent({
      userId: auth.user.id,
      action: "company.seats_changed",
      metadata: { creedId: b.creedId, mode, extraSeats: result.extraSeats },
      request,
    });
    return NextResponse.json({ ok: true, extraSeats: result.extraSeats });
  } catch (error) {
    log.error(
      "company_seats_change_failed",
      { creedId: b.creedId, mode },
      error instanceof Error ? error : new Error(String(error)),
    );
    return NextResponse.json(
      { error: "Couldn't update seats. Please try again." },
      { status: 502 },
    );
  }
}
