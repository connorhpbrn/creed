import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { pushGitHubFile } from "@/lib/github";
import { withAuthenticatedGitHubAccess } from "@/lib/github-version-control";
import { recordDocumentActivity } from "@/lib/document-collaboration";
import { readMappedDocumentGitHubFile, readMappedSharedDocument } from "@/lib/document-github";
import { markSharedDocumentSynced, readSharedDocumentById, serializeSharedDocument } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const payload = await withAuthenticatedGitHubAccess(async ({ user, integration }) => {
      const admin = getSupabaseAdminClient();
      const document = await readMappedSharedDocument(admin, id);
      const remoteFile = await readMappedDocumentGitHubFile(integration.access_token!, document);

      const remoteChangedSinceLastSync =
        Boolean(
          document.lastSyncedContentHash &&
            remoteFile?.contentHash &&
            remoteFile.contentHash !== document.lastSyncedContentHash
        );
      const localChangedSinceLastSync =
        document.lastSyncedRevision !== null && document.revision !== document.lastSyncedRevision;

      if (remoteChangedSinceLastSync && localChangedSinceLastSync) {
        throw new Error(
          "GitHub changed since the last sync and this document also changed in Supabase. Pull/review the remote change before publishing."
        );
      }

      // Serialize property columns into YAML frontmatter so they travel with
      // the body into version control. This exact string is both what we push
      // and what we hash as the synced content.
      const fileContent = serializeSharedDocument(document);

      const pushResult = await pushGitHubFile({
        accessToken: integration.access_token!,
        owner: document.githubRepoOwner,
        repo: document.githubRepoName,
        branch: document.githubBranch,
        path: document.githubPath,
        message: `Update ${document.path}`,
        content: fileContent,
        currentSha: remoteFile?.sha ?? null,
      });

      const synced = await markSharedDocumentSynced(admin, {
        id: document.id,
        remoteSha: pushResult.sha,
        content: fileContent,
        revision: document.revision,
        actorUserId: user.id,
      });

      // A "conflict" here means the push to GitHub succeeded but a concurrent
      // Creed edit moved the document on before we could stamp it synced. That
      // is not a failure - the commit landed - so we surface the latest row
      // with `synced: false` instead of throwing. Any other failure is real.
      if (!synced.ok && synced.code !== "conflict") {
        throw new Error(synced.error);
      }

      await recordDocumentActivity(admin, {
        documentId: document.id,
        actorUserId: user.id,
        action: "document.github.published",
        summary: "Published document to GitHub",
        metadata: {
          repo: `${document.githubRepoOwner}/${document.githubRepoName}`,
          branch: document.githubBranch,
          path: document.githubPath,
          remoteSha: pushResult.sha,
        },
      });

      const latest = synced.ok ? synced.value : await readSharedDocumentById(admin, document.id);

      return {
        ok: true,
        synced: synced.ok,
        document: latest,
        remoteSha: pushResult.sha,
        remoteMessage: pushResult.message,
        remoteCommittedAt: pushResult.committedAt,
      };
    }, auth);

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not publish document to GitHub.";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : /changed since the last sync/i.test(message) ? 409 : 400 }
    );
  }
}
