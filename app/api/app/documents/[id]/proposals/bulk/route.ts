import { NextResponse } from "next/server";
import { requireApiJson } from "@/lib/api-auth";
import { acceptDocumentProposals, rejectDocumentProposals } from "@/lib/document-editing";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function statusForCode(code: "invalid" | "not-found" | "conflict" | "forbidden") {
  return code === "forbidden" ? 403 : code === "not-found" ? 404 : code === "conflict" ? 409 : 400;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const json = await requireApiJson(request);
  if (json instanceof NextResponse) return json;

  const { id } = await params;
  const { auth, input } = json;
  const action = input.action === "accept" ? "accept" : input.action === "reject" ? "reject" : null;
  const proposalIds = Array.isArray(input.proposalIds)
    ? input.proposalIds.filter((value): value is string => typeof value === "string")
    : [];

  if (!action) {
    return NextResponse.json({ error: "Invalid proposal action." }, { status: 400 });
  }
  if (proposalIds.length === 0) {
    return NextResponse.json({ error: "No proposals selected." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  if (action === "accept") {
    const result = await acceptDocumentProposals(admin, {
      documentId: id,
      proposalIds,
      actorUserId: auth.user.id,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, settledProposalIds: result.settledProposalIds ?? [] },
        { status: statusForCode(result.code) }
      );
    }
    return NextResponse.json({
      action,
      document: result.value.document,
      version: result.value.version,
      proposals: result.value.proposals,
    });
  }

  const result = await rejectDocumentProposals(admin, {
    documentId: id,
    proposalIds,
    actorUserId: auth.user.id,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, settledProposalIds: result.settledProposalIds ?? [] },
      { status: statusForCode(result.code) }
    );
  }
  return NextResponse.json({
    action,
    proposals: result.value.proposals,
  });
}
