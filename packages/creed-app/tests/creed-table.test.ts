import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  tableAxisFromRect,
  tableRowIsEmpty,
} from "../components/creed/extensions/creed-table.ts";

const threeByThree = { width: 3, height: 3 };

test("tableAxisFromRect: full table is a table delete", () => {
  assert.equal(
    tableAxisFromRect(
      { left: 0, right: 3, top: 0, bottom: 3 },
      threeByThree,
      true,
    ),
    "table",
  );
});

test("tableAxisFromRect: full column including header is a column delete", () => {
  assert.equal(
    tableAxisFromRect(
      { left: 2, right: 3, top: 0, bottom: 3 },
      threeByThree,
      true,
    ),
    "column",
  );
});

test("tableAxisFromRect: body-only column in a 3-row header table is a column delete", () => {
  assert.equal(
    tableAxisFromRect(
      { left: 0, right: 1, top: 1, bottom: 3 },
      threeByThree,
      true,
    ),
    "column",
  );
});

test("tableAxisFromRect: one-column body row is still a row delete", () => {
  assert.equal(
    tableAxisFromRect(
      { left: 0, right: 1, top: 1, bottom: 2 },
      { width: 1, height: 3 },
      true,
    ),
    "row",
  );
});

test("tableAxisFromRect: one body cell is not an axis", () => {
  assert.equal(
    tableAxisFromRect(
      { left: 0, right: 1, top: 1, bottom: 2 },
      threeByThree,
      true,
    ),
    null,
  );
});

test("tableAxisFromRect: full header row is a row delete", () => {
  assert.equal(
    tableAxisFromRect(
      { left: 0, right: 3, top: 0, bottom: 1 },
      threeByThree,
      true,
    ),
    "row",
  );
});

test("tableAxisFromRect: both body rows are a row delete, not the table", () => {
  assert.equal(
    tableAxisFromRect(
      { left: 0, right: 3, top: 1, bottom: 3 },
      threeByThree,
      true,
    ),
    "row",
  );
});

test("tableAxisFromRect: two of three cells in a row is not an axis", () => {
  assert.equal(
    tableAxisFromRect(
      { left: 0, right: 2, top: 0, bottom: 1 },
      threeByThree,
      true,
    ),
    null,
  );
});

test("tableAxisFromRect: no-header table still deletes a full column", () => {
  assert.equal(
    tableAxisFromRect(
      { left: 1, right: 2, top: 0, bottom: 3 },
      threeByThree,
      false,
    ),
    "column",
  );
});

test("tableRowIsEmpty: trims whitespace-only cells", () => {
  const empty = {
    forEach(fn: (cell: { textContent: string }) => void) {
      fn({ textContent: "  " });
      fn({ textContent: "\n" });
    },
  };
  const filled = {
    forEach(fn: (cell: { textContent: string }) => void) {
      fn({ textContent: "  " });
      fn({ textContent: "vv" });
    },
  };
  assert.equal(tableRowIsEmpty(empty as never), true);
  assert.equal(tableRowIsEmpty(filled as never), false);
});
