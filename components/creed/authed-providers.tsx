import type { ReactNode } from "react";
import { BackendSetupScreen } from "@/components/auth/backend-setup-screen";
import { CreedProvider } from "@/components/creed/creed-provider";
import { initialCreedState } from "@/lib/creed-data";
import { loadActiveCreedState } from "@/lib/creed-backend";
import { resolveActiveCreed } from "@/lib/creed-context";
import type { ActiveCreed } from "@/lib/creed-context";
import { isSupabaseTableMissingError } from "@/lib/creed-backend-errors";
import { isSupabaseConfigured } from "@/lib/supabase/env";
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
}: {
  children: ReactNode;
  requestAuth?: RequestAuth;
  activeCreed?: ActiveCreed | null;
}) {
  let initialState = initialCreedState;
  let persistenceEnabled = false;
  let missingSchemaMessage: string | null = null;

  if (isSupabaseConfigured()) {
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
        persistenceEnabled = result.hasPersistedCreed;
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
