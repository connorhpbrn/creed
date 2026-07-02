import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { readDocumentVersion } from "@/lib/document-versions";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { id, versionId } = await params;
  const admin = getSupabaseAdminClient();
  const version = await readDocumentVersion(admin, { documentId: id, versionId });
  if (!version) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }

  return NextResponse.json({ version });
}
