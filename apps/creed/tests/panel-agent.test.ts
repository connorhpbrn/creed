import test from "node:test";
import assert from "node:assert/strict";
import { validateAgentActions, AGENT_ACCENT_KEYS } from "../lib/panel/agent.ts";

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
