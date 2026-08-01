import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/http-headers";
import { getCreditsState, getCompanyCreditsState } from "@/lib/ai/credits";
import { requireApiAuth } from "@/lib/api-auth";
import { resolveMemberCompanyCreed, resolveMemberCompanyCreedById } from "@/lib/creed-context";

// Balance + recent ledger for the settings credits card. Read via the user's
// session client (RLS select-own); doubles as the "did my top-up land yet?"
// poll after a Payment Element confirmation. Company-aware: any member viewing a
// company Creed sees the pooled company balance; the purchase-history ledger is
// stripped for non-owners (they can view spend, not buy or audit top-ups).
//
// A `?creedId=` query param pins the read to that company Creed (validated for
// membership), so the company settings card always loads THAT company's pooled
// balance rather than depending on the active-Creed cookie. No param -> fall back
// to the active Creed (cookie), preserving the personal + single-context reads.


export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const requestedCreedId = new URL(request.url).searchParams.get("creedId")?.trim();
    const company = requestedCreedId
      ? await resolveMemberCompanyCreedById(auth.supabase, auth.user, requestedCreedId)
      : await resolveMemberCompanyCreed(auth.supabase, auth.user);
    const credits = company
      ? await getCompanyCreditsState(company.creedId)
      : await getCreditsState(auth.supabase, auth.user.id);
    if (company && company.role !== "owner") {
      credits.transactions = [];
    }
    return NextResponse.json({ credits }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "Could not load credits." },
      { status: 400 }
    );
  }
}
