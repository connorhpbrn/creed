import assert from "node:assert/strict";
import test from "node:test";
import { createEditorPublishScheduler } from "../lib/editor-publish-scheduler.ts";

test("bursts publish once at the trailing edge", async () => {
  let publishes = 0;
  const scheduler = createEditorPublishScheduler(() => publishes += 1, {
    delayMs: 15,
    maxWaitMs: 100,
  });
  scheduler.schedule();
  scheduler.schedule();
  scheduler.schedule();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(publishes, 1);
});

test("continuous input publishes by the maximum wait", async () => {
  let publishes = 0;
  const scheduler = createEditorPublishScheduler(() => publishes += 1, {
    delayMs: 30,
    maxWaitMs: 45,
  });
  scheduler.schedule();
  await new Promise((resolve) => setTimeout(resolve, 20));
  scheduler.schedule();
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(publishes, 1);
});

test("flush publishes immediately and cancel drops pending work", () => {
  let publishes = 0;
  const scheduler = createEditorPublishScheduler(() => publishes += 1);
  scheduler.schedule();
  scheduler.flush();
  scheduler.flush();
  assert.equal(publishes, 1);
  scheduler.schedule();
  scheduler.cancel();
  assert.equal(publishes, 1);
});
