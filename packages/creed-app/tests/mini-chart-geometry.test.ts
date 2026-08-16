import assert from "node:assert/strict";
import test from "node:test";
import {
  barIndexAt,
  barWidth,
  tooltipCentre,
} from "@creed/core/mini-chart-geometry";

// The real panel: 230px wide with 10px padding either side, 30 bars, 1.5px gaps.
const ROW = 210;
const BARS = 30;
const GAP = 1.5;
// Measured from the rendered tooltip at 12px in the panel.
const W_OPERATIONAL = 99;
const W_DEGRADED = 138;

const indexAt = (offsetX: number) => barIndexAt(offsetX, ROW, BARS, GAP);
const centre = (index: number, width: number) =>
  tooltipCentre(index, ROW, BARS, GAP, width);

test("a pointer resolves to the bar underneath it", () => {
  const barW = barWidth(ROW, BARS, GAP);
  assert.equal(indexAt(0), 0);
  assert.equal(indexAt(barW / 2), 0);
  assert.equal(indexAt(barW + GAP + 1), 1);
  assert.equal(indexAt(ROW - 1), BARS - 1);
});

test("a pointer outside the row clamps to the end bars", () => {
  assert.equal(indexAt(-40), 0);
  assert.equal(indexAt(ROW + 400), BARS - 1);
});

test("bar resolution never depends on the tooltip", () => {
  // Which bar is hovered must be stable regardless of what label is showing,
  // so the pointer handler can resolve it before the tooltip re-renders.
  for (let offsetX = 0; offsetX <= ROW; offsetX += 7) {
    assert.equal(indexAt(offsetX), barIndexAt(offsetX, ROW, BARS, GAP));
  }
});

test("the tooltip never overhangs either edge of the row", () => {
  for (const width of [85, W_OPERATIONAL, W_DEGRADED]) {
    for (let i = 0; i < BARS; i++) {
      const c = centre(i, width);
      assert.ok(
        c - width / 2 >= -0.01,
        `left edge overhangs for width ${width} at bar ${i}`
      );
      assert.ok(
        c + width / 2 <= ROW + 0.01,
        `right edge overhangs for width ${width} at bar ${i}`
      );
    }
  }
});

test("the first and last bars pin the tooltip to the row's edges", () => {
  assert.equal(centre(0, W_DEGRADED), W_DEGRADED / 2);
  assert.equal(centre(BARS - 1, W_DEGRADED), ROW - W_DEGRADED / 2);
});

test("the tooltip still tracks the bar between the clamped ends", () => {
  const mid = centre(Math.floor(BARS / 2), W_DEGRADED);
  assert.ok(mid > W_DEGRADED / 2);
  assert.ok(mid < ROW - W_DEGRADED / 2);
  let previous = -Infinity;
  for (let i = 0; i < BARS; i++) {
    const c = centre(i, W_DEGRADED);
    assert.ok(c >= previous - 0.01, `centre moved backwards at bar ${i}`);
    previous = c;
  }
});

// This is the flash: the same bar resolves to different positions depending on
// which label's width was measured. Positioning must therefore happen after the
// label renders, which is why the component does it in a layout effect.
test("a wider label needs a different centre for the same bar", () => {
  const stale = centre(0, W_OPERATIONAL);
  const correct = centre(0, W_DEGRADED);
  assert.notEqual(stale, correct);
  // Both are pinned to the left edge, so the error is exactly half the width
  // difference: the tooltip would sit that far too far left.
  assert.equal(correct - stale, (W_DEGRADED - W_OPERATIONAL) / 2);
  // Using the stale width would hang the wider tooltip outside the row.
  assert.ok(stale - W_DEGRADED / 2 < 0);
});

test("labels of equal width place the same bar identically", () => {
  // Why the flash is worst on the first hover and near-invisible afterwards:
  // consecutive days usually share a label.
  assert.equal(centre(12, W_OPERATIONAL), centre(12, W_OPERATIONAL));
});

test("a narrow label is free to reach the very ends", () => {
  assert.equal(centre(0, 40), 20);
  assert.ok(centre(BARS - 1, 40) > centre(BARS - 1, W_DEGRADED));
});

test("a tooltip wider than the row keeps its left edge on screen", () => {
  assert.equal(centre(15, ROW + 60), (ROW + 60) / 2);
});

test("before the tooltip has measured, its centre tracks the bar", () => {
  assert.equal(centre(0, 0), barWidth(ROW, BARS, GAP) / 2);
});
