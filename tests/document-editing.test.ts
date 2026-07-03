import { describe, expect, it, vi } from "vitest";

// document-editing calls recordDocumentActivity from lib/document-collaboration,
// which transitively imports notification-email / shared-documents helpers we
// don't want to load under test. Mock the whole module to a no-op.
vi.mock("@/lib/document-collaboration", () => ({
  recordDocumentActivity: vi.fn(async () => {}),
  resolveOpenCommentsForProposal: vi.fn(async () => 0),
  resolveOpenCommentsForProposals: vi.fn(async () => 0),
}));

import {
  acceptDocumentProposal,
  acceptDocumentProposals,
  listDocumentProposals,
  rejectDocumentProposal,
  rejectDocumentProposals,
  revertDocumentToVersion,
  routeDocumentEdit,
} from "@/lib/document-editing";
import type { ActorType, EditPolicyValue } from "@/lib/workspace-settings";
import {
  createFakeClientWithDocument,
  FakeSupabaseClient,
} from "./helpers/fake-supabase";

function setPolicy(
  client: FakeSupabaseClient,
  policy: { human?: EditPolicyValue; agent?: EditPolicyValue }
) {
  client.seed("creed_workspace_settings", [
    {
      id: true,
      human_edit_policy: policy.human ?? "propose",
      agent_edit_policy: policy.agent ?? "propose",
    },
  ]);
}

const VERSIONS = "creed_document_versions";
const DOCS = "creed_documents";
const PROPOSALS = "creed_document_proposals";

describe("Property 1: policy determinism", () => {
  const actorTypes: ActorType[] = ["human", "agent"];
  const policies: EditPolicyValue[] = ["cant-edit", "propose", "direct"];

  for (const actorType of actorTypes) {
    for (const policy of policies) {
      it(`${actorType} + ${policy} yields the one correct outcome`, async () => {
        const { client, documentId } = createFakeClientWithDocument();
        setPolicy(client, { human: policy, agent: policy });

        const result = await routeDocumentEdit(client, {
          documentId,
          actorType,
          author: { userId: "u-1", agentLabel: actorType === "agent" ? "Codex" : null },
          content: "# Test Doc\nEdited body.",
          expectedRevision: 1,
          summary: "edit",
        });

        if (policy === "cant-edit") {
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.code).toBe("forbidden");
        } else if (policy === "propose") {
          expect(result.ok).toBe(true);
          if (result.ok) expect(result.outcome).toBe("proposed");
        } else {
          expect(result.ok).toBe(true);
          if (result.ok) expect(result.outcome).toBe("applied");
        }
      });
    }
  }
});

describe("Property 2: version-per-apply", () => {
  it("a direct edit appends exactly one version and advances revision by 1", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "direct" });

    const result = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "u-1" },
      content: "# Test Doc\nDirect edit.",
      expectedRevision: 1,
      summary: "direct edit",
    });

    expect(result.ok).toBe(true);
    expect(client.count(VERSIONS)).toBe(1);
    expect(client.rows(DOCS)[0].revision).toBe(2);
  });

  it("an accepted proposal appends exactly one version and advances revision by 1", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "propose" });

    const proposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "author-A" },
      content: "# Test Doc\nProposed edit.",
      expectedRevision: 1,
      summary: "proposed edit",
    });
    expect(proposed.ok && proposed.outcome === "proposed").toBe(true);
    // Pending proposal has not applied a version yet.
    expect(client.count(VERSIONS)).toBe(0);

    const proposalId = proposed.ok && proposed.outcome === "proposed" ? proposed.proposals[0].id : "";
    const accepted = await acceptDocumentProposal(client, {
      documentId,
      proposalId,
      actorUserId: "user-B",
    });

    expect(accepted.ok).toBe(true);
    expect(client.count(VERSIONS)).toBe(1);
    expect(client.rows(DOCS)[0].revision).toBe(2);
  });
});

describe("Property 4: pending isolation", () => {
  it("creating a proposal does not change document content or revision", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "propose" });
    const before = client.rows(DOCS)[0];

    const proposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "u-1" },
      content: "# Test Doc\nTotally different content.",
      expectedRevision: 1,
      summary: "proposed",
    });

    expect(proposed.ok && proposed.outcome === "proposed").toBe(true);
    const after = client.rows(DOCS)[0];
    expect(after.content).toBe(before.content);
    expect(after.revision).toBe(before.revision);
    expect(client.count(VERSIONS)).toBe(0);
  });
});

describe("Property 5: at-most-once resolution", () => {
  it("a second accept of an already-accepted proposal conflicts; draft applied once", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "propose" });

    const proposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "author-A" },
      content: "# Test Doc\nProposed once.",
      expectedRevision: 1,
      summary: "proposed",
    });
    const proposalId = proposed.ok && proposed.outcome === "proposed" ? proposed.proposals[0].id : "";

    const first = await acceptDocumentProposal(client, { documentId, proposalId, actorUserId: "user-B" });
    const second = await acceptDocumentProposal(client, { documentId, proposalId, actorUserId: "user-C" });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("conflict");
    // Applied at most once.
    expect(client.count(VERSIONS)).toBe(1);
    expect(client.rows(DOCS)[0].revision).toBe(2);
  });

  it("rejecting an already-accepted proposal conflicts", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "propose" });

    const proposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "author-A" },
      content: "# Test Doc\nProposed.",
      expectedRevision: 1,
      summary: "proposed",
    });
    const proposalId = proposed.ok && proposed.outcome === "proposed" ? proposed.proposals[0].id : "";

    await acceptDocumentProposal(client, { documentId, proposalId, actorUserId: "user-B" });
    const rejected = await rejectDocumentProposal(client, { documentId, proposalId, actorUserId: "user-C" });

    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe("conflict");
  });
});

describe("Property 6: concurrency guard", () => {
  it("applying against a stale expectedRevision is rejected without mutating content", async () => {
    // Document is already at revision 2; a submit against revision 1 is stale.
    const { client, documentId } = createFakeClientWithDocument({ revision: 2, content: "# Test Doc\nCurrent." });
    setPolicy(client, { human: "direct" });
    const before = client.rows(DOCS)[0];

    const result = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "u-1" },
      content: "# Test Doc\nStale write.",
      expectedRevision: 1,
      summary: "stale",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("conflict");
    const after = client.rows(DOCS)[0];
    expect(after.content).toBe(before.content);
    expect(after.revision).toBe(2);
    expect(client.count(VERSIONS)).toBe(0);
  });

  it("accepting a proposal whose base_revision is stale is rejected", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "propose", agent: "direct" });

    // Author proposes against revision 1.
    const proposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "author-A" },
      content: "# Test Doc\nProposed against v1.",
      expectedRevision: 1,
      summary: "proposed",
    });
    const proposalId = proposed.ok && proposed.outcome === "proposed" ? proposed.proposals[0].id : "";

    // Meanwhile an agent applies a direct edit, moving the document to revision 2.
    await routeDocumentEdit(client, {
      documentId,
      actorType: "agent",
      author: { agentLabel: "Codex" },
      content: "# Test Doc\nAgent moved it on.",
      expectedRevision: 1,
      summary: "direct",
    });
    expect(client.rows(DOCS)[0].revision).toBe(2);

    const accepted = await acceptDocumentProposal(client, { documentId, proposalId, actorUserId: "user-B" });
    expect(accepted.ok).toBe(false);
    if (!accepted.ok) expect(accepted.code).toBe("conflict");
    // Only the agent's direct edit produced a version.
    expect(client.count(VERSIONS)).toBe(1);
  });
});

describe("Property 7: reject safety", () => {
  it("rejecting sets status rejected, appends no version, and keeps content", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "propose" });
    const before = client.rows(DOCS)[0];

    const proposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "author-A" },
      content: "# Test Doc\nShould never apply.",
      expectedRevision: 1,
      summary: "proposed",
    });
    const proposalId = proposed.ok && proposed.outcome === "proposed" ? proposed.proposals[0].id : "";

    const rejected = await rejectDocumentProposal(client, { documentId, proposalId, actorUserId: "user-B" });
    expect(rejected.ok).toBe(true);
    if (rejected.ok) expect(rejected.value.status).toBe("rejected");

    const after = client.rows(DOCS)[0];
    expect(after.content).toBe(before.content);
    expect(after.revision).toBe(before.revision);
    expect(client.count(VERSIONS)).toBe(0);

    // Rejected proposal is retrievable in history and not returned to pending.
    const pending = await listDocumentProposals(client, documentId, { status: "pending" });
    expect(pending).toHaveLength(0);
    const rejectedList = await listDocumentProposals(client, documentId, { status: "rejected" });
    expect(rejectedList).toHaveLength(1);
    expect(rejectedList[0].id).toBe(proposalId);
  });
});

describe("Property 8: attribution preservation", () => {
  it("a version from an accepted proposal is attributed to the proposal author", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "propose" });

    const proposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "author-A" },
      content: "# Test Doc\nBy author A.",
      expectedRevision: 1,
      summary: "proposed",
    });
    const proposalId = proposed.ok && proposed.outcome === "proposed" ? proposed.proposals[0].id : "";

    const accepted = await acceptDocumentProposal(client, { documentId, proposalId, actorUserId: "accepting-user-B" });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.value.version.authorUserId).toBe("author-A");
    }

    const versionRow = client.rows(VERSIONS)[0];
    expect(versionRow.author_user_id).toBe("author-A");
    expect(versionRow.source_proposal_id).toBe(proposalId);

    // The accepting member is recorded as the resolver, not the author.
    const proposalRow = client.rows(PROPOSALS)[0];
    expect(proposalRow.resolved_by).toBe("accepting-user-B");
  });
});

describe("Property 3 (bonus): revert appends and never deletes", () => {
  it("reverting to a prior version yields the old content and a larger version count", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "direct" });

    const first = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "u-1" },
      content: "# Test Doc\nVersion two body.",
      expectedRevision: 1,
      summary: "edit 1",
    });
    expect(first.ok).toBe(true);
    const v2Id = first.ok && first.outcome === "applied" ? first.version.id : "";

    await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "u-1" },
      content: "# Test Doc\nVersion three body.",
      expectedRevision: 2,
      summary: "edit 2",
    });
    expect(client.count(VERSIONS)).toBe(2);
    expect(client.rows(DOCS)[0].revision).toBe(3);

    const reverted = await revertDocumentToVersion(client, {
      documentId,
      versionId: v2Id,
      actorType: "human",
      author: { userId: "u-1" },
      expectedRevision: 3,
    });

    expect(reverted.ok).toBe(true);
    // Appended, not deleted: 3 versions now, revision 4, content back to v2 body.
    expect(client.count(VERSIONS)).toBe(3);
    expect(client.rows(DOCS)[0].revision).toBe(4);
    expect(client.rows(DOCS)[0].content).toBe("# Test Doc\nVersion two body.");
  });
});

describe("Hunk proposals (families + independent accept)", () => {
  const MULTI = [
    "# Doc",
    "Intro sentence with old tone and stable middle and old ending.",
    "",
    "Next line stays.",
  ].join("\n");
  const BOTH = [
    "# Doc",
    "Intro sentence with new tone and stable middle and fresh ending.",
    "",
    "Next line stays.",
  ].join("\n");

  async function proposeBoth() {
    const { client, documentId } = createFakeClientWithDocument({ content: MULTI });
    setPolicy(client, { human: "propose" });
    const proposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "author-A" },
      content: BOTH,
      expectedRevision: 1,
      summary: "propose two changes",
    });
    if (!(proposed.ok && proposed.outcome === "proposed")) throw new Error("setup failed");
    return { client, documentId, proposals: proposed.proposals };
  }

  it("splits one edit into a proposal per changed hunk, sharing a family", async () => {
    const { client, proposals } = await proposeBoth();
    expect(proposals).toHaveLength(2);
    expect(proposals[0].familyId).toBeTruthy();
    expect(proposals[0].familyId).toBe(proposals[1].familyId);
    expect(proposals.map((proposal) => proposal.hunkIndex)).toEqual([0, 1]);
    expect(proposals.every((proposal) => proposal.kind === "document-hunk")).toBe(true);
    expect(proposals.every((proposal) => proposal.classification.length > 0)).toBe(true);
    // Creating proposals never touches the document.
    expect(client.rows(DOCS)[0].content).toBe(MULTI);
  });

  it("keeps consecutive word edits in one proposal", async () => {
    const before = "# Doc\nAlpha beta gamma delta.";
    const after = "# Doc\nAlpha bright green delta.";
    const { client, documentId } = createFakeClientWithDocument({ content: before });
    setPolicy(client, { human: "propose" });

    const proposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "author-A" },
      content: after,
      expectedRevision: 1,
      summary: "adjacent words",
    });
    if (!(proposed.ok && proposed.outcome === "proposed")) throw new Error("setup failed");
    expect(proposed.proposals).toHaveLength(1);
    expect(proposed.proposals[0].hunkBefore).toContain("beta");
    expect(proposed.proposals[0].hunkAfter).toContain("bright");
  });

  it("lists proposals in proposed document order within a family", async () => {
    const { client, documentId, proposals } = await proposeBoth();

    client.seed(PROPOSALS, client.rows(PROPOSALS).reverse());
    const listed = await listDocumentProposals(client, documentId);
    expect(listed.map((proposal) => proposal.id)).toEqual(proposals.map((proposal) => proposal.id));
    expect(listed.map((proposal) => proposal.hunkIndex)).toEqual([0, 1]);
  });

  it("accepts each hunk independently, advancing the document once per accept", async () => {
    const { client, documentId, proposals } = await proposeBoth();
    const firstHunk = proposals.find((proposal) => proposal.hunkIndex === 0)!;
    const secondHunk = proposals.find((proposal) => proposal.hunkIndex === 1)!;

    const first = await acceptDocumentProposal(client, {
      documentId,
      proposalId: secondHunk.id,
      actorUserId: "u-B",
    });
    expect(first.ok).toBe(true);
    expect(client.rows(DOCS)[0].content).toContain("old tone");
    expect(client.rows(DOCS)[0].content).toContain("fresh ending");
    expect(client.rows(DOCS)[0].revision).toBe(2);

    // The first hunk was authored against revision 1 but must still apply after
    // its sibling advanced the document.
    const second = await acceptDocumentProposal(client, {
      documentId,
      proposalId: firstHunk.id,
      actorUserId: "u-B",
    });
    expect(second.ok).toBe(true);
    expect(client.rows(DOCS)[0].content).toBe(BOTH);
    expect(client.rows(DOCS)[0].revision).toBe(3);
    expect(client.count(VERSIONS)).toBe(2);
  });

  it("bulk accepts selected hunks in one document revision and one version", async () => {
    const { client, documentId, proposals } = await proposeBoth();

    const accepted = await acceptDocumentProposals(client, {
      documentId,
      proposalIds: proposals.map((proposal) => proposal.id),
      actorUserId: "u-B",
    });

    expect(accepted.ok).toBe(true);
    expect(client.rows(DOCS)[0].content).toBe(BOTH);
    expect(client.rows(DOCS)[0].revision).toBe(2);
    expect(client.count(VERSIONS)).toBe(1);
    expect(client.rows(VERSIONS)[0].change_hunks).toHaveLength(2);
    expect(client.rows(PROPOSALS).map((row) => row.status)).toEqual(["accepted", "accepted"]);
  });

  it("bulk rejects selected hunks without changing the document or version history", async () => {
    const { client, documentId, proposals } = await proposeBoth();

    const rejected = await rejectDocumentProposals(client, {
      documentId,
      proposalIds: proposals.map((proposal) => proposal.id),
      actorUserId: "u-B",
    });

    expect(rejected.ok).toBe(true);
    expect(client.rows(DOCS)[0].content).toBe(MULTI);
    expect(client.rows(DOCS)[0].revision).toBe(1);
    expect(client.count(VERSIONS)).toBe(0);
    expect(client.rows(PROPOSALS).map((row) => row.status)).toEqual(["rejected", "rejected"]);
  });

  it("rejecting one hunk leaves its sibling acceptable", async () => {
    const { client, documentId, proposals } = await proposeBoth();
    const firstHunk = proposals.find((proposal) => proposal.hunkIndex === 0)!;
    const secondHunk = proposals.find((proposal) => proposal.hunkIndex === 1)!;

    const rejected = await rejectDocumentProposal(client, {
      documentId,
      proposalId: firstHunk.id,
      actorUserId: "u-B",
    });
    expect(rejected.ok).toBe(true);

    const accepted = await acceptDocumentProposal(client, {
      documentId,
      proposalId: secondHunk.id,
      actorUserId: "u-B",
    });
    expect(accepted.ok).toBe(true);
    expect(client.rows(DOCS)[0].content).toContain("old tone");
    expect(client.rows(DOCS)[0].content).toContain("fresh ending");
    expect(client.count(VERSIONS)).toBe(1);
  });

  it("marks overlapping sibling proposals as conflicts", async () => {
    const before = "# Doc\nOld goal.";
    const firstDraft = "# Doc\nFirst accepted goal.";
    const secondDraft = "# Doc\nSecond accepted goal.";
    const { client, documentId } = createFakeClientWithDocument({ content: before });
    setPolicy(client, { human: "propose" });

    const firstProposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "author-A" },
      content: firstDraft,
      expectedRevision: 1,
      summary: "first goal update",
    });
    if (!(firstProposed.ok && firstProposed.outcome === "proposed")) throw new Error("setup failed");

    const secondProposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "author-A" },
      content: secondDraft,
      expectedRevision: 1,
      summary: "second goal update",
    });
    if (!(secondProposed.ok && secondProposed.outcome === "proposed")) throw new Error("setup failed");

    const first = firstProposed.proposals[0];
    const second = secondProposed.proposals[0];

    const acceptedFirst = await acceptDocumentProposal(client, {
      documentId,
      proposalId: first.id,
      actorUserId: "u-B",
    });
    expect(acceptedFirst.ok).toBe(true);
    expect(client.rows(DOCS)[0].content).toContain("First accepted goal.");

    const conflictedSecond = await acceptDocumentProposal(client, {
      documentId,
      proposalId: second.id,
      actorUserId: "u-B",
    });
    expect(conflictedSecond.ok).toBe(false);
    if (!conflictedSecond.ok) expect(conflictedSecond.code).toBe("conflict");
    expect(client.rows(DOCS)[0].content).not.toContain("Second accepted goal.");
    expect(client.rows(DOCS)[0].revision).toBe(2);
    expect(client.rows(PROPOSALS).find((row) => row.id === second.id)?.conflict_status).toBe(
      "conflict"
    );
  });
});
