import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShellLayout } from "@/components/creed/app-shell-layout";
import { AppVersionNotifier } from "@/components/creed/app-version-notifier";
import { AuthedProviders } from "@/components/creed/authed-providers";
import { getAppVersion } from "@/lib/app-version";
import { hasPersistedCreed } from "@/lib/creed-backend";
import { isSupabaseTableMissingError } from "@/lib/creed-backend-errors";
import { resolveActiveCreed } from "@/lib/creed-context";
import { getRequestAuth } from "@/lib/request-auth";
import { isSupabaseConfigured } from "@creed/persistence/supabase/env";
import { getOpenDatabaseReadiness } from "@creed/open/lib/open-setup";

export const dynamic = "force-dynamic";

export default async function CreedAppLayout({ children }: { children: ReactNode }) {
  if (!(await getOpenDatabaseReadiness()).ready) redirect("/claim");

  if (!isSupabaseConfigured()) {
    return (
      <AuthedProviders>
        <AppShellLayout showWelcomePersonal={false} showWelcomeShared={false} welcomePaidAt={null}>
          {children}
        </AppShellLayout>
        <AppVersionNotifier initialVersion={getAppVersion()} />
      </AuthedProviders>
    );
  }

  const { supabase, user } = await getRequestAuth();
  if (!user) redirect("/claim");

  const active = await resolveActiveCreed(supabase, user);
  let persisted = false;
  try {
    persisted = await hasPersistedCreed(supabase, user.id);
  } catch (error) {
    if (!isSupabaseTableMissingError(error)) throw error;
  }
  if (!persisted) redirect("/onboarding");

  return (
    <AuthedProviders requestAuth={{ supabase, user }} activeCreed={active}>
      <AppShellLayout
        showWelcomePersonal
        showWelcomeShared={false}
        welcomePaidAt={user.created_at}
      >
        {children}
      </AppShellLayout>
      <AppVersionNotifier initialVersion={getAppVersion()} />
    </AuthedProviders>
  );
}
