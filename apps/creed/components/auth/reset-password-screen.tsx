"use client";

// Final step of the forgot-password flow, rendered at /reset-password. The
// recovery link is exchanged for a session by /auth/callback before landing
// here, so we just confirm a session exists, take the new password, and call
// updateUser. No session -> the link was invalid or already used.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthSubmitButton, PasswordField } from "@/components/auth/auth-fields";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Status = "checking" | "ready" | "invalid";

export function ResetPasswordScreen({ configured = true }: { configured?: boolean }) {
  const [status, setStatus] = useState<Status>(configured ? "checking" : "invalid");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    // Set true on (re)mount so React StrictMode's dev remount doesn't leave it
    // stuck false and skip the finally's setSubmitting(false).
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabaseBrowserClient();
    let active = true;
    void supabase.auth.getUser().then((result: { data: { user: unknown } }) => {
      if (!active) return;
      setStatus(result.data.user ? "ready" : "invalid");
    });
    return () => {
      active = false;
    };
  }, [configured]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const next: { password?: string; confirm?: string } = {};
    if (!password) {
      next.password = "Enter a new password.";
    } else if (password.length < 8) {
      next.password = "Use at least 8 characters.";
    }
    if (confirm !== password) {
      next.confirm = "Passwords do not match.";
    }
    setErrors(next);
    if (next.password) {
      passwordRef.current?.focus();
      return;
    }
    if (next.confirm) return;

    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message || "Couldn't update your password. Try again.");
        return;
      }
      toast.success("Password updated.");
      // Full navigation so the app routes the now-signed-in user correctly.
      window.location.assign("/");
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  return (
    <AuthShell
      topRight={
        <Link
          href="/login"
          className="text-[14px] font-medium text-[var(--creed-text-primary)] transition-colors hover:text-[var(--creed-accent)]"
        >
          Sign in
        </Link>
      }
    >
      {status === "checking" ? (
        <div className="flex justify-center py-12">
          <LoaderCircle className="h-5 w-5 animate-spin text-[var(--creed-text-tertiary)]" />
        </div>
      ) : status === "invalid" ? (
        <div className="flex flex-col items-center text-center">
          <AnimatedPageTitle
            text="Link expired"
            className="text-[30px] font-medium leading-tight tracking-[-0.02em] md:text-[34px]"
          />
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--creed-text-secondary)]">
            This password reset link is invalid or has already been used. Request a new one from the sign-in screen.
          </p>
          <Link
            href="/login"
            className="mt-6 text-[14px] font-medium text-[var(--creed-text-primary)] transition-colors hover:text-[var(--creed-accent)]"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <AnimatedPageTitle
            text="Set a new password"
            className="text-[30px] font-medium leading-tight tracking-[-0.02em] md:text-[34px]"
          />
          <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-3">
            <PasswordField
              inputRef={passwordRef}
              label="New password"
              autoComplete="new-password"
              value={password}
              disabled={submitting}
              error={errors.password}
              onChange={(value) => {
                setPassword(value);
                if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
              }}
            />
            <PasswordField
              label="Confirm password"
              autoComplete="new-password"
              value={confirm}
              disabled={submitting}
              error={errors.confirm}
              onChange={(value) => {
                setConfirm(value);
                if (errors.confirm) setErrors((e) => ({ ...e, confirm: undefined }));
              }}
            />
            <AuthSubmitButton label="Update password" loading={submitting} disabled={submitting} />
          </form>
        </>
      )}
    </AuthShell>
  );
}
