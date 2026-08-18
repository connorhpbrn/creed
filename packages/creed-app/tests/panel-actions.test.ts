import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePanelAnswerReferences,
  validatePanelActions,
  validatePanelReferences,
} from "../lib/panel/actions.ts";

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

test("answer references are recovered from tokens and phantom tokens never leak", () => {
  const sections = [{ id: "goals", name: "Goals", accent: "green", content: "" }];
  assert.deepEqual(
    resolvePanelAnswerReferences("See [[section:goals]] and [[section:phantom]].", [], sections),
    {
      answer: "See [[section:goals]] and that section.",
      references: [{ id: "goals", name: "Goals", accent: "green" }],
    },
  );
});

test("a canonical multi-word section name becomes a reference chip token", () => {
  const sections = [
    { id: "product-judgment", name: "Product Judgment", accent: "red", content: "" },
  ];
  assert.deepEqual(
    resolvePanelAnswerReferences(
      "Your strongest section is probably **Product Judgment**. It captures how you think.",
      [],
      sections,
    ),
    {
      answer:
        "Your strongest section is probably [[section:product-judgment]]. It captures how you think.",
      references: [
        { id: "product-judgment", name: "Product Judgment", accent: "red" },
      ],
    },
  );
});

test("Creed hashtag syntax resolves through the same section identity rules", () => {
  const sections = [
    { id: "product-judgment", name: "Product Judgment", accent: "red", content: "" },
  ];
  assert.deepEqual(
    resolvePanelAnswerReferences("Read #product-judgment next.", ["product-judgment"], sections),
    {
      answer: "Read [[section:product-judgment]] next.",
      references: [
        { id: "product-judgment", name: "Product Judgment", accent: "red" },
      ],
    },
  );
});

test("bold Creed hashtags still resolve as section chips", () => {
  const sections = [{ id: "identity", name: "Identity", accent: "red", content: "" }];
  assert.deepEqual(
    resolvePanelAnswerReferences("Start with **#identity**: it defines you.", [], sections),
    {
      answer: "Start with [[section:identity]]: it defines you.",
      references: [{ id: "identity", name: "Identity", accent: "red" }],
    },
  );
  assert.deepEqual(
    resolvePanelAnswerReferences("Start with **#identity:** it defines you.", [], sections).answer,
    "Start with [[section:identity]]: it defines you.",
  );
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

test("section references resolve to canonical readable sections", () => {
  const sections = [
    { id: "identity", name: "Identity", accent: "red", content: "" },
    { id: "goals", name: "My Goals", accent: "green", content: "" },
  ];
  assert.deepEqual(validatePanelReferences(["goals", "phantom", "goals", "identity"], sections), [
    { id: "goals", name: "My Goals", accent: "green" },
    { id: "identity", name: "Identity", accent: "red" },
  ]);
  assert.deepEqual(validatePanelReferences("goals", sections), []);
  assert.deepEqual(validatePanelReferences(Array(9).fill("goals"), sections), []);
});
