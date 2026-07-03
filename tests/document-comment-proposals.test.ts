import { describe, expect, it } from "vitest";

import {
  approveDocumentComment,
  createDocumentComment,
  listDocumentComments,
  listPublicDocumentComments,
  listPendingCommentsForUser,
  rejectDocumentComment,
} from "@/lib/document-collaboration";
import { createFakeClientWithDocument } from "./helpers/fake-supabase";

// The fake Supabase client has no `auth.admin.listUsers`, so listWorkspaceUsers
// returns [] and mention resolution is a no-op. These tests exercise the
// pending -> approve/reject lifecycle and the leak-prevention invariants, which
// do not depend on the user roster.

describe("agent comment proposals", () => {
  it("creates an agent comment as pending with no side effects", async () => {
    const { client, documentId } = createFakeClientWithDocument();

    const result = await createDocumentComment(client, {
      documentId,
      body: "Consider tightening this section.",
      actorUserId: "user-1",
      source: "mcp",
      proposalStatus: "pending",
      proposedByAgentLabel: "Claude",
    });

    expect(result.ok).toBe(true);
    const rows = client.rows("creed_document_comments");
    expect(rows).toHaveLength(1);
    expect(rows[0].proposal_status).toBe("pending");
    expect(rows[0].created_by).toBe("user-1");
    expect(rows[0].proposed_by_agent_label).toBe("Claude");
    // Property 2: no notifications, no activity while pending.
    expect(client.count("creed_notifications")).toBe(0);
    expect(client.count("creed_document_activity_events")).toBe(0);
  });

  it("creates a human editor comment as shared with activity", async () => {
    const { client, documentId } = createFakeClientWithDocument();

    const result = await createDocumentComment(client, {
      documentId,
      body: "Looks good.",
      actorUserId: "user-1",
      source: "creed",
    });

    expect(result.ok).toBe(true);
    expect(client.rows("creed_document_comments")[0].proposal_status).toBe("shared");
    // Shared comments record a workspace-visible activity event.
    expect(client.count("creed_document_activity_events")).toBe(1);
  });

  it("excludes pending comments from listDocumentComments for everyone", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    await createDocumentComment(client, {
      documentId,
      body: "pending one",
      actorUserId: "user-1",
      proposalStatus: "pending",
    });
    await createDocumentComment(client, {
      documentId,
      body: "shared one",
      actorUserId: "user-1",
      proposalStatus: "shared",
    });

    const shared = await listDocumentComments(client, documentId);
    expect(shared).toHaveLength(1);
    expect(shared[0].body).toBe("shared one");
  });

  it("hides proposal comments from the authenticated document list", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    client.seed("creed_document_proposals", [
      { id: "proposal-stale", document_id: documentId, status: "accepted" },
      { id: "proposal-live", document_id: documentId, status: "pending" },
    ]);

    await createDocumentComment(client, {
      documentId,
      body: "Resolved proposal review note.",
      actorUserId: "user-1",
      proposalId: "proposal-stale",
      source: "creed",
    });
    await createDocumentComment(client, {
      documentId,
      body: "Live proposal review note.",
      actorUserId: "user-1",
      proposalId: "proposal-live",
      source: "creed",
    });
    await createDocumentComment(client, {
      documentId,
      body: "Document note.",
      actorUserId: "user-1",
      source: "creed",
    });

    const shared = await listDocumentComments(client, documentId);
    expect(shared.map((comment) => comment.body)).toEqual(["Document note."]);
  });

  it("only returns open document-level comments for public shares", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    client.seed("creed_document_proposals", [
      { id: "proposal-live", document_id: documentId, status: "pending" },
    ]);

    await createDocumentComment(client, {
      documentId,
      body: "Visible public note.",
      referenceQuote: "Original body.",
      source: "public",
      publicAuthorLabel: "Reader",
      publicAuthorClientId: "reader-1",
    });
    await createDocumentComment(client, {
      documentId,
      body: "Proposal review note.",
      proposalId: "proposal-live",
      actorUserId: "user-1",
      source: "creed",
    });
    const resolved = await createDocumentComment(client, {
      documentId,
      body: "Resolved document note.",
      source: "public",
      publicAuthorLabel: "Reader",
      publicAuthorClientId: "reader-1",
    });
    if (!resolved.ok) throw new Error("setup failed");
    client.seed("creed_document_comments", [
      ...client.rows("creed_document_comments").map((row) =>
        row.id === resolved.value.comment.id ? { ...row, status: "resolved" } : row
      ),
    ]);

    const publicComments = await listPublicDocumentComments(client, documentId);
    expect(publicComments.map((comment) => comment.body)).toEqual(["Visible public note."]);
  });

  it("returns only the caller's own pending comments from listPendingCommentsForUser", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    await createDocumentComment(client, {
      documentId,
      body: "mine",
      actorUserId: "user-1",
      proposalStatus: "pending",
    });
    await createDocumentComment(client, {
      documentId,
      body: "theirs",
      actorUserId: "user-2",
      proposalStatus: "pending",
    });

    const mine = await listPendingCommentsForUser(client, documentId, "user-1");
    expect(mine).toHaveLength(1);
    expect(mine[0].body).toBe("mine");

    const empty = await listPendingCommentsForUser(client, documentId, "");
    expect(empty).toHaveLength(0);
  });

  it("only lets the proposer approve, and publishes exactly once", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    const created = await createDocumentComment(client, {
      documentId,
      body: "audit note",
      actorUserId: "user-1",
      proposalStatus: "pending",
      proposedByAgentLabel: "Codex",
    });
    if (!created.ok) throw new Error("setup failed");
    const commentId = created.value.comment.id;

    const forbidden = await approveDocumentComment(client, { commentId, actorUserId: "user-2" });
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.code).toBe("forbidden");
    // Still pending, still no activity after a forbidden attempt.
    expect(client.rows("creed_document_comments")[0].proposal_status).toBe("pending");
    expect(client.count("creed_document_activity_events")).toBe(0);

    const approved = await approveDocumentComment(client, { commentId, actorUserId: "user-1" });
    expect(approved.ok).toBe(true);
    expect(client.rows("creed_document_comments")[0].proposal_status).toBe("shared");
    // created_by unchanged: authorship is the proposer.
    expect(client.rows("creed_document_comments")[0].created_by).toBe("user-1");
    expect(client.count("creed_document_activity_events")).toBe(1);

    // Second approve is an idempotent no-op: no duplicate activity.
    const again = await approveDocumentComment(client, { commentId, actorUserId: "user-1" });
    expect(again.ok).toBe(true);
    expect(client.count("creed_document_activity_events")).toBe(1);
  });

  it("only lets the proposer reject, and deletes the comment and its replies with no activity", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    const root = await createDocumentComment(client, {
      documentId,
      body: "root pending",
      actorUserId: "user-1",
      proposalStatus: "pending",
    });
    if (!root.ok) throw new Error("setup failed");
    const rootId = root.value.comment.id;

    await createDocumentComment(client, {
      documentId,
      body: "reply pending",
      actorUserId: "user-1",
      parentId: rootId,
      proposalStatus: "pending",
    });
    expect(client.count("creed_document_comments")).toBe(2);

    const forbidden = await rejectDocumentComment(client, { commentId: rootId, actorUserId: "user-2" });
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.code).toBe("forbidden");
    expect(client.count("creed_document_comments")).toBe(2);

    const rejected = await rejectDocumentComment(client, { commentId: rootId, actorUserId: "user-1" });
    expect(rejected.ok).toBe(true);
    expect(client.count("creed_document_comments")).toBe(0);
    expect(client.count("creed_document_activity_events")).toBe(0);
  });
});
