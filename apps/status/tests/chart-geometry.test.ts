import assert from "node:assert/strict";
import test from "node:test";
import { barIndexAt, barWidth, tooltipCentre } from "../lib/chart-geometry";

// A card's chart at desktop width: 90 days, 2px gaps.
const ROW = 552;
const BARS = 90;
const GAP = 2;
// Measured from the rendered tooltip at 12px on the status page.
const W_NO_DATA = 85;
const W_OPERATIONAL = 99;
const W_DEGRADED = 138;

const indexAt = (offsetX: number, rowWidth = ROW) =>
  barIndexAt(offsetX, rowWidth, BARS, GAP);
const centre = (index: number, width: number, rowWidth = ROW) =>
  tooltipCentre(index, rowWidth, BARS, GAP, width);

test("a pointer resolves to the bar underneath it", () => {
  const barW = barWidth(ROW, BARS, GAP);
  assert.equal(indexAt(0), 0);
  assert.equal(indexAt(barW / 2), 0);
  assert.equal(indexAt(barW + GAP + 0.5), 1);
  assert.equal(indexAt(ROW - 1), BARS - 1);
});

test("a pointer outside the row clamps to the end bars", () => {
  assert.equal(indexAt(-80), 0);
  assert.equal(indexAt(ROW + 800), BARS - 1);
});

test("the tooltip never overhangs either edge of the chart", () => {
  for (const width of [W_NO_DATA, W_OPERATIONAL, W_DEGRADED]) {
    for (let i = 0; i < BARS; i++) {
      const c = centre(i, width);
      assert.ok(c - width / 2 >= -0.01, `left overhang, width ${width}, bar ${i}`);
      assert.ok(
        c + width / 2 <= ROW + 0.01,
        `right overhang, width ${width}, bar ${i}`
      );
    }
  }
});

test("the end bars pin the tooltip to the chart's edges", () => {
  assert.equal(centre(0, W_DEGRADED), W_DEGRADED / 2);
  assert.equal(centre(BARS - 1, W_DEGRADED), ROW - W_DEGRADED / 2);
});

test("the tooltip tracks the bar between the clamped ends", () => {
  let previous = -Infinity;
  for (let i = 0; i < BARS; i++) {
    const c = centre(i, W_OPERATIONAL);
    assert.ok(c >= previous - 0.01, `centre moved backwards at bar ${i}`);
    previous = c;
  }
  const mid = centre(45, W_OPERATIONAL);
  assert.ok(mid > W_OPERATIONAL / 2 && mid < ROW - W_OPERATIONAL / 2);
});

// The flash: the same bar resolves to a different position depending on which
// label's width was measured, so positioning must happen after the label
// renders. Hence the component positions in a layout effect.
test("a wider label needs a different centre for the same bar", () => {
  const stale = centre(0, W_OPERATIONAL);
  const correct = centre(0, W_DEGRADED);
  assert.equal(correct - stale, (W_DEGRADED - W_OPERATIONAL) / 2);
  // Positioning a degraded label with an operational label's width would hang
  // it outside the chart.
  assert.ok(stale - W_DEGRADED / 2 < 0);
});

// A row that has not been laid out yet reports zero width. The clamp must not
// invert and push the tooltip to the left of the chart.
test("a row with no width yet never yields a negative centre", () => {
  for (const width of [0, W_NO_DATA, W_OPERATIONAL, W_DEGRADED]) {
    assert.ok(
      centre(0, width, 0) >= 0,
      `negative centre for width ${width} in a zero-width row`
    );
  }
  assert.equal(centre(0, W_OPERATIONAL, 0), W_OPERATIONAL / 2);
});

test("a tooltip wider than the chart keeps its left edge visible", () => {
  assert.equal(centre(10, ROW + 40), (ROW + 40) / 2);
});

test("before the tooltip has measured, its centre tracks the bar", () => {
  assert.equal(centre(0, 0), barWidth(ROW, BARS, GAP) / 2);
});
