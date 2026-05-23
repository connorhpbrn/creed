import type { Metadata } from "next";
import Link from "next/link";
import { ContinueButton } from "@/app/payment/success/continue-button";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import {
  getStripeClient,
  upsertEntitlementFromSession,
} from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
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
//      → upsert (idempotent) + render "Continue to Creed".
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
// The upsert in branch (1) is a belt-and-braces alongside the webhook —
// whichever lands first writes, the second is a no-op (UNIQUE on
// stripe_session_id + PK on user_id). So if the user lands here before
// the webhook fires, they still get entitled instantly.

type SuccessState =
  | { kind: "ok"; continueHref: string }
  | { kind: "not-signed-in" }
  | { kind: "wrong-user" }
  | { kind: "invalid" };

async function resolveState(sessionId: string | null): Promise<SuccessState> {
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

  if (!supabaseUserId) {
    return { kind: "not-signed-in" };
  }
  if (supabaseUserId !== sessionUserId) {
    return { kind: "wrong-user" };
  }

  // Idempotent upsert so the user doesn't have to wait for the webhook.
  try {
    await upsertEntitlementFromSession(session);
  } catch (error) {
    log.error(
      "payment_success_upsert_failed",
      { sessionId, userId: supabaseUserId },
      error instanceof Error ? error : new Error(String(error))
    );
    // Don't fail the page — the webhook will retry. The user can click
    // Continue and the entitlement gate will let them through once the
    // row exists.
  }

  return { kind: "ok", continueHref: "/file" };
}

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const params = await searchParams;
  const state = await resolveState(params.session_id ?? null);

  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        {state.kind === "ok" ? <SuccessOk continueHref={state.continueHref} /> : null}
        {state.kind === "not-signed-in" ? <NotSignedIn /> : null}
        {state.kind === "wrong-user" ? <WrongUser /> : null}
        {state.kind === "invalid" ? <Invalid /> : null}
      </div>
    </div>
  );
}

function SuccessOk({ continueHref }: { continueHref: string }) {
  return (
    <>
      {/* Wider container (`max-w-2xl` on the page wrapper) gives the
          headline room to stay on one line at typical viewports while
          still wrapping naturally on narrow mobile widths where it can't
          fit. */}
      <h1 className="t-section text-[var(--creed-text-primary)]">Payment received</h1>
      <p className="mt-4 max-w-sm text-[15px] leading-7 text-[var(--creed-text-secondary)]">
        Creed is unlocked on your account. Let&apos;s set things up.
      </p>
      <ContinueButton href={continueHref} />
    </>
  );
}

function NotSignedIn() {
  return (
    <>
      <h1 className="t-section text-[var(--creed-text-primary)]">Payment received</h1>
      <p className="mt-4 max-w-sm text-[15px] leading-7 text-[var(--creed-text-secondary)]">
        Sign back in with the Google account you used to buy Creed to finish setting up.
      </p>
      <div className="mt-8">
        <GoogleSignInButton label="Sign in to continue" redirectTo="/file" />
      </div>
    </>
  );
}

function WrongUser() {
  return (
    <>
      <h1 className="t-section text-[var(--creed-text-primary)]">Different account</h1>
      <p className="mt-4 max-w-sm text-[15px] leading-7 text-[var(--creed-text-secondary)]">
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
        usually catches up within a minute — try refreshing, or head back to pricing.
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
