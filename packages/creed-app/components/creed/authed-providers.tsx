import type { ReactNode } from "react";
import { BackendSetupScreen } from "@/components/auth/backend-setup-screen";
import { CreedProvider } from "@/components/creed/creed-provider";
import { initialCreedState } from "@creed/core/creed-data";
import { loadActiveCreedState } from "@/lib/creed-backend";
import { resolveActiveCreed } from "@/lib/creed-context";
import type { ActiveCreed } from "@/lib/creed-context";
import { isSupabaseTableMissingError } from "@/lib/creed-backend-errors";
import { isSupabaseConfigured } from "@creed/persistence/supabase/env";
import { getRequestAuth } from "@/lib/request-auth";

// Loads the signed-in user's Creed and wraps its subtree in <CreedProvider>.
// This is the dynamic, user-specific boundary that used to live in the root
// layout. Keeping it out of the root is what lets the marketing pages
// prerender as a static shell (so <Link> can fully prefetch them and
// navigation is instant) while the app shell and onboarding still get live
// user state. Used by the (creed-app) and onboarding layouts.
type RequestAuth = Awaited<ReturnType<typeof getRequestAuth>>;

export async function AuthedProviders({
  children,
  requestAuth,
  activeCreed,
  forceLocal = false,
  persistFromDatabase = true,
}: {
  children: ReactNode;
  requestAuth?: RequestAuth;
  activeCreed?: ActiveCreed | null;
  forceLocal?: boolean;
  /** False on onboarding so an empty seed still POSTs /api/app/claim. A composed Creed keeps persistence. */
  persistFromDatabase?: boolean;
}) {
  let initialState = initialCreedState;
  let persistenceEnabled = false;
  let missingSchemaMessage: string | null = null;

  if (!forceLocal && isSupabaseConfigured()) {
    // Shares the layout's cached client + getUser within this render.
    const { supabase, user } = requestAuth ?? (await getRequestAuth());

    if (user) {
      try {
        const active =
          activeCreed === undefined
            ? await resolveActiveCreed(supabase, user)
            : activeCreed;
        const result = await loadActiveCreedState(supabase, user, active);
        initialState = result.state;
        persistenceEnabled =
          result.hasPersistedCreed &&
          (persistFromDatabase || result.state.sections.length > 0);
      } catch (error) {
        if (isSupabaseTableMissingError(error)) {
          missingSchemaMessage =
            error instanceof Error ? error.message : "Creed tables are missing.";
        } else {
          throw error;
        }
      }
    }
  }

  if (missingSchemaMessage) {
    return <BackendSetupScreen errorMessage={missingSchemaMessage} />;
  }

  return (
    <CreedProvider initialState={initialState} persistenceEnabled={persistenceEnabled}>
      {children}
    </CreedProvider>
  );
}
