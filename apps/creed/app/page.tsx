import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BackendSetupScreen } from "@/components/auth/backend-setup-screen";
import { hasPersistedCreed } from "@/lib/creed-backend";
import { isSupabaseTableMissingError } from "@/lib/creed-backend-errors";
import { hasActiveEntitlement } from "@/lib/stripe";
import { hasCompanyAccess } from "@/lib/creed-membership";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { log } from "@/lib/observability";

export const dynamic = "force-dynamic";

// Root-page router. Branches on three signals: Supabase configured?
// (otherwise marketing-only), signed in?, paid?. Only then do we ask
// whether a personal Creed row exists to decide `/file` vs `/onboarding`
// (the row, not the section count - an emptied Creed is still onboarded).
//
// We deliberately use the lightweight `hasPersistedCreed` probe rather
// than the full `loadCreedState` fan-out - this route is a redirect, not
// a render, so any extra round-trips are pure overhead and the
// (creed-app) layout will load real state on the next request.
export default async function Home() {
  if (!isSupabaseConfigured()) {
    redirect("/home");
  }

  // Fast path for signed-out visitors (and every crawler that hits `/`):
  // no Supabase auth cookie means no session, so skip the client setup and
  // the auth/entitlement round-trips entirely. Anyone holding a cookie -
  // even an expired one - falls through to the real getUser() check below.
  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!hasAuthCookie) {
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

  // Access gate. The app is the paid product, so a signed-in user with no
  // access is sent to /onboarding (free: connect an agent, compose, preview,
  // then "Get Creed"). Access is either a personal entitlement OR membership of
  // a company Creed whose billing is live - a company member never needs a
  // personal plan.
  const admin = getSupabaseAdminClient();
  const [paid, companyAccess] = await Promise.all([
    hasActiveEntitlement(supabase, user.id),
    hasCompanyAccess(supabase, admin, user.id),
  ]);
  if (!paid && !companyAccess) {
    redirect("/onboarding");
  }

  // A company member goes straight into the app; the (creed-app) layout resolves
  // their active (company) Creed, and - for an owner who hasn't finished company
  // setup - resumes company onboarding. They must never be routed through the
  // personal first-run flow. Only a personal-only paid user gets the section
  // probe below (personal onboarding when they have no sections yet).
  if (companyAccess) {
    redirect("/file");
  }

  // `redirect()` works by throwing a NEXT_REDIRECT marker that the
  // framework catches at the boundary. Wrapping it in try/catch is the
  // canonical Next.js footgun: the catch swallows the redirect signal,
  // logs it as a phantom error, and re-throws in a way that surfaces
  // app/error.tsx with a digest instead of actually redirecting. Keep
  // the redirect OUTSIDE the try; only the DB probe is wrapped.
  let hasCreed: boolean;
  try {
    hasCreed = await hasPersistedCreed(supabase, user.id);
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

  redirect(hasCreed ? "/file" : "/onboarding");
}
