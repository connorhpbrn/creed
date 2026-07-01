import { NextResponse } from "next/server";
import { apiResultErrorResponse, requireApiAuth } from "@/lib/api-auth";
import { withAuthenticatedGitHubAccess } from "@/lib/github-version-control";
import { readMappedDocumentGitHubFile, readMappedSharedDocument } from "@/lib/document-github";
import { parseDocumentFile } from "@/lib/document-markdown";
import { recordDocumentActivity } from "@/lib/document-collaboration";
import { applyRemoteDocumentPull } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type ApplyBody = {
  remoteContent?: string;
  remoteSha?: string | null;
  expectedRevision?: number;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;

    let body: ApplyBody;
    try {
      body = (await request.json()) as ApplyBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (typeof body.expectedRevision !== "number" || !Number.isInteger(body.expectedRevision)) {
      return NextResponse.json({ error: "A valid expectedRevision is required." }, { status: 400 });
    }
    const previewedSha = body.remoteSha?.trim();
    if (!previewedSha) {
      return NextResponse.json({ error: "A previewed remoteSha is required." }, { status: 400 });
    }

    const payload = await withAuthenticatedGitHubAccess(async ({ integration, user }) => {
      const admin = getSupabaseAdminClient();
      const document = await readMappedSharedDocument(admin, id);
      const remoteFile = await readMappedDocumentGitHubFile(integration.access_token!, document);

      if (!remoteFile) {
        throw new Error("No file in this repo yet. Publish first.");
      }

      if (previewedSha !== remoteFile.sha) {
        throw new Error("GitHub changed since it was previewed. Re-open the pull and try again.");
      }

      // Split property frontmatter from the server-fetched remote file. The
      // body lands in `content`, property frontmatter updates the columns, and
      // the hash of the full file is stored as the synced marker.
      const { metadata, body: documentBody } = parseDocumentFile(remoteFile.content);

      const result = await applyRemoteDocumentPull(admin, {
        id,
        content: documentBody,
        metadata,
        syncedContentHash: remoteFile.contentHash,
        remoteSha: remoteFile.sha,
        expectedRevision: body.expectedRevision!,
        actorUserId: user.id,
      });

      if (!result.ok) {
        throw Object.assign(new Error(result.error), { code: result.code });
      }

      await recordDocumentActivity(admin, {
        documentId: result.value.id,
        actorUserId: user.id,
        action: "document.github.pulled",
        summary: "Pulled document from GitHub",
        metadata: { remoteSha: remoteFile.sha, revision: result.value.revision },
      });

      return { document: result.value };
    }, auth);

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not import document from GitHub.";
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
    if (code) {
      return apiResultErrorResponse(message, code);
    }
    return NextResponse.json(
      { error: message },
      {
        status:
          message === "Unauthorized"
            ? 401
            : /changed since it was previewed/i.test(message)
              ? 409
              : /No file in this repo/i.test(message)
                ? 404
                : 400,
      }
    );
  }
}
