import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Per-request cached auth accessor. React cache() dedupes within a single
// server render, so the (creed-app) / onboarding layout and the
// AuthedProviders it renders share ONE Supabase server client and ONE
// getUser() round-trip instead of each creating their own. In route handlers
// (no render tree) it's a harmless passthrough - each request still resolves
// its own auth.
//
// Only call this when Supabase is configured (createSupabaseServerClient
// assumes the env is present); every call site already guards on that.
export const getRequestAuth = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});
