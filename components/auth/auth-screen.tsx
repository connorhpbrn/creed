import { CreedWordmark } from "@/components/creed/brand";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

export function AuthScreen({ configured }: { configured: boolean }) {
  return (
    <div className="min-h-screen bg-[var(--creed-surface)] px-6 py-8 md:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col">
        <CreedWordmark />

        <div className="flex flex-1 items-center">
          <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,420px)] lg:items-center">
            <div className="max-w-2xl">
              <div className="text-[12px] font-medium text-[var(--creed-text-tertiary)]">
                Canonical context for agents
              </div>
              <h1 className="mt-4 font-heading text-[3.6rem] leading-none tracking-[-0.06em] text-[var(--creed-text-primary)]">
                One file. Every agent starts aligned.
              </h1>
              <p className="mt-6 max-w-xl text-[18px] leading-8 text-[var(--creed-text-secondary)]">
                Sign in, shape your Creed once, and let onboarding, connections, and governed
                review run on a real owner model from the start.
              </p>
            </div>

            <div className="rounded-[24px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-6 shadow-[0_24px_70px_rgba(18,18,17,0.06)]">
              <div className="text-[20px] font-medium tracking-[-0.02em] text-[var(--creed-text-primary)]">
                Sign in to start your Creed
              </div>
              <p className="mt-3 text-[14px] leading-7 text-[var(--creed-text-secondary)]">
                Google-only for v1. One user, one Creed, one clean source of truth for every agent
                you connect.
              </p>

              <div className="mt-6">
                {configured ? (
                  <GoogleSignInButton />
                ) : (
                  <div className="rounded-[16px] border border-[#F5C77A] bg-[#FFF6E8] px-4 py-4 text-[13px] leading-6 text-[#9A6700]">
                    Add your Supabase URL, anon key, service role key, and enable Google Auth to
                    turn on the real backend flow.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
