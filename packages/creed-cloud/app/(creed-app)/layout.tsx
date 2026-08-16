import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShellLayout } from "@/components/creed/app-shell-layout";
import { AppVersionNotifier } from "@/components/creed/app-version-notifier";
import { getAppVersion } from "@/lib/app-version";
import { AuthedProviders } from "@/components/creed/authed-providers";
import { hasPersistedCreed } from "@/lib/creed-backend";
import { isSupabaseTableMissingError } from "@/lib/creed-backend-errors";
import {
  getEntitlementWelcomeState,
  hasActiveEntitlement,
} from "@creed/cloud/lib/stripe";
import { resolveActiveCreed } from "@/lib/creed-context";
import { getRequestAuth } from "@/lib/request-auth";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import { isSupabaseConfigured } from "@creed/persistence/supabase/env";
import { hasPrivateCloudAccess } from "@creed/cloud/lib/cloud-access";

// Entitlement + onboarding gate for everything inside the (creed-app)
// route group (/file, /connections, /settings). Three-layer check:
//   1. signed in? if not → /pricing
//   2. has a paid creed_entitlements row? if not → /onboarding
//   3. has a persisted personal Creed row? if not → /onboarding
//
// The app is the paid product, so unpaid users are sent to /onboarding
// (where they can finish onboarding and hit "Get Creed"), never into the
// app. Step 3 catches users who deep-link to /file (or come back via a
// stale browser tab) without having completed onboarding yet. It checks
// the Creed row (created by the onboarding claim step), NOT the section
// count - a user who deletes every section still has a Creed and must
// not be bounced back into first-run onboarding.
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
        <AppShellLayout
          showWelcomePersonal={false}
          showWelcomeShared={false}
          welcomePaidAt={null}
        >
          {children}
        </AppShellLayout>
        <AppVersionNotifier initialVersion={getAppVersion()} />
      </AuthedProviders>
    );
  }

  const { supabase, user } = await getRequestAuth();

  if (!user) {
    redirect("/pricing");
  }

  const [cloudEntitled, active] = await Promise.all([
    hasPrivateCloudAccess(user.email)
      ? Promise.resolve(true)
      : hasActiveEntitlement(supabase, user.id),
    resolveActiveCreed(supabase, user),
  ]);
  const activeEntry = active?.creeds.find((creed) => creed.id === active.creedId);
  const sharedAccess = activeEntry?.type === "shared";
  let sharedOwnerEntitled = false;
  if (sharedAccess && active) {
    const admin = getSupabaseAdminClient();
    const { data: sharedCreed } = await admin
      .from("creeds")
      .select("owner_user_id")
      .eq("id", active.creedId)
      .eq("type", "shared")
      .maybeSingle();
    const ownerUserId = (sharedCreed as { owner_user_id?: string } | null)?.owner_user_id;
    sharedOwnerEntitled = ownerUserId
      ? await hasActiveEntitlement(admin, ownerUserId)
      : false;
  }
  const hasAccess = cloudEntitled || (sharedAccess && sharedOwnerEntitled);

  if (!hasAccess) {
    redirect("/onboarding");
  }

  // Personal-only users still pass the personal onboarding gate: a paid user
  // with no persisted Creed is routed to /onboarding to finish first-run.
  // Shared members skip this (their active shared Creed decides what loads);
  // the shared onboarding flow handles a shared Creed that is still being set
  // up. Treat a missing-tables error as "not onboarded".
  if (!sharedAccess) {
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
  }

  // Open shows the Personal tour once per authorised browser after onboarding.
  // Cloud keeps its persisted, entitlement-backed per-Creed-type state.
  let showWelcomePersonal = false;
  let showWelcomeShared = false;
  let paidAt: string | null = null;
  if (cloudEntitled) {
    const welcome = await getEntitlementWelcomeState(supabase, user.id);
    showWelcomePersonal = welcome.showPersonal;
    showWelcomeShared = welcome.showShared;
    paidAt = welcome.paidAt;
  }

  return (
    <AuthedProviders
      requestAuth={{ supabase, user }}
      activeCreed={active}
    >
      <AppShellLayout
        showWelcomePersonal={showWelcomePersonal}
        showWelcomeShared={showWelcomeShared}
        welcomePaidAt={paidAt}
      >
        {children}
      </AppShellLayout>
      <AppVersionNotifier initialVersion={getAppVersion()} />
    </AuthedProviders>
  );
}
