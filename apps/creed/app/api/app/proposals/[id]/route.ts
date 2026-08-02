import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import {
  reviewCompanyProposal,
  reviewPersonalProposal,
} from "@/lib/company-sections";
import { getPersonalCreedId } from "@/lib/creed-membership";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseLikeClient } from "@/lib/supabase/types";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/app/proposals/[id] { creedId, decision: "accept" | "reject" | "withdraw" }
//
// Company: proposal review. Owner/admin may review any; a member may review
// only sections where they hold Direct edit. "withdraw" lets the proposal's
// own author delete their pending proposal (all enforced in the lib).
//
// Personal: the owner accepts/rejects their own proposals. This makes the
// resolution durable at click time instead of riding the debounced full-state
// autosave (which let a fast refresh resurrect an already-reviewed proposal).
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (body ?? {}) as { creedId?: unknown; decision?: unknown };
  if (
    typeof b.creedId !== "string" ||
    (b.decision !== "accept" &&
      b.decision !== "reject" &&
      b.decision !== "withdraw")
  ) {
    return NextResponse.json(
      { error: "creedId and decision are required." },
      { status: 400 },
    );
  }

  // Personal-vs-company dispatch: creed-membership owns the ownership
  // semantics. A creedId that is the caller's own personal Creed goes down
  // the personal path; anything else (a company, or someone else's personal
  // Creed) goes through reviewCompanyProposal, whose role check rejects
  // non-members.
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const personalCreedId = await getPersonalCreedId(admin, auth.user.id);
  const result =
    personalCreedId && personalCreedId === b.creedId
      ? await reviewPersonalProposal({
          creedId: b.creedId,
          user: auth.user,
          proposalId: id,
          // Personal has no separate withdraw flow; deleting your own
          // pending proposal and rejecting it are the same operation.
          decision: b.decision === "accept" ? "accept" : "reject",
        })
      : await reviewCompanyProposal({
          creedId: b.creedId,
          user: auth.user,
          proposalId: id,
          decision: b.decision,
        });

  if (!result.ok) {
    const status =
      result.code === "forbidden" || result.code === "frozen"
        ? 403
        : result.code === "not_found"
          ? 404
          : result.code === "stale" || result.code === "conflict"
            ? 409
            : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }
  return NextResponse.json(result);
}
