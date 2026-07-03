import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShellLayout } from "@/components/creed/app-shell-layout";
import { AuthedProviders } from "@/components/creed/authed-providers";
import { hasPersistedCreed } from "@/lib/creed-backend";
import { isSupabaseTableMissingError } from "@/lib/creed-backend-errors";
import { getEntitlementWelcomeState, hasActiveEntitlement } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Entitlement + onboarding gate for everything inside the (creed-app)
// route group (/file, /connections, /settings). Three-layer check:
//   1. signed in? if not → /pricing
//   2. has a paid creed_entitlements row? if not → /onboarding
//   3. has any persisted sections? if not → /onboarding
//
// The app is the paid product, so unpaid users are sent to /onboarding
// (where they can finish onboarding and hit "Get Creed"), never into the
// app. Step 3 catches users who deep-link to /file (or come back via a
// stale browser tab) without having completed onboarding yet. Without it
// they'd see the seed initialCreedState (placeholder sections, blank
// name) instead of being routed through the proper first-run flow.
//
// Marketing routes and /payment/* don't pass through here so they remain
// reachable to anyone. The check uses the user's own session client +
// the "Read own entitlement" RLS policy - no admin escalation needed.
//
// This layout (not the root) owns the dynamic, user-specific boundary now:
// AuthedProviders loads the Creed and supplies CreedProvider, and the gate
// reads the session, so the segment renders dynamically while the root stays
// static.
export const dynamic = "force-dynamic";

export default async function CreedAppLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) {
    // Local dev without Supabase config: skip the gate so the rest of
    // the app can render. Production deployments always have Supabase.
    return (
      <AuthedProviders>
        <AppShellLayout showWelcome={false} welcomePaidAt={null}>
          {children}
        </AppShellLayout>
      </AuthedProviders>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/pricing");
  }

  const paid = await hasActiveEntitlement(supabase, user.id);
  if (!paid) {
    redirect("/onboarding");
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

  // One-time welcome pop-up. Fully fault-tolerant (see the helper): any read
  // failure resolves to "don't show", so this never affects app access.
  const { showWelcome, paidAt } = await getEntitlementWelcomeState(
    supabase,
    user.id
  );

  return (
    <AuthedProviders>
      <AppShellLayout showWelcome={showWelcome} welcomePaidAt={paidAt}>
        {children}
      </AppShellLayout>
    </AuthedProviders>
  );
}
