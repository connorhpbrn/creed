import type { Metadata } from "next";
import Link from "next/link";
import { ContinueButton } from "@creed/cloud/app/payment/success/continue-button";
import { GoogleSignInButton } from "@creed/cloud/components/auth/google-sign-in-button";
import { WelcomeVideoPreloader } from "@/components/creed/welcome-video-preloader";
import {
  getStripeClient,
  upsertEntitlementFromSession,
} from "@creed/cloud/lib/stripe";
import { createSupabaseServerClient } from "@creed/persistence/supabase/server";
import { isSupabaseConfigured } from "@creed/persistence/supabase/env";
import { log } from "@/lib/observability";

export const metadata: Metadata = {
  title: "Payment received · Creed",
  description: "Your Creed is unlocked.",
};

export const dynamic = "force-dynamic";

// Three-branch state machine, mapped 1:1 to the plan:
//
// 1. Signed in AND the session's metadata.supabaseUserId matches the
//    current user AND payment_status === "paid"
//      → upsert (idempotent) + render Continue (pricing buyers return to
//        /pricing; onboarding funnel continues into /file).
//
// 2. Not signed in
//      → render "Sign back in with the Google account you bought with."
//
// 3. Signed in as someone else (mismatched user)
//      → render "This payment was made on a different Creed account."
//
// 4. Bad session / not paid / no session_id
//      → render the generic "back to pricing" view.
//
// The upsert in branch (1) is a belt-and-braces alongside the webhook -
// whichever lands first writes, the second is a no-op (UNIQUE on
// stripe_session_id + PK on user_id). So if the user lands here before
// the webhook fires, they still get entitled instantly.

type SuccessState =
  | { kind: "ok"; continueHref: string; autoAdvance: boolean }
  | { kind: "not-signed-in"; signInNext: string }
  | { kind: "wrong-user" }
  | { kind: "invalid" };

// Explicit success `next` wins; otherwise use Checkout metadata.returnTo.
// Pricing buyers stay on pricing. Onboarding funnel enters the app (/file),
// where the creed-app layout can still send unpaid-first-run users to finish
// onboarding if they have no Personal Creed yet.
function resolveCheckoutNext(
  nextRaw: string | null | undefined,
  metaReturn: string | null | undefined,
): "/pricing" | "/file" {
  if (nextRaw === "/pricing" || nextRaw === "pricing") return "/pricing";
  if (nextRaw === "/file" || nextRaw === "file") return "/file";
  if (metaReturn === "/pricing" || metaReturn === "pricing") return "/pricing";
  return "/file";
}

async function resolveState(
  sessionId: string | null,
  nextRaw: string | null,
): Promise<SuccessState> {
  if (!sessionId) return { kind: "invalid" };
  if (!isSupabaseConfigured()) return { kind: "invalid" };

  let supabaseUserId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    supabaseUserId = user?.id ?? null;
  } catch (error) {
    log.warn("payment_success_auth_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let session;
  try {
    session = await getStripeClient().checkout.sessions.retrieve(sessionId);
  } catch (error) {
    log.warn("payment_success_session_lookup_failed", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { kind: "invalid" };
  }

  const sessionUserId = session.metadata?.supabaseUserId;
  if (!sessionUserId || session.payment_status !== "paid") {
    return { kind: "invalid" };
  }

  const continueHref = resolveCheckoutNext(nextRaw, session.metadata?.returnTo);

  if (!supabaseUserId) {
    return { kind: "not-signed-in", signInNext: continueHref };
  }
  if (supabaseUserId !== sessionUserId) {
    return { kind: "wrong-user" };
  }

  // Idempotent provisioning so the user doesn't have to wait for the webhook.
  // Track whether it landed: only a confirmed result auto-advances. If it throws
  // (DB hiccup), the webhook retries and the user can click Continue.
  let entitled = false;
  try {
    await upsertEntitlementFromSession(session);
    entitled = true;
  } catch (error) {
    log.error(
      "payment_success_upsert_failed",
      { sessionId, userId: supabaseUserId },
      error instanceof Error ? error : new Error(String(error))
    );
  }

  return {
    kind: "ok",
    continueHref,
    autoAdvance: entitled,
  };
}

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; next?: string }>;
}) {
  const params = await searchParams;
  const state = await resolveState(params.session_id ?? null, params.next ?? null);

  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        {state.kind === "ok" ? (
          <SuccessOk continueHref={state.continueHref} autoAdvance={state.autoAdvance} />
        ) : null}
        {state.kind === "not-signed-in" ? (
          <NotSignedIn signInNext={state.signInNext} />
        ) : null}
        {state.kind === "wrong-user" ? <WrongUser /> : null}
        {state.kind === "invalid" ? <Invalid /> : null}
      </div>
    </div>
  );
}

function SuccessOk({
  continueHref,
  autoAdvance,
}: {
  continueHref: string;
  autoAdvance: boolean;
}) {
  const toPricing = continueHref === "/pricing";
  return (
    <>
      <h1 className="t-section text-[var(--creed-text-primary)]">Payment received</h1>
      <p className="mt-4 max-w-sm text-[15px] leading-7 text-[var(--creed-text-secondary)]">
        {toPricing
          ? "Cloud is unlocked on your account. Continue to see your plan."
          : "Creed is unlocked on your account. Let's set things up."}
      </p>
      <ContinueButton href={continueHref} autoAdvance={autoAdvance} />
      {!toPricing ? <WelcomeVideoPreloader /> : null}
    </>
  );
}

function NotSignedIn({ signInNext }: { signInNext: string }) {
  return (
    <>
      <h1 className="t-section text-[var(--creed-text-primary)]">Payment received</h1>
      <p className="mt-4 max-w-sm text-[15px] leading-7 text-[var(--creed-text-secondary)]">
        Sign back in with the Google account you used to buy Creed to finish setting up.
      </p>
      <div className="mt-8">
        <GoogleSignInButton label="Sign in to continue" redirectTo={signInNext} />
      </div>
    </>
  );
}

function WrongUser() {
  return (
    <>
      <h1 className="t-section text-[var(--creed-text-primary)]">Different account</h1>
      <p className="mt-4 max-w-sm text-[var(--creed-text-secondary)] text-[15px] leading-7">
        This payment was made on a different Creed account. Sign out and sign back in
        with the Google account you used at checkout.
      </p>
      <Link
        href="/pricing"
        className="mt-8 inline-flex h-11 items-center justify-center rounded-md border border-[var(--creed-border)] bg-transparent px-6 text-[14px] font-medium text-[var(--creed-text-primary)] transition-colors hover:bg-[var(--creed-surface-raised)]"
      >
        Back to pricing
      </Link>
    </>
  );
}

function Invalid() {
  return (
    <>
      <h1 className="t-section text-[var(--creed-text-primary)]">Something went sideways</h1>
      <p className="mt-4 max-w-sm text-[15px] leading-7 text-[var(--creed-text-secondary)]">
        We couldn&apos;t verify this checkout session. If you completed payment, the webhook
        usually catches up within a minute - try refreshing, or head back to pricing.
      </p>
      <Link
        href="/pricing"
        className="mt-8 inline-flex h-11 items-center justify-center rounded-md border border-[var(--creed-border)] bg-transparent px-6 text-[14px] font-medium text-[var(--creed-text-primary)] transition-colors hover:bg-[var(--creed-surface-raised)]"
      >
        Back to pricing
      </Link>
    </>
  );
}
