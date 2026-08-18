import { redirect } from "next/navigation";
import { CreedWordmark } from "@/components/creed/brand";
import { CodeCopyButton } from "@/components/marketing/code-command";
import { OpenOwnerClaimForm } from "@/components/auth/open-owner-claim-form";
import {
  getOpenOwnerConfigurationError,
  hasValidOpenOwnerSession,
} from "@creed/open/lib/open-owner";
import {
  getSupabasePublishableKey,
  getSupabaseSecretKey,
  getSupabaseUrl,
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
} from "@creed/persistence/supabase/env";
import { getRequestAuth } from "@/lib/request-auth";
import { GITHUB_URL } from "@/lib/branding";
import { getOpenDatabaseReadiness } from "@creed/open/lib/open-setup";
import {
  OpenSetupGuideLink,
  OpenTechnicalDetails,
} from "@creed/open/components/open-technical-details";

export const dynamic = "force-dynamic";

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const databaseReadiness =
    isSupabaseAdminConfigured() && isSupabaseConfigured()
      ? await getOpenDatabaseReadiness()
      : { ready: false as const };

  // A valid owner cookie must not skip this page while migrations are stale.
  // The app and onboarding layouts send claimed owners back here so they see
  // Database needs setup instead of a 500 on Personal claim.
  if (
    databaseReadiness.ready &&
    isSupabaseConfigured() &&
    (await hasValidOpenOwnerSession()) &&
    (await getRequestAuth()).user
  ) {
    redirect("/");
  }
  const technicalValues = [
    { name: "NEXT_PUBLIC_SITE_URL", ready: Boolean(process.env.NEXT_PUBLIC_SITE_URL?.trim()) },
    { name: "NEXT_PUBLIC_SUPABASE_URL", ready: Boolean(getSupabaseUrl()) },
    { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ready: Boolean(getSupabasePublishableKey()) },
    { name: "SUPABASE_SECRET_KEY", ready: Boolean(getSupabaseSecretKey()) },
    { name: "CREED_OWNER_SECRET", ready: !getOpenOwnerConfigurationError() },
    { name: "CREED_ENCRYPTION_SECRET", ready: Boolean(process.env.CREED_ENCRYPTION_SECRET?.trim()) },
    { name: "Supabase migrations", ready: databaseReadiness.ready },
  ];
  const environmentReady = technicalValues.slice(0, 4).every((item) => item.ready);
  const ownerAccessReady = technicalValues.slice(4, 6).every((item) => item.ready);
  const setupStates = [
    { name: "Environment", ready: environmentReady },
    { name: "Database", ready: databaseReadiness.ready },
    { name: "Owner access", ready: ownerAccessReady },
  ];
  const setupReady =
    setupStates.every((item) => item.ready) &&
    isSupabaseConfigured() &&
    isSupabaseAdminConfigured();
  const requestedNext = (await searchParams).next;
  const nextPath =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/";

  return (
    <main className="min-h-screen bg-[var(--creed-surface)] px-6 py-8 md:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col">
        <div className="flex flex-1 items-center">
          <div className="w-full -translate-y-4">
            <div
              className="mb-6 flex w-full justify-center"
              style={{ transform: "translateY(-32px)" }}
            >
              <CreedWordmark className="ml-0" />
            </div>
            <div className="rounded-[24px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-6 shadow-[0_24px_70px_rgba(18,18,17,0.06)] sm:p-8">
              <h1 className="font-heading text-[1.75rem] font-medium leading-[1.1] tracking-[-0.04em] text-[var(--creed-text-primary)]">
                Open your Creed
              </h1>
              <p className="mt-4 text-[15px] leading-7 text-[var(--creed-text-secondary)]">
                {setupReady
                  ? "Enter your owner secret. You only need it when authorising a new browser or after rotating the secret."
                  : "Finish the setup, then return here to open your Creed."}
              </p>

              {!setupReady ? (
                <div className="mt-7">
                  <div className="overflow-hidden rounded-xl border border-[var(--creed-border)]">
                    {setupStates.map((item) => (
                      <div key={item.name} className="flex items-center justify-between gap-4 border-b border-[var(--creed-border)] px-4 py-3 text-[13px] last:border-0">
                        <span className="text-[var(--creed-text-secondary)]">{item.name}</span>
                        <span className={item.ready ? "text-[#16A34A] dark:text-[#4ADE80]" : "text-[#B45309] dark:text-[#FBBF24]"}>
                          {item.ready ? "Ready" : "Needs setup"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 rounded-xl bg-[var(--creed-surface-raised)] px-4 py-3.5">
                    <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--creed-text-primary)]">
                      <span>Run</span>
                      <div className="flex items-center rounded-[8px] bg-[#E2E2DE] pl-2 dark:bg-[#383834]">
                        <code className="py-1 font-mono font-normal">
                          npm run setup
                        </code>
                        <CodeCopyButton
                          copyText="npm run setup"
                          className="hover:bg-transparent! hover:text-white!"
                        />
                      </div>
                    </div>
                    <p className="mt-1 text-[12px] leading-5 text-[var(--creed-text-secondary)]">
                      The installer connects Supabase, prepares the database, and checks the installation.
                    </p>
                  </div>
                  <div className="relative mt-4 text-[12px]">
                    <OpenTechnicalDetails values={technicalValues} />
                    <div className="absolute right-0 top-2">
                      <OpenSetupGuideLink href={`${GITHUB_URL}/blob/main/SETUP.md`} />
                    </div>
                  </div>
                </div>
              ) : (
                <OpenOwnerClaimForm nextPath={nextPath} />
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
