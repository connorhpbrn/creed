"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

// True when the signed-in user has already started onboarding (a Creed exists
// server-side: seed claimed or composed), so marketing CTAs can offer "Resume"
// instead of "Get Started". Server-backed via /api/app/onboarding-status, so
// it's correct on any device. Mirrors useLandingAuthState / usePaidStatus: a
// tiny inline auth listener + fetch.

// Last resolved value, kept at module scope so the CTA label seeds from it on
// every client-side navigation instead of flipping "Resume" -> "Get Started"
// and reflowing the button. Background revalidation still runs on each mount.
let cachedCanResume = false;
const ONBOARDING_CACHE_PREFIX = "creed:onboarding-started:";

export function useOnboardingResume(configured: boolean = true): boolean {
  const [canResume, setCanResume] = useState(cachedCanResume);

  const commit = useCallback((next: boolean) => {
    cachedCanResume = next;
    setCanResume(next);
  }, []);

  useEffect(() => {
    if (!configured) return;
    let active = true;
    const supabase = getSupabaseBrowserClient();

    async function refresh(userId: string | null) {
      if (!userId) {
        if (active) commit(false);
        return;
      }
      const cacheKey = `${ONBOARDING_CACHE_PREFIX}${userId}`;
      const cached = window.sessionStorage.getItem(cacheKey);
      if (cached === "1" || cached === "0") {
        if (active) commit(cached === "1");
        return;
      }
      try {
        const res = await fetch("/api/app/onboarding-status", {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) {
          if (active) commit(false);
          return;
        }
        const data = (await res.json()) as { started?: boolean };
        const started = Boolean(data.started);
        window.sessionStorage.setItem(cacheKey, started ? "1" : "0");
        if (active) commit(started);
      } catch {
        if (active) commit(false);
      }
    }

    supabase.auth.getUser().then((result: { data: { user: unknown } }) => {
      const user = result.data.user as { id?: string } | null;
      void refresh(user?.id ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: unknown, session: unknown) => {
      const s = session as { user?: { id?: string } } | null;
      void refresh(s?.user?.id ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [configured, commit]);

  return canResume;
}
