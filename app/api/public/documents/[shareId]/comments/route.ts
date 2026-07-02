import { NextResponse } from "next/server";
import {
  createDocumentComment,
  listDocumentActivity,
  updatePublicCommentAuthorLabel,
} from "@/lib/document-collaboration";
import { checkRateLimit } from "@/lib/rate-limit";
import { readPublicSharedDocument } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type PublicCommentRequest = {
  name?: unknown;
  body?: unknown;
  parentId?: unknown;
  referenceQuote?: unknown;
  clientId?: unknown;
  previousName?: unknown;
};

function statusForCode(code: "invalid" | "not-found" | "conflict" | "forbidden") {
  if (code === "not-found") return 404;
  if (code === "conflict") return 409;
  if (code === "forbidden") return 403;
  return 400;
}

function callerIdentifier(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params;
  const decodedShareId = decodeURIComponent(shareId);
  const verdict = checkRateLimit({
    scope: "public-document-comment",
    identifier: `${decodedShareId}:${callerIdentifier(request)}`,
    limit: 12,
    windowMs: 60_000,
  });

  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many comments. Try again in a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(verdict.retryAfterSeconds) },
      }
    );
  }

  let input: PublicCommentRequest;
  try {
    input = (await request.json()) as PublicCommentRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof input.name === "string" ? input.name : "";
  const body = typeof input.body === "string" ? input.body : "";
  const parentId = typeof input.parentId === "string" ? input.parentId : null;
  const referenceQuote =
    typeof input.referenceQuote === "string" ? input.referenceQuote : null;
  const clientId = typeof input.clientId === "string" ? input.clientId : null;
  const admin = getSupabaseAdminClient();
  const document = await readPublicSharedDocument(admin, decodedShareId);

  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const result = await createDocumentComment(admin, {
    documentId: document.id,
    body,
    parentId,
    referenceQuote,
    source: "public",
    publicAuthorLabel: name,
    publicAuthorClientId: clientId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: statusForCode(result.code) }
    );
  }

  const activity = await listDocumentActivity(admin, document.id);
  return NextResponse.json({ comment: result.value.comment, activity });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params;
  const decodedShareId = decodeURIComponent(shareId);
  const verdict = checkRateLimit({
    scope: "public-document-comment-name",
    identifier: `${decodedShareId}:${callerIdentifier(request)}`,
    limit: 10,
    windowMs: 60_000,
  });

  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many updates. Try again in a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(verdict.retryAfterSeconds) },
      }
    );
  }

  let input: PublicCommentRequest;
  try {
    input = (await request.json()) as PublicCommentRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof input.name === "string" ? input.name : "";
  const previousName = typeof input.previousName === "string" ? input.previousName : null;
  const clientId = typeof input.clientId === "string" ? input.clientId : null;
  const admin = getSupabaseAdminClient();
  const document = await readPublicSharedDocument(admin, decodedShareId);

  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const result = await updatePublicCommentAuthorLabel(admin, {
    documentId: document.id,
    publicAuthorClientId: clientId,
    previousAuthorLabel: previousName,
    nextAuthorLabel: name,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: statusForCode(result.code) }
    );
  }

  return NextResponse.json({ comments: result.value.comments });
}
