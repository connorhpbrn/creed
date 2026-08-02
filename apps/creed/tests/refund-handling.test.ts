import test from "node:test";
import assert from "node:assert/strict";
import { isChargeFullyRefunded } from "../lib/stripe-refund.ts";

// The partial-vs-full rule decides whether a `charge.refunded` webhook revokes
// access. Getting it wrong either strands a refunded user with access (too
// lenient) or yanks access on a goodwill partial credit (too aggressive), so
// it's pinned here.

test("full refund via the `refunded` flag revokes", () => {
  assert.equal(
    isChargeFullyRefunded({ refunded: true, amount: 4900, amount_refunded: 4900 }),
    true
  );
});

test("full refund inferred from amounts when flag is absent", () => {
  assert.equal(
    isChargeFullyRefunded({ amount: 4900, amount_refunded: 4900 }),
    true
  );
});

test("over-refund (amount_refunded > amount) still counts as full", () => {
  assert.equal(
    isChargeFullyRefunded({ amount: 4900, amount_refunded: 5000 }),
    true
  );
});

test("partial refund does NOT revoke", () => {
  assert.equal(
    isChargeFullyRefunded({ refunded: false, amount: 4900, amount_refunded: 1000 }),
    false
  );
});

test("no refund at all does NOT revoke", () => {
  assert.equal(
    isChargeFullyRefunded({ refunded: false, amount: 4900, amount_refunded: 0 }),
    false
  );
});

test("zero-amount charge never counts as fully refunded via amounts", () => {
  // Guards the `amount > 0` clause: a $0 charge with $0 refunded must not be
  // read as "fully refunded" by the amount comparison alone.
  assert.equal(isChargeFullyRefunded({ amount: 0, amount_refunded: 0 }), false);
});

test("missing amount fields are treated as no refund", () => {
  assert.equal(isChargeFullyRefunded({}), false);
});
