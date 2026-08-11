import "server-only";

import { cookies } from "next/headers";
import {
  createOpenOwnerCookieValue,
  deriveOpenOwnerSupabasePassword,
  OPEN_OWNER_MINIMUM_SECRET_LENGTH,
  safelyEqual,
  verifyOpenOwnerCookieValue,
} from "@creed/open/lib/open-owner-core";

export const OPEN_OWNER_COOKIE = "creed_open_owner";
export const OPEN_OWNER_EMAIL = "owner@creed.open.invalid";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function ownerSecret() {
  return process.env.CREED_OWNER_SECRET?.trim() ?? "";
}

export function getOpenOwnerConfigurationError() {
  const secret = ownerSecret();
  if (!secret) {
    return "CREED_OWNER_SECRET is missing.";
  }
  if (secret.length < OPEN_OWNER_MINIMUM_SECRET_LENGTH) {
    return `CREED_OWNER_SECRET must be at least ${OPEN_OWNER_MINIMUM_SECRET_LENGTH} characters.`;
  }
  return null;
}

export function verifyOpenOwnerSecret(candidate: string) {
  const secret = ownerSecret();
  return (
    !getOpenOwnerConfigurationError() &&
    safelyEqual(candidate.trim(), secret)
  );
}

export function deriveOpenOwnerPassword() {
  const secret = ownerSecret();
  if (getOpenOwnerConfigurationError() || !secret) {
    throw new Error("Creed Open owner access is not configured.");
  }
  return deriveOpenOwnerSupabasePassword(secret);
}

export async function hasValidOpenOwnerSession() {
  if (getOpenOwnerConfigurationError()) return false;

  const cookieStore = await cookies();
  const value = cookieStore.get(OPEN_OWNER_COOKIE)?.value;
  if (!value) return false;

  return verifyOpenOwnerCookieValue(value, ownerSecret());
}

export async function setOpenOwnerSessionCookie() {
  const cookieStore = await cookies();
  const expiresAt = Date.now() + COOKIE_MAX_AGE_SECONDS * 1000;
  cookieStore.set(
    OPEN_OWNER_COOKIE,
    createOpenOwnerCookieValue(ownerSecret(), expiresAt),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    },
  );
}

export async function clearOpenOwnerSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(OPEN_OWNER_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
