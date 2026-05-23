import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShellLayout } from "@/components/creed/app-shell-layout";
import { hasPersistedCreed } from "@/lib/creed-backend";
import { isSupabaseTableMissingError } from "@/lib/creed-backend-errors";
import { hasPaidEntitlement } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Entitlement + onboarding gate for everything inside the (creed-app)
// route group (/file, /connections, /settings). Three-layer check:
//   1. signed in? if not → /pricing
//   2. has a paid creed_entitlements row? if not → /pricing?reason=not_paid
//   3. has any persisted sections? if not → /onboarding
//
// Step 3 catches users who deep-link to /file (or come back via a stale
// browser tab) without having completed onboarding yet. Without this
// they'd see the seed initialCreedState (placeholder sections, blank
// name) instead of being routed through the proper first-run flow.
//
// Marketing routes and /payment/* don't pass through here so they remain
// reachable to anyone. The check uses the user's own session client +
// the "Read own entitlement" RLS policy — no admin escalation needed.
export default async function CreedAppLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) {
    // Local dev without Supabase config: skip the gate so the rest of
    // the app can render. Production deployments always have Supabase.
    return <AppShellLayout>{children}</AppShellLayout>;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/pricing");
  }

  const paid = await hasPaidEntitlement(supabase, user.id);
  if (!paid) {
    redirect("/pricing?reason=not_paid");
  }

  // Onboarding gate. Treat a missing-tables error as "not onboarded" so
  // a fresh DB without migrations lands the user on /onboarding (which
  // surfaces a clearer setup screen) rather than a half-rendered /file.
  let sectionsPersisted = false;
  try {
    sectionsPersisted = await hasPersistedCreed(supabase, user.id);
  } catch (error) {
    if (!isSupabaseTableMissingError(error)) {
      throw error;
    }
  }
  if (!sectionsPersisted) {
    redirect("/onboarding");
  }

  return <AppShellLayout>{children}</AppShellLayout>;
}
