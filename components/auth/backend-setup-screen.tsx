import { CreedWordmark } from "@/components/creed/brand";

export function BackendSetupScreen({
  errorMessage,
}: {
  errorMessage?: string;
}) {
  return (
    <div className="min-h-screen bg-[var(--creed-surface)] px-6 py-8 md:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col">
        <CreedWordmark />

        <div className="flex flex-1 items-center">
          <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,460px)] lg:items-center">
            <div className="max-w-2xl">
              <div className="text-[12px] font-medium text-[var(--creed-text-tertiary)]">
                Backend setup needed
              </div>
              <h1 className="mt-4 font-heading text-[3.4rem] leading-none tracking-[-0.06em] text-[var(--creed-text-primary)]">
                Auth is working. The Creed tables just aren&apos;t live yet.
              </h1>
              <p className="mt-6 max-w-xl text-[18px] leading-8 text-[var(--creed-text-secondary)]">
                Your Supabase project is connected, but the schema migration still needs to be run
                once before Creed can persist sections, proposals, activity, connections, and
                tokens.
              </p>
            </div>

            <div className="rounded-[24px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-6 shadow-[0_24px_70px_rgba(18,18,17,0.06)]">
              <div className="text-[20px] font-medium tracking-[-0.02em] text-[var(--creed-text-primary)]">
                Run the first Supabase migration
              </div>
              <p className="mt-3 text-[14px] leading-7 text-[var(--creed-text-secondary)]">
                Apply the SQL in{" "}
                <span className="font-medium text-[var(--creed-text-primary)]">
                  supabase/migrations/20260403190000_init_creed.sql
                </span>{" "}
                to your Supabase project, then reload.
              </p>

              <div className="mt-5 rounded-[16px] border border-[var(--creed-border)] bg-[var(--creed-background)] px-4 py-4">
                <div className="text-[12px] font-medium text-[var(--creed-text-tertiary)]">
                  Missing right now
                </div>
                <div className="mt-2 text-[13px] leading-6 text-[var(--creed-text-secondary)]">
                  <div>`creed_sections`</div>
                  <div>`creed_proposals`</div>
                  <div>`creed_activity`</div>
                  <div>`creed_connections`</div>
                  <div>`creed_tokens`</div>
                </div>
              </div>

              {errorMessage ? (
                <div className="mt-4 rounded-[16px] border border-[#F5C77A] bg-[#FFF6E8] px-4 py-4 text-[12px] leading-6 text-[#9A6700]">
                  {errorMessage}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
