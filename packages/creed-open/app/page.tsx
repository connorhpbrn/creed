import { redirect } from "next/navigation";
import { BackendSetupScreen } from "@/components/auth/backend-setup-screen";
import { hasPersistedCreed } from "@/lib/creed-backend";
import { isSupabaseTableMissingError } from "@/lib/creed-backend-errors";
import { getRequestAuth } from "@/lib/request-auth";
import { isSupabaseConfigured } from "@creed/persistence/supabase/env";
import { log } from "@/lib/observability";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isSupabaseConfigured()) redirect("/claim");

  const { supabase, user } = await getRequestAuth();
  if (!user) redirect("/claim");

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
