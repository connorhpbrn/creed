"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

// Client-side "is the current user paid?" hook.
//
// Mirrors `useLandingAuthState` in shape (a tiny inline auth listener +
// fetch) so marketing pages keep one consistent client-side data model.
// Result is cached in `sessionStorage` keyed by user id so back-and-forth
// navigation between marketing routes doesn't re-hit /api/stripe/status.
//
// Returns:
//   "unknown" — auth state is still loading or we haven't asked yet.
//   "unpaid" — signed-out, or signed-in without a creed_entitlements row.
//   "paid"   — signed-in with a `status = 'paid'` row.
//
// Signing out invalidates the cache so the next signed-in user starts
// fresh.

export type PaidStatus = "unknown" | "unpaid" | "paid";

const CACHE_PREFIX = "creed:paid-status:";

function readCache(userId: string): PaidStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${CACHE_PREFIX}${userId}`);
    if (raw === "paid" || raw === "unpaid") return raw;
    return null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, status: "paid" | "unpaid") {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${CACHE_PREFIX}${userId}`, status);
  } catch {
    // Storage may be disabled (private mode, quota); fail silently.
  }
}

export function usePaidStatus(configured: boolean = true): PaidStatus {
  const [status, setStatus] = useState<PaidStatus>("unknown");

  useEffect(() => {
    if (!configured) {
      setStatus("unpaid");
      return;
    }

    let active = true;
    const supabase = getSupabaseBrowserClient();

    async function refresh(userId: string | null) {
      if (!userId) {
        if (active) setStatus("unpaid");
        return;
      }
      const cached = readCache(userId);
      if (cached) {
        if (active) setStatus(cached);
        // Don't return — fall through and refresh in the background so a
        // user who just paid sees the green Owned pill within seconds of
        // returning to a marketing page.
      }
      try {
        const res = await fetch("/api/stripe/status", {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) {
          if (active && !cached) setStatus("unpaid");
          return;
        }
        const data = (await res.json()) as { paid?: boolean };
        const next: "paid" | "unpaid" = data.paid ? "paid" : "unpaid";
        writeCache(userId, next);
        if (active) setStatus(next);
      } catch {
        if (active && !cached) setStatus("unpaid");
      }
    }

    // Use `getUser()` (not `getSession()`) for the first read: it actually
    // verifies the access token with Supabase, so a stale cookie from a
    // previous user on a shared browser won't satisfy this check. Reading
    // `getSession()` alone would happily return the cached session and we'd
    // hand whoever's at the keyboard the previous user's paid flag from
    // sessionStorage.
    supabase.auth.getUser().then((result: { data: { user: unknown } }) => {
      const user = result.data.user as { id?: string } | null;
      const userId = user?.id ?? null;
      void refresh(userId);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: unknown, session: unknown) => {
      const s = session as { user?: { id?: string } } | null;
      const userId = s?.user?.id ?? null;
      if (!userId) {
        // Clear ALL paid cache entries on sign-out so a shared browser
        // doesn't show "Owned" to whoever signs in next.
        try {
          if (typeof window !== "undefined") {
            const toClear: string[] = [];
            for (let i = 0; i < window.sessionStorage.length; i += 1) {
              const key = window.sessionStorage.key(i);
              if (key?.startsWith(CACHE_PREFIX)) toClear.push(key);
            }
            for (const key of toClear) window.sessionStorage.removeItem(key);
          }
        } catch {
          // ignore
        }
      }
      void refresh(userId);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [configured]);

  return status;
}
