"use client";

// Split-screen sign-in surface for /login, rendered inside <AuthShell>.
//
// Google and X go through Supabase OAuth (useOAuthSignIn). Email/password uses
// Supabase signInWithPassword directly. "Forgot password?" sends a reset link
// via resetPasswordForEmail (the /reset-password page finishes the flow).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LoaderCircle, MailCheck } from "@/components/ui/phosphor-icons";
import { toast } from "sonner";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthCheckbox, AuthField, AuthSubmitButton, PasswordField } from "@/components/auth/auth-fields";
import { readLastAuthProvider, useOAuthSignIn, type OAuthProvider } from "@/components/auth/use-oauth-sign-in";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const copy = {
  heading: "Welcome back",
  submit: "Sign in",
};

// Map Supabase auth errors to one clean, user-meaningful sentence.
function authErrorMessage(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "That email or password is incorrect.";
  }
  if (m.includes("email not confirmed")) {
    return "Confirm your email first, then sign in. Check your inbox.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "An account with this email already exists.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  return message || "Something went wrong. Try again.";
}

type Confirmation = { email: string; kind: "reset" };

export function AuthScreen({
  configured = true,
  nextPath = "/dashboard",
  authError,
  showGoogle = true,
}: {
  configured?: boolean;
  // Where to land after a successful auth (e.g. back to /authorize for an MCP
  // connect). Defaults to the root router.
  nextPath?: string;
  authError?: "oauth_email_mismatch" | "invite_required";
  showGoogle?: boolean;
}) {
  const t = copy;

  // Google is available on normal sign-in, but setup flows can suppress it.
  // X remains behind an explicit flag because it is not part of the current
  // sign-in contract.
  const googleEnabled = showGoogle;
  const xEnabled = process.env.NEXT_PUBLIC_ENABLE_X_AUTH === "1";
  const anyOAuth = googleEnabled || xEnabled;

  const { signIn: oauthSignIn, pendingProvider } = useOAuthSignIn(configured, nextPath);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const [lastProvider, setLastProvider] = useState<OAuthProvider | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    // Set true on (re)mount, not just at init - otherwise React StrictMode's
    // dev mount/unmount/remount leaves it stuck false and we skip the
    // setSubmitting(false) in the finally, hanging the spinner after an error.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (authError === "oauth_email_mismatch") {
      toast.error("Use the account with the same email as your Creed invite.");
    } else if (authError === "invite_required") {
      toast.error("Accept your Creed invite before using Google sign-in.");
    }
  }, [authError]);

  // Read after mount to avoid a hydration mismatch (localStorage is client-only).
  useEffect(() => {
    setLastProvider(readLastAuthProvider());
  }, []);

  const busy = submitting || pendingProvider !== null;

  function validate() {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) {
      next.email = "Enter your email.";
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      next.email = "Enter a valid email address.";
    }
    if (!password) {
      next.password = "Enter your password.";
    }
    return next;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !configured) return;

    const nextErrors = validate();
    setErrors(nextErrors);
    if (nextErrors.email) {
      emailRef.current?.focus();
      return;
    }
    if (nextErrors.password) {
      passwordRef.current?.focus();
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const trimmedEmail = email.trim();
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (error) {
        toast.error(authErrorMessage(error.message));
        return;
      }
      // Full navigation so server components pick up the new session.
      window.location.assign(nextPath);
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    if (busy || !configured) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
      setErrors((e) => ({ ...e, email: "Enter your email to reset your password." }));
      emailRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (error) {
        toast.error(error.message || "Couldn't send the reset link. Try again.");
        return;
      }
      // Supabase returns success even for unknown emails (anti-enumeration), so
      // we always land on the same confirmation state.
      setConfirmation({ email: trimmedEmail, kind: "reset" });
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      {confirmation ? (
        <ConfirmationNotice
          email={confirmation.email}
          kind={confirmation.kind}
          onBack={() => {
            setConfirmation(null);
            setPassword("");
          }}
        />
      ) : (
        <>
          <AnimatedPageTitle
            text={t.heading}
            className="text-[30px] font-medium leading-tight tracking-[-0.02em] md:text-[34px]"
          />

          {anyOAuth ? (
            <>
              <div className="mt-8 flex flex-col gap-3">
                {googleEnabled ? (
                  <ProviderButton
                    onClick={() => void oauthSignIn("google")}
                    disabled={busy || !configured}
                    lastUsed={lastProvider === "google"}
                    icon={<GoogleIcon />}
                  >
                    {pendingProvider === "google" ? (
                      <>
                        Redirecting
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      </>
                    ) : (
                      <>Sign in with Google</>
                    )}
                  </ProviderButton>
                ) : null}

                {xEnabled ? (
                  <ProviderButton
                    onClick={() => void oauthSignIn("x")}
                    disabled={busy || !configured}
                    lastUsed={lastProvider === "x"}
                    icon={<XIcon />}
                  >
                    {pendingProvider === "x" ? (
                      <>
                        Redirecting
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      </>
                    ) : (
                      <>Sign in with X</>
                    )}
                  </ProviderButton>
                ) : null}
              </div>

              <div className="my-5 flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-[var(--creed-border)]" />
                <span className="text-[13px] text-[var(--creed-text-tertiary)]">or</span>
                <span className="h-px flex-1 bg-[var(--creed-border)]" />
              </div>
            </>
          ) : (
            <div className="mt-8" />
          )}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
            <AuthField
              ref={emailRef}
              type="email"
              label="Email"
              autoComplete="email"
              value={email}
              disabled={busy}
              error={errors.email}
              onChange={(value) => {
                setEmail(value);
                if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
              }}
            />

            <PasswordField
              inputRef={passwordRef}
              label="Password"
              autoComplete="current-password"
              value={password}
              disabled={busy}
              error={errors.password}
              onChange={(value) => {
                setPassword(value);
                if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
              }}
            />

            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer select-none items-center gap-2.5 text-[14px] text-[var(--creed-text-secondary)]">
                <AuthCheckbox checked={remember} onChange={() => setRemember((v) => !v)} />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => void handleForgotPassword()}
                disabled={busy}
                className="text-[14px] text-[var(--creed-text-secondary)] transition-colors hover:text-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Forgot password?
              </button>
            </div>

            <AuthSubmitButton
              label={t.submit}
              loading={submitting}
              disabled={busy || !configured}
            />
          </form>
        </>
      )}
    </AuthShell>
  );
}

function ConfirmationNotice({
  email,
  onBack,
}: {
  email: string;
  kind: "reset";
  onBack: () => void;
}) {
  const body = "Click it to choose a new password.";
  const lead = "We sent a password reset link to";

  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ECFDF5] text-[#16A34A] dark:bg-[#052e1a]/60 dark:text-[#4ade80]">
        <MailCheck className="h-6 w-6" />
      </div>
      <h1 className="mt-5 text-[26px] font-medium leading-tight tracking-[-0.02em]">Check your inbox</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--creed-text-secondary)]">
        {lead} <span className="font-medium text-[var(--creed-text-primary)]">{email}</span>. {body}
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-6 text-[14px] font-medium text-[var(--creed-text-primary)] transition-colors hover:text-[#2563EB]"
      >
        Use a different email
      </button>
    </div>
  );
}

function ProviderButton({
  children,
  icon,
  onClick,
  disabled,
  lastUsed,
}: {
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  lastUsed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--creed-border)] bg-[var(--creed-surface)] text-[15px] font-medium text-[var(--creed-text-primary)] transition-colors hover:bg-[var(--creed-surface-raised)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {lastUsed ? (
        <span className="pointer-events-none absolute -top-2.5 right-3 z-10 rounded-[6px] border border-[#2563EB]/30 bg-[#EFF6FF] px-2 py-1 text-[12px] font-medium leading-none text-[#2563EB] dark:border-[#2563EB]/45 dark:bg-[#0e1b30] dark:text-[#60A5FA]">
          Last used
        </span>
      ) : null}
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">{icon}</span>
      {children}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-[15px] w-[15px]" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
