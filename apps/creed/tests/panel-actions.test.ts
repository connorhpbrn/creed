import test from "node:test";
import assert from "node:assert/strict";
import { validatePanelActions } from "../lib/panel/actions.ts";

// The navigator validator (Search + Ask). It is read/navigate only: it must
// never surface a mutation kind, must reject phantom targets, and fails a whole
// plan on any bad step so the panel never lands half-right.

const KNOWN = {
  sectionIds: new Set(["identity", "goals"]),
  proposalIds: new Set(["prop-1"]),
};

const action = (kind: string, target = "", value = "") => ({ kind, target, value });

test("a well-formed navigation plan passes through typed", () => {
  const actions = validatePanelActions(
    [action("usage-mode", "", "byok"), action("usage-range", "", "30d")],
    KNOWN
  );
  assert.deepEqual(actions, [
    { kind: "usage-mode", value: "byok" },
    { kind: "usage-range", value: "30d" },
  ]);
});

test("mutation kinds are NOT in the navigator vocabulary", () => {
  for (const kind of ["edit", "delete-section", "archive-section", "rename-section", "set-permission", "propose-edit"]) {
    assert.equal(validatePanelActions([action(kind, "goals")], KNOWN), null, kind);
  }
});

test("copy-creed, compose-section, open-push, toggle-theme need no target", () => {
  assert.deepEqual(validatePanelActions([action("copy-creed")], KNOWN), [{ kind: "copy-creed" }]);
  assert.deepEqual(validatePanelActions([action("compose-section")], KNOWN), [{ kind: "compose-section" }]);
});

test("targets must exist across the right namespace", () => {
  assert.equal(validatePanelActions([action("file-section", "phantom")], KNOWN), null);
  assert.equal(validatePanelActions([action("file-proposal", "goals")], KNOWN), null);
  assert.deepEqual(validatePanelActions([action("file-proposal", "prop-1")], KNOWN), [
    { kind: "file-proposal", target: "prop-1" },
  ]);
});

test("enum-valued actions reject junk values", () => {
  assert.equal(validatePanelActions([action("usage-range", "", "yearly")], KNOWN), null);
  assert.equal(validatePanelActions([action("open-dialog", "settings")], KNOWN), null);
  assert.equal(validatePanelActions([action("navigate", "/dashboard")], KNOWN), null);
});

test("empty, oversized, and non-array plans reject", () => {
  assert.equal(validatePanelActions([], KNOWN), null);
  assert.equal(validatePanelActions("navigate", KNOWN), null);
  assert.equal(
    validatePanelActions(Array.from({ length: 6 }, () => action("toggle-theme")), KNOWN),
    null
  );
});
