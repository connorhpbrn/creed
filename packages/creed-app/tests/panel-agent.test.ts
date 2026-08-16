import test from "node:test";
import assert from "node:assert/strict";
import {
  validateAgentActions,
  validateAgentPlan,
  validateAgentSemantics,
  buildAgentPlanningPrompt,
  buildAgentUserPrompt,
  buildAgentRepairPrompt,
  agentRequestUsesAnalysis,
  AGENT_ACCENT_KEYS,
} from "../lib/panel/agent.ts";

// The Agent validator is the safety boundary for the in-app Creed agent: it
// enforces every rule the MCP proposals API enforces (target existence, accent
// validity, reorder XOR anchor) plus the app's own guardrails. Whole-plan-or-
// nothing, and no action outside the fixed set survives.

const KNOWN = {
  sectionIds: new Set(["identity", "goals", "work"]),
  archivedIds: new Set(["old"]),
};

const base = {
  kind: "",
  sectionId: "",
  name: "",
  accent: "",
  content: "",
  permission: "",
  position: "",
  afterSectionId: "",
  reason: "r",
};
const act = (over: Record<string, string>) => ({ ...base, ...over });

test("a multi-section edit plan passes through typed", () => {
  const actions = validateAgentActions(
    [
      act({ kind: "edit", sectionId: "work", content: "New body" }),
      act({ kind: "recolor-section", sectionId: "goals", accent: "stack" }),
    ],
    KNOWN
  );
  assert.equal(actions?.length, 2);
  assert.equal(actions?.[0].kind, "edit");
  assert.equal(actions?.[1].kind, "recolor-section");
});

test("unknown kinds reject the whole plan", () => {
  assert.equal(validateAgentActions([act({ kind: "nuke", sectionId: "work" })], KNOWN), null);
  assert.equal(
    validateAgentActions([act({ kind: "edit", sectionId: "work", content: "x" }), act({ kind: "boom" })], KNOWN),
    null
  );
});

test("edit requires an existing section and non-empty content", () => {
  assert.equal(validateAgentActions([act({ kind: "edit", sectionId: "ghost", content: "x" })], KNOWN), null);
  assert.equal(validateAgentActions([act({ kind: "edit", sectionId: "work", content: "   " })], KNOWN), null);
});

test("recolor accent must be a real accent key", () => {
  assert.equal(validateAgentActions([act({ kind: "recolor-section", sectionId: "work", accent: "turquoise" })], KNOWN), null);
  assert.ok(validateAgentActions([act({ kind: "recolor-section", sectionId: "work", accent: AGENT_ACCENT_KEYS[0] })], KNOWN));
});

test("rename needs a non-empty name under the cap", () => {
  assert.equal(validateAgentActions([act({ kind: "rename-section", sectionId: "work", name: "" })], KNOWN), null);
  assert.equal(validateAgentActions([act({ kind: "rename-section", sectionId: "work", name: "x".repeat(61) })], KNOWN), null);
  assert.ok(validateAgentActions([act({ kind: "rename-section", sectionId: "work", name: "Craft" })], KNOWN));
});

test("reorder requires exactly one of position / afterSectionId, and a real, non-self anchor", () => {
  // neither
  assert.equal(validateAgentActions([act({ kind: "reorder-section", sectionId: "work" })], KNOWN), null);
  // both
  assert.equal(
    validateAgentActions([act({ kind: "reorder-section", sectionId: "work", position: "first", afterSectionId: "goals" })], KNOWN),
    null
  );
  // self-anchor
  assert.equal(
    validateAgentActions([act({ kind: "reorder-section", sectionId: "work", afterSectionId: "work" })], KNOWN),
    null
  );
  // phantom anchor
  assert.equal(
    validateAgentActions([act({ kind: "reorder-section", sectionId: "work", afterSectionId: "ghost" })], KNOWN),
    null
  );
  assert.ok(validateAgentActions([act({ kind: "reorder-section", sectionId: "work", position: "last" })], KNOWN));
  assert.ok(validateAgentActions([act({ kind: "reorder-section", sectionId: "work", afterSectionId: "goals" })], KNOWN));
});

test("restore targets the archived namespace, not the live one", () => {
  assert.equal(validateAgentActions([act({ kind: "restore-section", sectionId: "work" })], KNOWN), null);
  assert.ok(validateAgentActions([act({ kind: "restore-section", sectionId: "old" })], KNOWN));
});

test("set-permission accepts the three settable permissions, not hidden or junk", () => {
  for (const permission of ["read-only", "propose", "direct"]) {
    assert.ok(
      validateAgentActions([act({ kind: "set-permission", sectionId: "work", permission })], KNOWN),
      `${permission} should be accepted`
    );
  }
  // "hidden" is a real AgentPermission but re-hiding is a UI-only action; the
  // agent must not be able to set it, so it's rejected like any junk value.
  assert.equal(validateAgentActions([act({ kind: "set-permission", sectionId: "work", permission: "hidden" })], KNOWN), null);
  assert.equal(validateAgentActions([act({ kind: "set-permission", sectionId: "work", permission: "owner" })], KNOWN), null);
});

test("new-section needs a name; accent is optional but validated when present", () => {
  assert.equal(validateAgentActions([act({ kind: "new-section", name: "" })], KNOWN), null);
  assert.equal(validateAgentActions([act({ kind: "new-section", name: "Health", accent: "bogus" })], KNOWN), null);
  assert.ok(validateAgentActions([act({ kind: "new-section", name: "Health", content: "notes" })], KNOWN));
});

test("empty and oversized plans reject", () => {
  assert.equal(validateAgentActions([], KNOWN), null);
  assert.equal(validateAgentActions("edit", KNOWN), null);
  assert.equal(
    validateAgentActions(Array.from({ length: 9 }, () => act({ kind: "archive-section", sectionId: "work" })), KNOWN),
    null
  );
});

const SECTIONS = [
  { id: "identity", name: "Identity", content: "Identity body", agentPermission: "propose" as const },
  { id: "work", name: "Work", content: "Work body", agentPermission: "direct" as const },
];

test("target planning sees a compact catalog instead of every complete section", () => {
  const long = "private detail ".repeat(200);
  const prompt = buildAgentPlanningPrompt({
    query: "fix work",
    sections: [{ ...SECTIONS[1], content: long }],
    archived: [],
    mentioned: ["work"],
  });
  assert.ok(prompt.length < long.length);
  assert.match(prompt, /\[work \| direct\] Work/);
});

test("drafting includes the complete selected section and excludes untargeted bodies", () => {
  const long = `start\n${"x".repeat(9_000)}\nend-marker`;
  const prompt = buildAgentUserPrompt({
    query: "fix work",
    sections: [{ ...SECTIONS[0], content: "do-not-send" }, { ...SECTIONS[1], content: long }],
    archived: [],
    mentioned: ["work"],
    plan: { ok: true, reason: "", summary: "", targetSectionIds: ["work"], needsContentDraft: true, instructions: "Correct Work." },
  });
  assert.match(prompt, /end-marker/);
  assert.match(prompt, /\[section id: identity\] Identity/);
  assert.doesNotMatch(prompt, /do-not-send/);
});

test("target plans reject phantom sections and deduplicate valid targets", () => {
  const valid = validateAgentPlan({ ok: true, reason: "", summary: "", targetSectionIds: ["work", "work"], needsContentDraft: true, instructions: "Edit Work" }, KNOWN);
  assert.deepEqual(valid?.targetSectionIds, ["work"]);
  assert.equal(validateAgentPlan({ ok: true, reason: "", summary: "", targetSectionIds: ["ghost"], needsContentDraft: true, instructions: "Edit it" }, KNOWN), null);
});

test("semantic guard rejects accidental destructive shortening but permits explicit condensation", () => {
  const original = "Useful context. ".repeat(100);
  const actions = [{ kind: "edit" as const, sectionId: "work", content: "Tiny replacement", reason: "Edited" }];
  const sections = [{ id: "work", name: "Work", content: original }];
  assert.match(validateAgentSemantics(actions, sections, "fix one typo") ?? "", /removes too much/);
  assert.equal(validateAgentSemantics(actions, sections, "shorten this section"), null);
});

test("semantic guard prevents duplicate section names", () => {
  const error = validateAgentSemantics(
    [{ kind: "new-section", name: "Identity", content: "", reason: "Added" }],
    SECTIONS,
    "add identity"
  );
  assert.match(error ?? "", /already exists/);
});

test("Analysis context is requested only for improvement-style work", () => {
  assert.equal(agentRequestUsesAnalysis("make Work clearer and more actionable"), true);
  assert.equal(agentRequestUsesAnalysis("move Work after Goals"), false);
});

test("repair prompt carries the exact failure and previous response", () => {
  const prompt = buildAgentRepairPrompt({ content: "{bad", error: "actions must be an array" });
  assert.match(prompt, /actions must be an array/);
  assert.match(prompt, /\{bad/);
});
