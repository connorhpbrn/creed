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
  getCompanyWelcomeState,
  hasActiveEntitlement,
} from "@/lib/stripe";
import { hasCompanyAccess } from "@/lib/creed-membership";
import { resolveActiveCreed } from "@/lib/creed-context";
import { getRequestAuth } from "@/lib/request-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";

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
        <AppShellLayout showWelcome={false} welcomePaidAt={null}>
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

  // Access is granted by a personal entitlement OR membership of a company
  // Creed whose billing is live. A company member never needs a personal plan
  // (non-negotiable #2). hasCompanyAccess is false for every current user (no
  // company Creeds exist yet), so personal behaviour is unchanged.
  const admin = getSupabaseAdminClient();
  const [personalPaid, companyAccess] = await Promise.all([
    hasActiveEntitlement(supabase, user.id),
    hasCompanyAccess(supabase, admin, user.id),
  ]);

  if (!personalPaid && !companyAccess) {
    redirect("/onboarding");
  }

  // Personal-only users still pass the personal onboarding gate: a paid user
  // with no persisted Creed is routed to /onboarding to finish first-run.
  // Company members skip this (their active company Creed decides what loads);
  // the company onboarding flow handles a company Creed that is still being set
  // up. Treat a missing-tables error as "not onboarded".
  if (personalPaid && !companyAccess) {
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

  // Resume company onboarding: if the user OWNS any company Creed that has not
  // finished setup, send them to the company onboarding flow rather than an
  // empty file. This is the "bought it, closed the laptop, came back" path - the
  // switcher's "Set up" entry lands here too. Scan every Creed, not just the
  // active one: a dual-Creed owner whose active cookie points at their personal
  // Creed (the resolveActiveCreed default) must still be resumed into setup.
  const active = await resolveActiveCreed(supabase, user);
  if (active) {
    const unfinishedOwned = active.creeds.find(
      (c) => c.type === "company" && c.needsSetup && c.role === "owner"
    );
    if (unfinishedOwned) {
      redirect("/onboarding/company");
    }
  }

  // One-time welcome pop-up. Fully fault-tolerant (see the helpers): any read
  // failure resolves to "don't show", so this never affects app access. The tour
  // is keyed to the active Creed: inside a company Creed the owner just built,
  // read the company welcome state (its variant is amber "invite your team");
  // otherwise the personal entitlement state. This matches the client-side
  // variant AppShellLayout derives from creedType.
  const activeEntry = active?.creeds.find((c) => c.id === active.creedId) ?? null;
  // The company tour is the owner's post-onboarding flow. A non-owner viewing a
  // company Creed must NOT get it (the client renders the company variant off
  // creedType, so falling back to their personal entitlement here would show the
  // wrong tour and mark the wrong row seen). Owners get the company state;
  // everyone else gets their personal state.
  let showWelcome = false;
  let paidAt: string | null = null;
  if (activeEntry?.type === "company") {
    if (activeEntry.role === "owner") {
      ({ showWelcome, paidAt } = await getCompanyWelcomeState(activeEntry.id));
    }
  } else {
    ({ showWelcome, paidAt } = await getEntitlementWelcomeState(supabase, user.id));
  }

  return (
    <AuthedProviders
      requestAuth={{ supabase, user }}
      activeCreed={active}
    >
      <AppShellLayout showWelcome={showWelcome} welcomePaidAt={paidAt}>
        {children}
      </AppShellLayout>
      <AppVersionNotifier initialVersion={getAppVersion()} />
    </AuthedProviders>
  );
}
