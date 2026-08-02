"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

// Single source of truth for "is the visitor signed in?" on marketing
// pages. Used by both the chrome header and the pricing card so they
// agree about visibility transitions during sign-in / sign-out without
// each spinning up its own auth listener.
export type LandingAuthState = "loading" | "signed-in" | "signed-out";

// Last resolved value, kept at module scope so the header seeds from it on
// every client-side navigation instead of flashing back to "loading" and
// reflowing its buttons. Background revalidation still runs on each mount.
let cachedAuthState: LandingAuthState | null = null;

export function useLandingAuthState(configured: boolean = true): LandingAuthState {
  const [authState, setAuthState] = useState<LandingAuthState>(
    cachedAuthState ?? (configured ? "loading" : "signed-out")
  );

  const commit = useCallback((next: LandingAuthState) => {
    cachedAuthState = next;
    setAuthState(next);
  }, []);

  useEffect(() => {
    if (!configured) return;

    const supabase = getSupabaseBrowserClient();
    let active = true;

    // Initial resolve: read the cached session first (snappy), then
    // validate it against the server via getUser(). If the server doesn't
    // recognise the user (e.g. their auth.users row was deleted), the
    // local session is stale - sign them out so the chrome shows the
    // signed-out branch and they can re-auth properly. Without this the
    // user gets stuck seeing "Get Started" with no Login while every
    // server call 401s.
    (async () => {
      const sessionResult = (await supabase.auth.getSession()) as {
        data: { session: unknown };
      };
      if (!active) return;
      if (!sessionResult.data.session) {
        commit("signed-out");
        return;
      }
      try {
        const userResult = (await supabase.auth.getUser()) as {
          data: { user: unknown };
          error: { message: string } | null;
        };
        if (!active) return;
        if (userResult.error || !userResult.data.user) {
          await supabase.auth.signOut();
          if (!active) return;
          commit("signed-out");
          return;
        }
        commit("signed-in");
      } catch {
        if (!active) return;
        // Network failure validating - leave the cached state as "signed-in"
        // rather than logging the user out on a transient error. The next
        // page load will re-attempt validation.
        commit("signed-in");
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: unknown, session: unknown) => {
      if (!active) return;
      commit(session ? "signed-in" : "signed-out");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [configured, commit]);

  return authState;
}
