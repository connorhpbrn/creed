import { describe, expect, it } from "vitest";

// Uses the REAL document-collaboration + document-editing together (no mocks):
// this exercises the "comment on a proposal, auto-resolve it when the proposal
// is decided" behaviour end to end against the in-memory fake client.
import { acceptDocumentProposal, rejectDocumentProposal, routeDocumentEdit } from "@/lib/document-editing";
import {
  createDocumentComment,
  listCommentsForProposal,
  resolveOpenCommentsForProposal,
  setDocumentCommentStatus,
} from "@/lib/document-collaboration";
import type { EditPolicyValue } from "@/lib/workspace-settings";
import { createFakeClientWithDocument, FakeSupabaseClient } from "./helpers/fake-supabase";

function setPolicy(client: FakeSupabaseClient, human: EditPolicyValue) {
  client.seed("creed_workspace_settings", [
    { id: true, human_edit_policy: human, agent_edit_policy: human },
  ]);
}

async function proposeOne(client: FakeSupabaseClient, documentId: string) {
  const proposed = await routeDocumentEdit(client, {
    documentId,
    actorType: "human",
    author: { userId: "author-A" },
    content: "# Test Doc\nChanged body.",
    expectedRevision: 1,
    summary: "propose",
  });
  if (!(proposed.ok && proposed.outcome === "proposed")) throw new Error("setup failed");
  return proposed.proposals[0];
}

describe("comments on proposals", () => {
  it("anchors a comment to a proposal and returns it in the proposal thread", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, "propose");
    const proposal = await proposeOne(client, documentId);

    const created = await createDocumentComment(client, {
      documentId,
      body: "Can you clarify this section?",
      actorUserId: "reviewer-1",
      proposalId: proposal.id,
      source: "creed",
    });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.value.comment.proposalId).toBe(proposal.id);

    const thread = await listCommentsForProposal(client, documentId, proposal.id);
    expect(thread).toHaveLength(1);
    expect(thread[0].body).toBe("Can you clarify this section?");
  });

  it("keeps replies anchored to their proposal thread", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, "propose");
    const proposal = await proposeOne(client, documentId);

    const root = await createDocumentComment(client, {
      documentId,
      body: "Can you clarify this section?",
      actorUserId: "reviewer-1",
      proposalId: proposal.id,
      source: "creed",
    });
    if (!root.ok) throw new Error("setup failed");

    const reply = await createDocumentComment(client, {
      documentId,
      body: "Yes, I will tighten the wording.",
      actorUserId: "author-A",
      parentId: root.value.comment.id,
      source: "creed",
    });

    expect(reply.ok).toBe(true);
    if (reply.ok) expect(reply.value.comment.proposalId).toBe(proposal.id);

    const thread = await listCommentsForProposal(client, documentId, proposal.id);
    expect(thread.map((comment) => comment.body)).toEqual([
      "Can you clarify this section?",
      "Yes, I will tighten the wording.",
    ]);
  });

  it("only lets the comment author resolve or reopen a proposal comment", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, "propose");
    const proposal = await proposeOne(client, documentId);

    const created = await createDocumentComment(client, {
      documentId,
      body: "Please double-check this.",
      actorUserId: "reviewer-1",
      proposalId: proposal.id,
      source: "creed",
    });
    if (!created.ok) throw new Error("setup failed");

    const forbidden = await setDocumentCommentStatus(client, {
      commentId: created.value.comment.id,
      status: "resolved",
      actorUserId: "author-A",
    });
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.code).toBe("forbidden");

    const allowed = await setDocumentCommentStatus(client, {
      commentId: created.value.comment.id,
      status: "resolved",
      actorUserId: "reviewer-1",
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(allowed.value.status).toBe("resolved");
  });

  it("auto-resolves open proposal comments when the proposal is accepted", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, "propose");
    const proposal = await proposeOne(client, documentId);

    await createDocumentComment(client, {
      documentId,
      body: "Looks off to me.",
      actorUserId: "reviewer-1",
      proposalId: proposal.id,
      source: "creed",
    });

    const accepted = await acceptDocumentProposal(client, {
      documentId,
      proposalId: proposal.id,
      actorUserId: "user-B",
    });
    expect(accepted.ok).toBe(true);

    const thread = await listCommentsForProposal(client, documentId, proposal.id);
    expect(thread).toHaveLength(1);
    expect(thread[0].status).toBe("resolved");
  });

  it("auto-resolves open proposal comments when the proposal is rejected", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, "propose");
    const proposal = await proposeOne(client, documentId);

    await createDocumentComment(client, {
      documentId,
      body: "Not needed.",
      actorUserId: "reviewer-1",
      proposalId: proposal.id,
      source: "creed",
    });

    const rejected = await rejectDocumentProposal(client, {
      documentId,
      proposalId: proposal.id,
      actorUserId: "user-B",
    });
    expect(rejected.ok).toBe(true);

    const thread = await listCommentsForProposal(client, documentId, proposal.id);
    expect(thread[0].status).toBe("resolved");
  });

  it("does not touch comments on other proposals", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, "propose");
    const proposal = await proposeOne(client, documentId);

    await createDocumentComment(client, {
      documentId,
      body: "Unrelated general comment.",
      actorUserId: "reviewer-1",
      source: "creed",
    });

    const resolvedCount = await resolveOpenCommentsForProposal(client, {
      proposalId: proposal.id,
      actorUserId: "user-B",
    });
    expect(resolvedCount).toBe(0);

    // The general (proposal-less) comment stays open.
    const general = client
      .rows("creed_document_comments")
      .find((row) => row.body === "Unrelated general comment.");
    expect(general?.status).toBe("open");
  });
});
