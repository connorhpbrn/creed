"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@creed/persistence/supabase/browser";
import {
  hasLocalOnboardingProgress,
  onboardingStartedCacheKey,
  readOnboardingDraft,
} from "@/lib/onboarding/draft-storage";

// True when the signed-in user has already started onboarding in a way we can
// resume: a local draft in this browser, and/or a Creed on the server (seed
// claimed or composed). Marketing CTAs offer Resume / Continue into
// /onboarding instead of pricing. Mirrors usePaidStatus: seed from cache, then
// always revalidate in the background.

let cachedCanResume = false;

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

      const local = hasLocalOnboardingProgress(readOnboardingDraft(userId));
      if (local && active) commit(true);

      const cacheKey = onboardingStartedCacheKey(userId);
      const cached = window.sessionStorage.getItem(cacheKey);
      if (cached === "1" || cached === "0") {
        if (active) commit(cached === "1" || local);
        // Fall through and revalidate so a draft written after an early
        // "not started" cache entry still flips Continue to resume.
      }

      try {
        const res = await fetch("/api/app/onboarding-status", {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) {
          if (active && !local && cached !== "1") commit(false);
          return;
        }
        const data = (await res.json()) as { started?: boolean };
        const started = Boolean(data.started) || local;
        window.sessionStorage.setItem(cacheKey, started ? "1" : "0");
        if (active) commit(started);
      } catch {
        if (active && !local && cached !== "1") commit(false);
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
