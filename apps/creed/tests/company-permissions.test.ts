// Pure-function tests for the Company permission lattice + attribution.
//
//   node --test --experimental-strip-types tests/company-permissions.test.ts
//
// on Node 22+, or `npx tsx --test tests/company-permissions.test.ts` on Node 20.
// Scoped to pure functions: no Supabase, no fetch, no running server.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  resolveSectionPermission,
  canViewSection,
  canDirectEditSection,
  canProposeToSection,
  canApproveProposal,
  canManageMembers,
  canManageBilling,
  canRunAnalysis,
  effectiveAgentPermission,
  minPermission,
  deriveCompanyAccessState,
  companyIsWritable,
} from "../lib/creed-permissions.ts";
import { possessive, actorLabel } from "../lib/creed-attribution.ts";

test("resolveSectionPermission: owner/admin are always direct", () => {
  assert.equal(resolveSectionPermission("owner", "hidden"), "direct");
  assert.equal(resolveSectionPermission("admin", "read-only"), "direct");
  assert.equal(resolveSectionPermission("owner", null), "direct");
});

test("resolveSectionPermission: members default to direct, else their override", () => {
  assert.equal(resolveSectionPermission("member", null), "direct");
  assert.equal(resolveSectionPermission("member", undefined), "direct");
  assert.equal(resolveSectionPermission("member", "hidden"), "hidden");
  assert.equal(resolveSectionPermission("member", "read-only"), "read-only");
  assert.equal(resolveSectionPermission("member", "propose"), "propose");
});

test("section capability predicates", () => {
  assert.equal(canViewSection("hidden"), false);
  assert.equal(canViewSection("read-only"), true);
  assert.equal(canDirectEditSection("direct"), true);
  assert.equal(canDirectEditSection("propose"), false);
  assert.equal(canProposeToSection("propose"), true);
  assert.equal(canProposeToSection("direct"), true);
  assert.equal(canProposeToSection("read-only"), false);
});

test("canApproveProposal: owner/admin anywhere, member only where direct", () => {
  assert.equal(canApproveProposal("owner", "read-only"), true);
  assert.equal(canApproveProposal("admin", "propose"), true);
  assert.equal(canApproveProposal("member", "direct"), true);
  assert.equal(canApproveProposal("member", "propose"), false);
  assert.equal(canApproveProposal("member", "read-only"), false);
});

test("role gates", () => {
  assert.equal(canManageMembers("owner"), true);
  assert.equal(canManageMembers("admin"), true);
  assert.equal(canManageMembers("member"), false);
  assert.equal(canManageBilling("owner"), true);
  assert.equal(canManageBilling("admin"), false);
});

test("canRunAnalysis: company analysis is owner/admin only", () => {
  assert.equal(canRunAnalysis("owner"), true);
  assert.equal(canRunAnalysis("admin"), true);
  assert.equal(canRunAnalysis("member"), false);
});

test("effectiveAgentPermission: min of member permission and agent mode", () => {
  // Spec ceiling tests.
  // Member has Direct, agent set to Proposal-only -> can only propose.
  assert.equal(effectiveAgentPermission("direct", "proposal-only"), "propose");
  // Member has Read-only, agent set to Direct-where-allowed -> still read only.
  assert.equal(effectiveAgentPermission("read-only", "direct"), "read-only");
  // Member Hidden -> nothing regardless of mode.
  assert.equal(effectiveAgentPermission("hidden", "direct"), "hidden");
  // Both direct -> direct.
  assert.equal(effectiveAgentPermission("direct", "direct"), "direct");
  // Member propose, agent read-only -> read-only.
  assert.equal(effectiveAgentPermission("propose", "read-only"), "read-only");
});

test("minPermission: returns the weaker of two lattice permissions", () => {
  // Owner/admin ceiling (direct) capped by the member's own agent ceiling.
  assert.equal(minPermission("direct", "propose"), "propose");
  assert.equal(minPermission("propose", "direct"), "propose");
  // A read-only member ceiling wins over any agent choice.
  assert.equal(minPermission("read-only", "direct"), "read-only");
  // Hidden on either side hides.
  assert.equal(minPermission("hidden", "direct"), "hidden");
  assert.equal(minPermission("direct", "hidden"), "hidden");
  // Equal inputs are returned unchanged.
  assert.equal(minPermission("direct", "direct"), "direct");
  assert.equal(minPermission("read-only", "read-only"), "read-only");
});

test("deriveCompanyAccessState + companyIsWritable", () => {
  assert.equal(deriveCompanyAccessState("paid"), "active");
  assert.equal(deriveCompanyAccessState("active"), "active");
  assert.equal(deriveCompanyAccessState("trialing"), "active");
  assert.equal(deriveCompanyAccessState("past_due"), "past_due");
  assert.equal(deriveCompanyAccessState("canceled"), "frozen");
  assert.equal(deriveCompanyAccessState("refunded"), "frozen");
  assert.equal(deriveCompanyAccessState("incomplete"), "frozen");
  assert.equal(deriveCompanyAccessState(null), "frozen");

  assert.equal(companyIsWritable("active"), true);
  assert.equal(companyIsWritable("past_due"), true);
  assert.equal(companyIsWritable("frozen"), false);
});

test("attribution: manual, MCP agent, panel agent", () => {
  assert.equal(possessive("Fergus"), "Fergus's");
  assert.equal(
    actorLabel({ actorType: "user", userName: "Fergus" }),
    "Fergus"
  );
  assert.equal(
    actorLabel({ actorType: "agent", userName: "Fergus", agentName: "Claude Code" }),
    "Fergus's Claude Code"
  );
  assert.equal(
    actorLabel({ actorType: "agent", userName: "Fergus", agentName: "Creed" }),
    "Fergus's Creed"
  );
  // Never a vague standalone when the member is unknown: fall back to the agent.
  assert.equal(
    actorLabel({ actorType: "agent", userName: null, agentName: "Codex" }),
    "Codex"
  );
  assert.equal(actorLabel({ actorType: "user", userName: null }), "Someone");
});
