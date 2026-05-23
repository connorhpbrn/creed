import { redirect } from "next/navigation";
import { BackendSetupScreen } from "@/components/auth/backend-setup-screen";
import { hasPersistedCreed } from "@/lib/creed-backend";
import { isSupabaseTableMissingError } from "@/lib/creed-backend-errors";
import { hasPaidEntitlement } from "@/lib/stripe";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { log } from "@/lib/observability";

// Root-page router. Branches on three signals: Supabase configured?
// (otherwise marketing-only), signed in?, paid?. Only then do we ask
// whether the user has any sections to decide `/file` vs `/onboarding`.
//
// We deliberately use the lightweight `hasPersistedCreed` probe rather
// than the full `loadCreedState` fan-out — this route is a redirect, not
// a render, so any extra round-trips are pure overhead and the
// (creed-app) layout will load real state on the next request.
export default async function Home() {
  if (!isSupabaseConfigured()) {
    redirect("/home");
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    log.error("home_supabase_client_init_failed", { route: "/" }, error);
    throw error;
  }

  let user;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    log.error("home_get_user_failed", { route: "/" }, error);
    throw error;
  }

  if (!user) {
    redirect("/home");
  }

  // Entitlement gate: signed-in users without a paid row are sent to the
  // pricing page rather than into the app. The (creed-app) layout also
  // gates /file etc, but short-circuiting here avoids the redundant
  // section-probe round-trip for unpaid users.
  const paid = await hasPaidEntitlement(supabase, user.id);
  if (!paid) {
    redirect("/pricing?reason=not_paid");
  }

  // `redirect()` works by throwing a NEXT_REDIRECT marker that the
  // framework catches at the boundary. Wrapping it in try/catch is the
  // canonical Next.js footgun: the catch swallows the redirect signal,
  // logs it as a phantom error, and re-throws in a way that surfaces
  // app/error.tsx with a digest instead of actually redirecting. Keep
  // the redirect OUTSIDE the try; only the DB probe is wrapped.
  let hasSections: boolean;
  try {
    hasSections = await hasPersistedCreed(supabase, user.id);
  } catch (error) {
    if (isSupabaseTableMissingError(error)) {
      return (
        <BackendSetupScreen
          errorMessage={
            error instanceof Error ? error.message : "Creed tables are missing."
          }
        />
      );
    }

    log.error("home_has_persisted_creed_failed", { route: "/", userId: user.id }, error);
    throw error;
  }

  redirect(hasSections ? "/file" : "/onboarding");
}
