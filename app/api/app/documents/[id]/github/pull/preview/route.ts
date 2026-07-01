import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { parseDocumentFile } from "@/lib/document-markdown";
import { resolveSyncStatus, withAuthenticatedGitHubAccess } from "@/lib/github-version-control";
import { readMappedDocumentGitHubFile, readMappedSharedDocument } from "@/lib/document-github";
import { hashDocumentContent, serializeSharedDocument } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const payload = await withAuthenticatedGitHubAccess(async ({ integration }) => {
      const admin = getSupabaseAdminClient();
      const document = await readMappedSharedDocument(admin, id);
      const remoteFile = await readMappedDocumentGitHubFile(integration.access_token!, document);

      if (!remoteFile) {
        throw new Error("No file in this repo yet. Publish first.");
      }

      const syncStatus = resolveSyncStatus({
        localHash: hashDocumentContent(serializeSharedDocument(document)),
        remoteHash: remoteFile.contentHash,
        lastSyncedHash: document.lastSyncedContentHash,
      });

      // Split the remote file so the editor can diff the body and preview the
      // incoming property (frontmatter) changes.
      const { metadata, body } = parseDocumentFile(remoteFile.content);

      return {
        syncStatus,
        remoteSha: remoteFile.sha,
        remoteMessage: remoteFile.commitMessage ?? null,
        remoteCommittedAt: remoteFile.committedAt ?? null,
        remoteContentHash: remoteFile.contentHash,
        remoteContent: remoteFile.content,
        remoteBody: body,
        remoteMetadata: metadata,
        revision: document.revision,
      };
    }, auth);

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not preview GitHub import.";
    return NextResponse.json(
      { error: message },
      {
        status:
          message === "Unauthorized"
            ? 401
            : /No file in this repo/i.test(message)
              ? 404
              : 400,
      }
    );
  }
}
