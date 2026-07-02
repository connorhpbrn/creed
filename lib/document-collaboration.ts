import "server-only";
import { log } from "@/lib/observability";
import { isNotificationEmailConfigured, sendMentionNotificationEmail } from "@/lib/notification-email";
import { readSharedDocumentById } from "@/lib/shared-documents";
import type { SupabaseLikeClient } from "@/lib/supabase/types";

type MutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code: "conflict" | "invalid" | "not-found" | "forbidden" };

export type WorkspaceUser = {
  id: string;
  email: string;
  label: string;
  avatarUrl: string | null;
};

export type DocumentComment = {
  id: string;
  documentId: string;
  parentId: string | null;
  referenceId: string | null;
  referenceQuote: string;
  // The proposal this comment is anchored to (a comment on a proposal), or null
  // for a range-anchored / general document comment.
  proposalId: string | null;
  body: string;
  status: "open" | "resolved";
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdBy: string | null;
  publicAuthorLabel: string | null;
  publicAuthorClientId: string | null;
  authorLabel: string;
  authorEmail: string;
  mentionedUserIds: string[];
  createdAt: string;
  updatedAt: string;
  // 'pending' is a private agent-proposed comment visible only to its proposer
  // (created_by) until approved; 'shared' is a normal workspace comment.
  proposalStatus: "pending" | "shared";
  // Only populated for a proposer viewing their own pending comment; never
  // shown once the comment is shared.
  proposedByAgentLabel: string | null;
};

export type DocumentActivityEvent = {
  id: string;
  documentId: string;
  actorUserId: string | null;
  actorLabel: string;
  action: string;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type DocumentNotification = {
  id: string;
  userId: string;
  actorUserId: string | null;
  documentId: string | null;
  commentId: string | null;
  type: string;
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  emailStatus: "not-configured" | "pending" | "sent" | "failed";
  emailError: string | null;
  createdAt: string;
};

type CommentRow = {
  id: string;
  document_id: string;
  parent_id: string | null;
  reference_id: string | null;
  reference_quote: string | null;
  proposal_id: string | null;
  body: string;
  status: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  public_author_label: string | null;
  public_author_client_id: string | null;
  created_at: string;
  updated_at: string;
  proposal_status: string | null;
  proposed_by_agent_label: string | null;
};

type ActivityRow = {
  id: string;
  document_id: string;
  actor_user_id: string | null;
  action: string;
  summary: string | null;
  metadata: unknown;
  created_at: string;
};

type NotificationRow = {
  id: string;
  user_id: string;
  actor_user_id: string | null;
  document_id: string | null;
  comment_id: string | null;
  type: string;
  title: string;
  body: string | null;
  href: string;
  read_at: string | null;
  email_status: string | null;
  email_error: string | null;
  created_at: string;
};

type MentionRow = {
  comment_id: string;
  user_id: string;
};

type PendingEmailNotification = {
  notificationId: string;
  to: string;
  actorLabel: string;
  documentTitle: string;
  commentBody: string;
  href: string;
};

export type CreatedCommentResult = {
  comment: DocumentComment;
  notifications: DocumentNotification[];
  pendingEmails: PendingEmailNotification[];
};

const COMMENT_COLUMNS = [
  "id",
  "document_id",
  "parent_id",
  "reference_id",
  "reference_quote",
  "proposal_id",
  "body",
  "status",
  "resolved_at",
  "resolved_by",
  "created_by",
  "updated_by",
  "public_author_label",
  "public_author_client_id",
  "created_at",
  "updated_at",
  "proposal_status",
  "proposed_by_agent_label",
].join(", ");

const ACTIVITY_COLUMNS = [
  "id",
  "document_id",
  "actor_user_id",
  "action",
  "summary",
  "metadata",
  "created_at",
].join(", ");

const NOTIFICATION_COLUMNS = [
  "id",
  "user_id",
  "actor_user_id",
  "document_id",
  "comment_id",
  "type",
  "title",
  "body",
  "href",
  "read_at",
  "email_status",
  "email_error",
  "created_at",
].join(", ");

function nowIso() {
  return new Date().toISOString();
}

function trimToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function metadataString(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

// Fallback display name when a user hasn't set any name metadata: the local
// part of their email (e.g. "declan@cowen.co" -> "declan"). Keeps mentions and
// author labels human instead of showing raw email addresses.
function labelFromEmail(email: string) {
  const local = email.split("@")[0]?.trim() ?? "";
  return local;
}

function buildUserLabel(user: WorkspaceUser | undefined, fallback?: string | null) {
  return user?.label || fallback || "Someone";
}

function cleanPublicAuthorLabel(value: string | null | undefined) {
  const trimmed = value?.trim().replace(/\s+/g, " ") ?? "";
  return trimmed.slice(0, 80);
}

function cleanPublicAuthorClientId(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed.length > 120) return "";
  return /^[a-zA-Z0-9._:-]+$/.test(trimmed) ? trimmed : "";
}

function mapMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function mapComment(
  row: CommentRow,
  users: Map<string, WorkspaceUser>,
  mentionsByComment: Map<string, string[]>
): DocumentComment {
  const author = row.created_by ? users.get(row.created_by) : undefined;
  const publicAuthorLabel = cleanPublicAuthorLabel(row.public_author_label) || null;
  return {
    id: row.id,
    documentId: row.document_id,
    parentId: row.parent_id,
    referenceId: row.reference_id,
    referenceQuote: row.reference_quote ?? "",
    proposalId: row.proposal_id,
    body: row.body,
    status: row.status === "resolved" ? "resolved" : "open",
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    createdBy: row.created_by,
    publicAuthorLabel,
    publicAuthorClientId: cleanPublicAuthorClientId(row.public_author_client_id) || null,
    authorLabel: buildUserLabel(author, publicAuthorLabel ?? row.created_by),
    authorEmail: author?.email ?? "",
    mentionedUserIds: mentionsByComment.get(row.id) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    proposalStatus: row.proposal_status === "pending" ? "pending" : "shared",
    proposedByAgentLabel: row.proposed_by_agent_label,
  };
}

function mapActivity(row: ActivityRow, users: Map<string, WorkspaceUser>): DocumentActivityEvent {
  const metadata = mapMetadata(row.metadata);
  return {
    id: row.id,
    documentId: row.document_id,
    actorUserId: row.actor_user_id,
    actorLabel: buildUserLabel(
      row.actor_user_id ? users.get(row.actor_user_id) : undefined,
      metadataString(metadata, ["actorLabel", "publicAuthorLabel"]) || row.actor_user_id
    ),
    action: row.action,
    summary: row.summary ?? "",
    metadata,
    createdAt: row.created_at,
  };
}

function mapNotification(row: NotificationRow): DocumentNotification {
  const emailStatus =
    row.email_status === "pending" ||
    row.email_status === "sent" ||
    row.email_status === "failed"
      ? row.email_status
      : "not-configured";
  return {
    id: row.id,
    userId: row.user_id,
    actorUserId: row.actor_user_id,
    documentId: row.document_id,
    commentId: row.comment_id,
    type: row.type,
    title: row.title,
    body: row.body ?? "",
    href: row.href,
    readAt: row.read_at,
    emailStatus,
    emailError: row.email_error,
    createdAt: row.created_at,
  };
}

function mentionEmailsFromBody(body: string) {
  const emails = new Set<string>();
  const matches = body.matchAll(/@([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi);
  for (const match of matches) {
    const email = match[1]?.trim().toLowerCase();
    if (email) emails.add(email);
  }
  return emails;
}

export async function listWorkspaceUsers(client: unknown): Promise<WorkspaceUser[]> {
  const db = client as SupabaseLikeClient;
  if (!db.auth?.admin?.listUsers) {
    return [];
  }

  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) {
    throw new Error(error.message || "Could not load users.");
  }

  return data.users
    .filter((user) => Boolean(user.email))
    .map((user) => {
      const metadata = mapMetadata(user.user_metadata);
      const email = user.email?.trim().toLowerCase() ?? "";
      const label =
        metadataString(metadata, [
          "full_name",
          "name",
          "display_name",
          "user_name",
          "preferred_username",
        ]) ||
        labelFromEmail(email) ||
        user.id;
      const avatarUrl =
        metadataString(metadata, ["avatar_url", "avatarUrl", "picture", "photo_url"]) || null;
      return { id: user.id, email, label, avatarUrl };
    });
}

async function userMap(client: unknown) {
  const users = await listWorkspaceUsers(client);
  return new Map(users.map((user) => [user.id, user]));
}

async function mentionUserIds(
  client: unknown,
  body: string,
  explicitUserIds: string[] | undefined,
  actorUserId?: string | null
) {
  const users = await listWorkspaceUsers(client);
  const usersByEmail = new Map(users.map((user) => [user.email, user]));
  const ids = new Set<string>();

  for (const userId of explicitUserIds ?? []) {
    if (users.some((user) => user.id === userId)) {
      ids.add(userId);
    }
  }
  for (const email of mentionEmailsFromBody(body)) {
    const user = usersByEmail.get(email);
    if (user) ids.add(user.id);
  }
  if (actorUserId) {
    ids.delete(actorUserId);
  }

  return {
    userIds: Array.from(ids),
    users,
  };
}

async function mentionsByComment(client: unknown, commentIds: string[]) {
  if (commentIds.length === 0) {
    return new Map<string, string[]>();
  }

  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_comment_mentions")
    .select("comment_id, user_id")
    .in("comment_id", commentIds)) as {
    data: MentionRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Could not load comment mentions.");
  }

  const map = new Map<string, string[]>();
  for (const row of data ?? []) {
    map.set(row.comment_id, [...(map.get(row.comment_id) ?? []), row.user_id]);
  }
  return map;
}

export async function listDocumentComments(client: unknown, documentId: string) {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_comments")
    .select(COMMENT_COLUMNS)
    .eq("document_id", documentId)
    .eq("proposal_status", "shared")
    .order("created_at", { ascending: true })) as {
    data: CommentRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Could not load comments.");
  }

  const rows = data ?? [];
  const [users, mentions] = await Promise.all([
    userMap(client),
    mentionsByComment(client, rows.map((row) => row.id)),
  ]);
  return rows.map((row) => mapComment(row, users, mentions));
}

// Pending agent-proposed comments are private to their proposer. This is the
// only read path that returns pending rows, and it is always scoped to the
// requesting user (created_by), so a pending comment can never reach anyone
// else. The editor merges these with the shared list for the proposer only.
export async function listPendingCommentsForUser(
  client: unknown,
  documentId: string,
  userId: string
) {
  if (!userId) {
    return [];
  }

  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_comments")
    .select(COMMENT_COLUMNS)
    .eq("document_id", documentId)
    .eq("proposal_status", "pending")
    .eq("created_by", userId)
    .order("created_at", { ascending: true })) as {
    data: CommentRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Could not load pending comments.");
  }

  const rows = data ?? [];
  const [users, mentions] = await Promise.all([
    userMap(client),
    mentionsByComment(client, rows.map((row) => row.id)),
  ]);
  return rows.map((row) => mapComment(row, users, mentions));
}

// The shared comment thread anchored to a single proposal (a comment on a
// proposal), oldest first. Pending agent-proposed comments stay private and are
// excluded, matching listDocumentComments.
export async function listCommentsForProposal(
  client: unknown,
  documentId: string,
  proposalId: string
) {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_comments")
    .select(COMMENT_COLUMNS)
    .eq("document_id", documentId)
    .eq("proposal_id", proposalId)
    .eq("proposal_status", "shared")
    .order("created_at", { ascending: true })) as {
    data: CommentRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Could not load proposal comments.");
  }

  const rows = data ?? [];
  const [users, mentions] = await Promise.all([
    userMap(client),
    mentionsByComment(client, rows.map((row) => row.id)),
  ]);
  return rows.map((row) => mapComment(row, users, mentions));
}

// Resolve every still-open shared comment anchored to a proposal. Called when
// the proposal is accepted or rejected: the review conversation is over, so its
// comments are marked resolved in one bulk update (no per-comment activity, to
// keep the audit trail from ballooning - the proposal decision already logs an
// event). Returns the number of comments resolved.
export async function resolveOpenCommentsForProposal(
  client: unknown,
  input: { proposalId: string; actorUserId?: string | null }
): Promise<number> {
  if (!input.proposalId) {
    return 0;
  }

  const now = nowIso();
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_comments")
    .update({
      status: "resolved",
      resolved_at: now,
      resolved_by: input.actorUserId ?? null,
      updated_by: input.actorUserId ?? null,
      updated_at: now,
    })
    .eq("proposal_id", input.proposalId)
    .eq("proposal_status", "shared")
    .eq("status", "open")
    .select("id")) as {
    data: { id: string }[] | null;
    error: { message: string } | null;
  };

  if (error) {
    log.warn("resolve_proposal_comments_failed", { proposalId: input.proposalId }, error);
    return 0;
  }

  return (data ?? []).length;
}

export async function recordDocumentActivity(
  client: unknown,
  input: {
    documentId: string;
    actorUserId?: string | null;
    action: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }
) {
  const db = client as SupabaseLikeClient;
  const { error } = (await db.from("creed_document_activity_events").insert({
    document_id: input.documentId,
    actor_user_id: input.actorUserId ?? null,
    action: input.action,
    summary: input.summary,
    metadata: input.metadata ?? {},
    created_at: nowIso(),
  })) as {
    data: unknown;
    error: { message: string } | null;
  };

  if (error) {
    log.warn("document_activity_write_failed", { documentId: input.documentId }, error);
  }
}

export async function listDocumentActivity(client: unknown, documentId: string) {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_activity_events")
    .select(ACTIVITY_COLUMNS)
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(100)) as {
    data: ActivityRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Could not load document activity.");
  }

  const users = await userMap(client);
  return (data ?? []).map((row) => mapActivity(row, users));
}

export async function createDocumentComment(
  client: unknown,
  input: {
    documentId: string;
    body: string;
    actorUserId?: string | null;
    parentId?: string | null;
    referenceId?: string | null;
    referenceQuote?: string | null;
    // Anchor the comment to a specific pending proposal (a comment on a
    // proposal). Open comments on a proposal are auto-resolved when it is
    // accepted or rejected.
    proposalId?: string | null;
    mentionedUserIds?: string[];
    source?: "creed" | "mcp" | "public";
    publicAuthorLabel?: string | null;
    publicAuthorClientId?: string | null;
    // When "pending", the comment is a private agent proposal: it is stored
    // with its mentions but produces no notifications, emails, or activity
    // until the proposer approves it. Defaults to "shared" (normal comment).
    proposalStatus?: "pending" | "shared";
    proposedByAgentLabel?: string | null;
  }
): Promise<MutationResult<CreatedCommentResult>> {
  const body = input.body.trim();
  if (!body) {
    return { ok: false, code: "invalid", error: "Comment body is required." };
  }
  const publicAuthorLabel =
    input.source === "public" ? cleanPublicAuthorLabel(input.publicAuthorLabel) : "";
  const publicAuthorClientId =
    input.source === "public" ? cleanPublicAuthorClientId(input.publicAuthorClientId) : "";
  if (input.source === "public" && !publicAuthorLabel) {
    return { ok: false, code: "invalid", error: "Name is required." };
  }

  const document = await readSharedDocumentById(client, input.documentId);
  if (!document) {
    return { ok: false, code: "not-found", error: "Document not found." };
  }

  let effectiveParentId = input.parentId ?? null;
  if (input.parentId) {
    const db = client as SupabaseLikeClient;
    const { data, error } = (await db
      .from("creed_document_comments")
      .select("id, document_id, parent_id")
      .eq("id", input.parentId)
      .eq("document_id", input.documentId)
      .maybeSingle()) as {
      data: { id: string; document_id: string; parent_id: string | null } | null;
      error: { message: string } | null;
    };
    if (error) {
      return { ok: false, code: "invalid", error: error.message };
    }
    if (!data) {
      return { ok: false, code: "not-found", error: "Parent comment not found." };
    }
    // One level of threading only: replying to a reply attaches to the reply's
    // root comment so threads never nest deeper than parent -> reply.
    effectiveParentId = data.parent_id ?? data.id;
  }

  const { userIds: mentionedUserIds, users } =
    input.source === "public"
      ? { userIds: [], users: [] }
      : await mentionUserIds(client, body, input.mentionedUserIds, input.actorUserId);
  const now = nowIso();
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_comments")
    .insert({
      document_id: input.documentId,
      parent_id: effectiveParentId,
      reference_id: trimToNull(input.referenceId),
      reference_quote: trimToNull(input.referenceQuote),
      proposal_id: trimToNull(input.proposalId),
      body,
      status: "open",
      proposal_status: input.proposalStatus === "pending" ? "pending" : "shared",
      proposed_by_agent_label: input.proposedByAgentLabel ?? null,
      public_author_label: publicAuthorLabel || null,
      public_author_client_id: publicAuthorClientId || null,
      created_by: input.actorUserId ?? null,
      updated_by: input.actorUserId ?? null,
      created_at: now,
      updated_at: now,
    })
    .select(COMMENT_COLUMNS)
    .single()) as {
    data: CommentRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "invalid", error: error.message };
  }
  if (!data) {
    return { ok: false, code: "invalid", error: "Comment was not created." };
  }

  if (mentionedUserIds.length > 0) {
    const { error: mentionError } = (await db.from("creed_document_comment_mentions").insert(
      mentionedUserIds.map((userId) => ({
        comment_id: data.id,
        user_id: userId,
        created_at: now,
      }))
    )) as {
      data: unknown;
      error: { message: string } | null;
    };
    if (mentionError) {
      return { ok: false, code: "invalid", error: mentionError.message };
    }
  }

  const mentions = new Map([[data.id, mentionedUserIds]]);
  const usersMap = new Map(users.map((user) => [user.id, user]));

  // Pending agent proposals stay silent until approved: the comment and its
  // mentions are stored, but no notifications, emails, or activity are produced.
  if (input.proposalStatus === "pending") {
    return {
      ok: true,
      value: { comment: mapComment(data, usersMap, mentions), notifications: [], pendingEmails: [] },
    };
  }

  const actorLabel = buildUserLabel(
    users.find((user) => user.id === input.actorUserId),
    input.source === "public"
      ? publicAuthorLabel
      : input.source === "mcp" ? "MCP agent" : "Someone"
  );
  const { notifications, pendingEmails } = await publishCommentSideEffects(client, {
    document,
    commentId: data.id,
    parentId: input.parentId ?? null,
    body,
    mentionedUserIds,
    actorUserId: input.actorUserId ?? null,
    actorLabel,
    users,
  });

  return {
    ok: true,
    value: {
      comment: mapComment(data, usersMap, mentions),
      notifications,
      pendingEmails,
    },
  };
}

export async function updatePublicCommentAuthorLabel(
  client: unknown,
  input: {
    documentId: string;
    publicAuthorClientId?: string | null;
    previousAuthorLabel?: string | null;
    nextAuthorLabel: string;
  }
): Promise<MutationResult<{ comments: DocumentComment[] }>> {
  const nextAuthorLabel = cleanPublicAuthorLabel(input.nextAuthorLabel);
  if (!nextAuthorLabel) {
    return { ok: false, code: "invalid", error: "Name is required." };
  }

  const publicAuthorClientId = cleanPublicAuthorClientId(input.publicAuthorClientId);
  const previousAuthorLabel = cleanPublicAuthorLabel(input.previousAuthorLabel);
  if (!publicAuthorClientId && !previousAuthorLabel) {
    return { ok: false, code: "invalid", error: "No public commenter identity was provided." };
  }

  const document = await readSharedDocumentById(client, input.documentId);
  if (!document) {
    return { ok: false, code: "not-found", error: "Document not found." };
  }

  const db = client as SupabaseLikeClient;
  const now = nowIso();

  if (publicAuthorClientId) {
    const { error } = (await db
      .from("creed_document_comments")
      .update({
        public_author_label: nextAuthorLabel,
        updated_at: now,
      })
      .eq("document_id", input.documentId)
      .eq("public_author_client_id", publicAuthorClientId)) as {
      data: unknown;
      error: { message: string } | null;
    };
    if (error) {
      return { ok: false, code: "invalid", error: error.message };
    }
  }

  if (previousAuthorLabel) {
    const { error } = (await db
      .from("creed_document_comments")
      .update({
        public_author_label: nextAuthorLabel,
        public_author_client_id: publicAuthorClientId || null,
        updated_at: now,
      })
      .eq("document_id", input.documentId)
      .is("created_by", null)
      .is("public_author_client_id", null)
      .eq("public_author_label", previousAuthorLabel)) as {
      data: unknown;
      error: { message: string } | null;
    };
    if (error) {
      return { ok: false, code: "invalid", error: error.message };
    }
  }

  return {
    ok: true,
    value: {
      comments: await listDocumentComments(client, input.documentId),
    },
  };
}

// Notifications + workspace activity + email fan-out for a newly visible
// comment. Shared by the direct create path and comment approval so the
// "publish" side effects live in exactly one place and fire exactly once.
async function publishCommentSideEffects(
  client: unknown,
  input: {
    document: { id: string; slug: string; title: string };
    commentId: string;
    parentId: string | null;
    body: string;
    mentionedUserIds: string[];
    actorUserId: string | null;
    actorLabel: string;
    users: WorkspaceUser[];
  }
): Promise<{ notifications: DocumentNotification[]; pendingEmails: PendingEmailNotification[] }> {
  const db = client as SupabaseLikeClient;
  const now = nowIso();
  const emailConfigured = isNotificationEmailConfigured();
  const href = `/file?document=${encodeURIComponent(input.document.slug)}&comment=${encodeURIComponent(input.commentId)}`;

  let notifications: DocumentNotification[] = [];
  if (input.mentionedUserIds.length > 0) {
    const { data: notificationRows, error } = (await db
      .from("creed_notifications")
      .insert(
        input.mentionedUserIds.map((userId) => ({
          user_id: userId,
          actor_user_id: input.actorUserId ?? null,
          document_id: input.document.id,
          comment_id: input.commentId,
          type: "mention",
          title: `${input.actorLabel} mentioned you`,
          body: input.body,
          href,
          email_status: emailConfigured ? "pending" : "not-configured",
          created_at: now,
        }))
      )
      .select(NOTIFICATION_COLUMNS)) as {
      data: NotificationRow[] | null;
      error: { message: string } | null;
    };
    if (error) {
      throw new Error(error.message || "Could not create mention notifications.");
    }
    notifications = (notificationRows ?? []).map(mapNotification);
  }

  await recordDocumentActivity(client, {
    documentId: input.document.id,
    actorUserId: input.actorUserId,
    action: input.parentId ? "comment.reply.created" : "comment.created",
    summary: input.parentId ? "Replied to a comment" : "Added a comment",
    metadata: {
      commentId: input.commentId,
      mentionedUserIds: input.mentionedUserIds,
      actorLabel: input.actorLabel,
    },
  });

  const pendingEmails = notifications.flatMap((notification) => {
    const target = input.users.find((user) => user.id === notification.userId);
    if (!target?.email || notification.emailStatus !== "pending") return [];
    return [
      {
        notificationId: notification.id,
        to: target.email,
        actorLabel: input.actorLabel,
        documentTitle: input.document.title,
        commentBody: input.body,
        href,
      },
    ];
  });

  return { notifications, pendingEmails };
}

// Approve a pending agent-proposed comment. Only the proposer (created_by) can
// approve. Flips proposal_status to 'shared' and THEN runs the deferred publish
// side effects (mention notifications, emails, workspace activity) exactly once.
export async function approveDocumentComment(
  client: unknown,
  input: { commentId: string; actorUserId: string }
): Promise<MutationResult<CreatedCommentResult>> {
  const db = client as SupabaseLikeClient;
  const { data: row, error: readError } = (await db
    .from("creed_document_comments")
    .select(COMMENT_COLUMNS)
    .eq("id", input.commentId)
    .maybeSingle()) as {
    data: CommentRow | null;
    error: { message: string } | null;
  };

  if (readError) {
    return { ok: false, code: "invalid", error: readError.message };
  }
  if (!row) {
    return { ok: false, code: "not-found", error: "Comment not found." };
  }
  if (row.created_by !== input.actorUserId) {
    return { ok: false, code: "forbidden", error: "You can only approve your own pending comments." };
  }

  const [users, mentions] = await Promise.all([
    listWorkspaceUsers(client),
    mentionsByComment(client, [row.id]),
  ]);
  const usersMap = new Map(users.map((user) => [user.id, user]));

  // Already shared (double-click / retry): idempotent no-op, no duplicate side
  // effects.
  if (row.proposal_status !== "pending") {
    return {
      ok: true,
      value: { comment: mapComment(row, usersMap, mentions), notifications: [], pendingEmails: [] },
    };
  }

  const now = nowIso();
  const { data: updated, error: updateError } = (await db
    .from("creed_document_comments")
    .update({ proposal_status: "shared", updated_by: input.actorUserId, updated_at: now })
    .eq("id", row.id)
    .eq("proposal_status", "pending")
    .select(COMMENT_COLUMNS)
    .maybeSingle()) as {
    data: CommentRow | null;
    error: { message: string } | null;
  };

  if (updateError) {
    return { ok: false, code: "invalid", error: updateError.message };
  }
  if (!updated) {
    // Lost the race to another approve; treat as already shared.
    return {
      ok: true,
      value: { comment: mapComment(row, usersMap, mentions), notifications: [], pendingEmails: [] },
    };
  }

  const document = await readSharedDocumentById(client, updated.document_id);
  if (!document) {
    return { ok: false, code: "not-found", error: "Document not found." };
  }

  const mentionedUserIds = mentions.get(row.id) ?? [];
  const actorLabel = buildUserLabel(usersMap.get(input.actorUserId), "Someone");
  const { notifications, pendingEmails } = await publishCommentSideEffects(client, {
    document,
    commentId: updated.id,
    parentId: updated.parent_id,
    body: updated.body,
    mentionedUserIds,
    actorUserId: input.actorUserId,
    actorLabel,
    users,
  });

  return {
    ok: true,
    value: { comment: mapComment(updated, usersMap, mentions), notifications, pendingEmails },
  };
}

// Reject a pending agent-proposed comment: hard-delete the row (and its replies)
// with no activity trace. Only the proposer (created_by) can reject.
export async function rejectDocumentComment(
  client: unknown,
  input: { commentId: string; actorUserId: string }
): Promise<MutationResult<{ id: string; parentId: string | null }>> {
  const db = client as SupabaseLikeClient;
  const { data: existing, error: readError } = (await db
    .from("creed_document_comments")
    .select("id, document_id, created_by, parent_id, proposal_status")
    .eq("id", input.commentId)
    .maybeSingle()) as {
    data: {
      id: string;
      document_id: string;
      created_by: string | null;
      parent_id: string | null;
      proposal_status: string | null;
    } | null;
    error: { message: string } | null;
  };

  if (readError) {
    return { ok: false, code: "invalid", error: readError.message };
  }
  if (!existing) {
    return { ok: false, code: "not-found", error: "Comment not found." };
  }
  if (existing.created_by !== input.actorUserId) {
    return { ok: false, code: "forbidden", error: "You can only reject your own pending comments." };
  }
  if (existing.proposal_status !== "pending") {
    return { ok: false, code: "invalid", error: "Only pending comments can be rejected." };
  }

  // Remove replies first (only relevant when rejecting a root comment).
  if (!existing.parent_id) {
    const { error: repliesError } = (await db
      .from("creed_document_comments")
      .delete()
      .eq("parent_id", existing.id)) as { error: { message: string } | null };
    if (repliesError) {
      return { ok: false, code: "invalid", error: repliesError.message };
    }
  }

  const { error: deleteError } = (await db
    .from("creed_document_comments")
    .delete()
    .eq("id", existing.id)) as { error: { message: string } | null };
  if (deleteError) {
    return { ok: false, code: "invalid", error: deleteError.message };
  }

  // No activity event: a rejected pending comment leaves no trace.
  return { ok: true, value: { id: existing.id, parentId: existing.parent_id } };
}

export async function setDocumentCommentStatus(
  client: unknown,
  input: {
    commentId: string;
    status: "open" | "resolved";
    actorUserId?: string | null;
  }
): Promise<MutationResult<DocumentComment>> {
  const now = nowIso();
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_comments")
    .update({
      status: input.status,
      resolved_at: input.status === "resolved" ? now : null,
      resolved_by: input.status === "resolved" ? input.actorUserId ?? null : null,
      updated_by: input.actorUserId ?? null,
      updated_at: now,
    })
    .eq("id", input.commentId)
    .select(COMMENT_COLUMNS)
    .maybeSingle()) as {
    data: CommentRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "invalid", error: error.message };
  }
  if (!data) {
    return { ok: false, code: "not-found", error: "Comment not found." };
  }

  await recordDocumentActivity(client, {
    documentId: data.document_id,
    actorUserId: input.actorUserId,
    action: input.status === "resolved" ? "comment.resolved" : "comment.reopened",
    summary: input.status === "resolved" ? "Resolved a comment" : "Reopened a comment",
    metadata: { commentId: data.id },
  });

  const [users, mentions] = await Promise.all([
    userMap(client),
    mentionsByComment(client, [data.id]),
  ]);
  return { ok: true, value: mapComment(data, users, mentions) };
}

// Edit the body text of an existing comment (or reply). Mentions and the
// referenced quote are left untouched - editing is for fixing wording, not
// re-anchoring. Only the original author path is enforced at the route layer.
export async function updateDocumentComment(
  client: unknown,
  input: {
    commentId: string;
    body: string;
    actorUserId?: string | null;
  }
): Promise<MutationResult<DocumentComment>> {
  const body = input.body.trim();
  if (!body) {
    return { ok: false, code: "invalid", error: "Comment body is required." };
  }

  const now = nowIso();
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_comments")
    .update({
      body,
      updated_by: input.actorUserId ?? null,
      updated_at: now,
    })
    .eq("id", input.commentId)
    .eq("created_by", input.actorUserId ?? "")
    .select(COMMENT_COLUMNS)
    .maybeSingle()) as {
    data: CommentRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "invalid", error: error.message };
  }
  if (!data) {
    return { ok: false, code: "not-found", error: "You can only edit your own comments." };
  }

  await recordDocumentActivity(client, {
    documentId: data.document_id,
    actorUserId: input.actorUserId,
    action: "comment.updated",
    summary: "Edited a comment",
    metadata: { commentId: data.id },
  });

  const [users, mentions] = await Promise.all([
    userMap(client),
    mentionsByComment(client, [data.id]),
  ]);
  return { ok: true, value: mapComment(data, users, mentions) };
}

// Delete a comment (or reply) the actor authored. Deleting a root comment also
// removes its replies so a thread never leaves orphaned children behind.
export async function deleteDocumentComment(
  client: unknown,
  input: {
    commentId: string;
    actorUserId?: string | null;
  }
): Promise<MutationResult<{ id: string; parentId: string | null }>> {
  const db = client as SupabaseLikeClient;
  const { data: existing, error: readError } = (await db
    .from("creed_document_comments")
    .select("id, document_id, created_by, parent_id")
    .eq("id", input.commentId)
    .maybeSingle()) as {
    data: { id: string; document_id: string; created_by: string | null; parent_id: string | null } | null;
    error: { message: string } | null;
  };

  if (readError) {
    return { ok: false, code: "invalid", error: readError.message };
  }
  if (!existing) {
    return { ok: false, code: "not-found", error: "Comment not found." };
  }
  if (!input.actorUserId || existing.created_by !== input.actorUserId) {
    return { ok: false, code: "forbidden", error: "You can only delete your own comments." };
  }

  // Remove replies first (only relevant when deleting a root comment).
  if (!existing.parent_id) {
    const { error: repliesError } = (await db
      .from("creed_document_comments")
      .delete()
      .eq("parent_id", existing.id)) as { error: { message: string } | null };
    if (repliesError) {
      return { ok: false, code: "invalid", error: repliesError.message };
    }
  }

  const { error: deleteError } = (await db
    .from("creed_document_comments")
    .delete()
    .eq("id", existing.id)) as { error: { message: string } | null };
  if (deleteError) {
    return { ok: false, code: "invalid", error: deleteError.message };
  }

  await recordDocumentActivity(client, {
    documentId: existing.document_id,
    actorUserId: input.actorUserId,
    action: "comment.deleted",
    summary: "Deleted a comment",
    metadata: { commentId: existing.id },
  });

  return { ok: true, value: { id: existing.id, parentId: existing.parent_id } };
}

export async function listNotifications(client: unknown, userId: string) {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50)) as {
    data: NotificationRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Could not load notifications.");
  }

  return (data ?? []).map(mapNotification);
}

export async function markNotificationRead(
  client: unknown,
  input: {
    notificationId: string;
    userId: string;
    read: boolean;
  }
): Promise<MutationResult<DocumentNotification>> {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_notifications")
    .update({ read_at: input.read ? nowIso() : null })
    .eq("id", input.notificationId)
    .eq("user_id", input.userId)
    .select(NOTIFICATION_COLUMNS)
    .maybeSingle()) as {
    data: NotificationRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "invalid", error: error.message };
  }
  if (!data) {
    return { ok: false, code: "not-found", error: "Notification not found." };
  }

  return { ok: true, value: mapNotification(data) };
}

async function markNotificationEmailStatus(
  client: unknown,
  input: {
    notificationId: string;
    status: "not-configured" | "sent" | "failed";
    error?: string | null;
  }
) {
  const db = client as SupabaseLikeClient;
  const { error } = (await db
    .from("creed_notifications")
    .update({
      email_status: input.status,
      email_error: input.error ?? null,
      email_attempted_at: nowIso(),
    })
    .eq("id", input.notificationId)) as {
    data: unknown;
    error: { message: string } | null;
  };

  if (error) {
    log.warn("notification_email_status_write_failed", { notificationId: input.notificationId }, error);
  }
}

export async function deliverPendingMentionEmails(
  client: unknown,
  pendingEmails: PendingEmailNotification[]
) {
  await Promise.all(
    pendingEmails.map(async (pending) => {
      const result = await sendMentionNotificationEmail({
        to: pending.to,
        actorLabel: pending.actorLabel,
        documentTitle: pending.documentTitle,
        commentBody: pending.commentBody,
        href: pending.href,
      });
      await markNotificationEmailStatus(client, {
        notificationId: pending.notificationId,
        status: result.status,
        error: result.status === "failed" || result.status === "not-configured" ? result.error : null,
      });
    })
  );
}
