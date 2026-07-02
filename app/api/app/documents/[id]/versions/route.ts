import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { listDocumentVersions } from "@/lib/document-versions";
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
  const includeContent = url.searchParams.get("includeContent") === "1";
  const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const versions = await listDocumentVersions(admin, id, {
    includeContent,
    limit: Number.isFinite(limitParam) ? limitParam : undefined,
  });
  return NextResponse.json({ versions });
}
