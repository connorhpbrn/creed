import test from "node:test";
import assert from "node:assert/strict";
import { groupTasksIntoColumns } from "../lib/marketing/roadmap.ts";

// groupTasksIntoColumns folds the median board's six phases into the three
// public columns and orders each. The folding (ready+todo -> Next), the silent
// dropping of non-public phases, the bad-row guarding, the two-key sort, and the
// trimming of internal sort keys off the public shape are all non-obvious, so
// they're pinned here.

test("ready and todo both fold into the Next column", () => {
  const [next, inProgress, shipped] = groupTasksIntoColumns([
    { id: "1", title: "A", phase: "todo" },
    { id: "2", title: "B", phase: "ready" },
  ]);
  assert.equal(next.id, "next");
  assert.deepEqual(
    next.tasks.map((t) => t.id),
    ["1", "2"],
  );
  assert.equal(inProgress.tasks.length, 0);
  assert.equal(shipped.tasks.length, 0);
});

test("in_progress and shipped map to their own columns", () => {
  const cols = groupTasksIntoColumns([
    { id: "1", title: "A", phase: "in_progress" },
    { id: "2", title: "B", phase: "shipped" },
  ]);
  const byId = Object.fromEntries(cols.map((c) => [c.id, c]));
  assert.deepEqual(
    byId.in_progress.tasks.map((t) => t.id),
    ["1"],
  );
  assert.deepEqual(
    byId.shipped.tasks.map((t) => t.id),
    ["2"],
  );
});

test("requests, archive, and unknown phases are dropped", () => {
  const cols = groupTasksIntoColumns([
    { id: "1", title: "Raw", phase: "requests" },
    { id: "2", title: "Old", phase: "archive" },
    { id: "3", title: "Huh", phase: "backlog" },
  ]);
  assert.equal(
    cols.reduce((n, c) => n + c.tasks.length, 0),
    0,
  );
});

test("rows missing a title or phase are skipped", () => {
  const cols = groupTasksIntoColumns([
    { id: "1", phase: "todo" }, // no title
    { id: "2", title: "   ", phase: "todo" }, // blank title
    { id: "3", title: "Real" }, // no phase
    { id: "4", title: "Keep", phase: "todo" },
  ]);
  const next = cols.find((c) => c.id === "next");
  assert.ok(next);
  assert.deepEqual(
    next.tasks.map((t) => t.id),
    ["4"],
  );
});

test("within a column, sort is order asc then taskNumber desc", () => {
  const next = groupTasksIntoColumns([
    { id: "a", title: "A", phase: "todo", order: 2, taskNumber: 1 },
    { id: "b", title: "B", phase: "todo", order: 1, taskNumber: 5 },
    { id: "c", title: "C", phase: "todo", order: 1, taskNumber: 9 },
  ]).find((c) => c.id === "next");
  assert.ok(next);
  // order 1 before order 2; within order 1, higher taskNumber first.
  assert.deepEqual(
    next.tasks.map((t) => t.id),
    ["c", "b", "a"],
  );
});

test("internal sort keys never leak into the public task shape", () => {
  const [next] = groupTasksIntoColumns([
    { id: "1", title: "A", phase: "todo", order: 3, taskNumber: 7 },
  ]);
  assert.deepEqual(Object.keys(next.tasks[0]).sort(), [
    "description",
    "id",
    "labels",
    "title",
  ]);
});

test("empty or non-array input yields three empty columns", () => {
  for (const input of [[], null, undefined, "nope", 42]) {
    const cols = groupTasksIntoColumns(input);
    assert.deepEqual(
      cols.map((c) => c.id),
      ["next", "in_progress", "shipped"],
    );
    assert.equal(
      cols.reduce((n, c) => n + c.tasks.length, 0),
      0,
    );
  }
});

test("malformed fields fall back safely (missing id, non-array labels)", () => {
  const [next] = groupTasksIntoColumns([
    { title: "No id", phase: "todo", labels: "not-an-array" },
  ]);
  const task = next.tasks[0];
  assert.deepEqual(task.labels, []);
  // id falls back to `${phase}-${title}` when id is absent.
  assert.equal(task.id, "todo-No id");
});
