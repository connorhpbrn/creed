"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env-public";

// Standard @supabase/ssr browser client - default cookie handling so the PKCE
// code-verifier and session cookies round-trip correctly between the browser
// and the server callback. (A previous custom cookie adapter + "tokens-only"
// encoding broke the OAuth code exchange; don't reintroduce that without
// thorough cross-browser testing.)

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  browserClient = createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey());
  return browserClient;
}
