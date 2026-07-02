"use client";

// Post-invite setup. The invite or magic-link callback has already created a
// Supabase session, so actions here are scoped to that invited user.

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthSubmitButton, PasswordField } from "@/components/auth/auth-fields";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const APP_ENTRY_PATH = "/dashboard";

export function AcceptInviteScreen({
  configured = true,
  userEmail,
}: {
  configured?: boolean;
  userEmail?: string;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [savingPassword, setSavingPassword] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function handlePasswordSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (savingPassword || !configured) return;

    setPasswordError(undefined);
    setConfirmError(undefined);

    if (password.length < 8) {
      setPasswordError("Use at least 8 characters.");
      passwordRef.current?.focus();
      return;
    }
    if (confirm !== password) {
      setConfirmError("Passwords do not match.");
      return;
    }

    setSavingPassword(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setConfirm("");
      toast.success("Password saved");
      window.location.assign(APP_ENTRY_PATH);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save password.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <AuthShell>
      <AnimatedPageTitle
        text="Finish sign-in"
        className="text-[30px] font-medium leading-tight tracking-[-0.02em] md:text-[34px]"
      />
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--creed-text-secondary)]">
        Your invite is tied to{" "}
        <span className="font-medium text-[var(--creed-text-primary)]">
          {userEmail ?? "this email"}
        </span>
        . Add a password to finish setting up your account.
      </p>

      <form onSubmit={handlePasswordSubmit} noValidate className="mt-8 flex flex-col gap-3">
        <PasswordField
          inputRef={passwordRef}
          label="Password"
          autoComplete="new-password"
          value={password}
          disabled={savingPassword || !configured}
          error={passwordError}
          onChange={(value) => {
            setPassword(value);
            if (passwordError) setPasswordError(undefined);
          }}
        />
        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          value={confirm}
          disabled={savingPassword || !configured}
          error={confirmError}
          onChange={(value) => {
            setConfirm(value);
            if (confirmError) setConfirmError(undefined);
          }}
        />
        <AuthSubmitButton
          label="Save password"
          loading={savingPassword}
          disabled={savingPassword || !configured}
        />
      </form>

      <Link
        href="/"
        className="mt-6 inline-flex w-full justify-center text-[14px] font-medium text-[var(--creed-text-primary)] transition-colors hover:text-[#2563EB]"
      >
        Continue to Creed
      </Link>
    </AuthShell>
  );
}
