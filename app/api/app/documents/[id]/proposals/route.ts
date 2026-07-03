import { NextResponse } from "next/server";
import { requireApiAuth, requireApiJson } from "@/lib/api-auth";
import { createDocumentProposal, listDocumentProposals } from "@/lib/document-editing";
import { readSharedDocumentById } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const admin = getSupabaseAdminClient();
  const url = new URL(request.url);
  const requestedStatus = url.searchParams.get("status");
  const status =
    requestedStatus === "accepted" || requestedStatus === "rejected" || requestedStatus === "all"
      ? requestedStatus
      : "pending";
  const proposals = await listDocumentProposals(admin, id, { status });
  return NextResponse.json({ proposals });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const json = await requireApiJson(request);
  if (json instanceof NextResponse) return json;

  const { id } = await params;
  const { auth, input } = json;
  const content = typeof input.content === "string" ? input.content : null;
  if (content === null) {
    return NextResponse.json({ error: "Missing proposal content." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const document = await readSharedDocumentById(admin, id);
  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const result = await createDocumentProposal(admin, {
    documentId: id,
    actorType: "human",
    author: { userId: auth.user.id },
    baseContent: document.content,
    content,
    summary: typeof input.summary === "string" && input.summary.trim() ? input.summary.trim() : "Proposed a change",
    baseRevision: document.revision,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.code === "not-found" ? 404 : 400 });
  }

  return NextResponse.json({ proposals: result.value });
}
