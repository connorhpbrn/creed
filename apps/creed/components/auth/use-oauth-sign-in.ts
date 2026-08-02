"use client";

// Shared OAuth trigger for the marketing auth surface. Owns the one bit of
// real OAuth logic (kick off Supabase OAuth, routing the result through
// /auth/callback with an optional `next` destination) so the chrome button
// and the /login + /signup screens don't each carry a copy.

import { useState } from "react";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

// "x" is Supabase's X / Twitter (OAuth 2.0) provider. The legacy OAuth 1.0a
// provider is "twitter" and is not what we have enabled.
export type OAuthProvider = "google" | "x";

// Remember the last OAuth provider the user kicked off, so the auth screen can
// surface a "Last used" hint. Written at click time (before the redirect).
const LAST_PROVIDER_KEY = "creed:last-auth-provider";

export function readLastAuthProvider(): OAuthProvider | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(LAST_PROVIDER_KEY);
    return value === "google" || value === "x" ? value : null;
  } catch {
    return null;
  }
}

export function useOAuthSignIn(configured: boolean = true, redirectTo?: string) {
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(null);

  async function signIn(provider: OAuthProvider) {
    if (!configured || pendingProvider) return;

    setPendingProvider(provider);
    try {
      window.localStorage.setItem(LAST_PROVIDER_KEY, provider);
    } catch {
      // Storage may be unavailable; the "Last used" hint is non-essential.
    }
    const supabase = getSupabaseBrowserClient();
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (redirectTo) {
      callbackUrl.searchParams.set("next", redirectTo);
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl.toString() },
    });

    // On success the browser is already navigating to the provider, so this
    // only runs when the handoff itself failed.
    if (error) {
      setPendingProvider(null);
      toast.error(error.message || "Could not start sign-in. Try again.");
    }
  }

  return { signIn, pendingProvider };
}
