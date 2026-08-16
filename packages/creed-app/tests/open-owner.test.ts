import assert from "node:assert/strict";
import test from "node:test";
import {
  createOpenOwnerCookieValue,
  deriveOpenOwnerSupabasePassword,
  safelyEqual,
  verifyOpenOwnerCookieValue,
} from "../../creed-open/lib/open-owner-core.ts";

const firstSecret = "first-owner-secret-with-more-than-thirty-two-characters";
const rotatedSecret = "rotated-owner-secret-with-more-than-thirty-two-chars";
const now = 1_800_000_000_000;

test("owner cookie accepts the current secret before expiry", () => {
  const value = createOpenOwnerCookieValue(firstSecret, now + 60_000);
  assert.equal(verifyOpenOwnerCookieValue(value, firstSecret, now), true);
});

test("owner secret rotation invalidates an existing cookie", () => {
  const value = createOpenOwnerCookieValue(firstSecret, now + 60_000);
  assert.equal(verifyOpenOwnerCookieValue(value, rotatedSecret, now), false);
});

test("owner cookies fail closed after expiry or when malformed", () => {
  const expired = createOpenOwnerCookieValue(firstSecret, now - 1);
  assert.equal(verifyOpenOwnerCookieValue(expired, firstSecret, now), false);
  assert.equal(verifyOpenOwnerCookieValue("v1.invalid.value", firstSecret, now), false);
  assert.equal(verifyOpenOwnerCookieValue("", firstSecret, now), false);
});

test("owner comparison and derived login do not expose the source secret", () => {
  assert.equal(safelyEqual(firstSecret, firstSecret), true);
  assert.equal(safelyEqual(firstSecret, rotatedSecret), false);
  const password = deriveOpenOwnerSupabasePassword(firstSecret);
  assert.notEqual(password, firstSecret);
  assert.equal(password, deriveOpenOwnerSupabasePassword(firstSecret));
});
