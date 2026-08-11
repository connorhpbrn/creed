"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublishableKey, getSupabaseUrl } from "@creed/persistence/supabase/env-public";

// Keep the standard cookie handling so PKCE verifier and session cookies
// round-trip between the browser and server callback.

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  browserClient = createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey());
  return browserClient;
}
