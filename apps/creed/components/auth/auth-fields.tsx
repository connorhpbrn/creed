"use client";

// Shared form primitives for the auth surface (/login, /signup,
// /reset-password): the text field, the password field with the animated eye
// toggle, the checkbox, and the submit button with the animated arrow. Kept
// here so every auth screen stays visually and behaviourally identical.

import { useState, type ReactNode, type Ref } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { ArrowRightIcon } from "@/components/ui/arrow-right";
import { EyeToggleIcon } from "@/components/ui/eye-toggle";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { cn } from "@/lib/utils";

type AuthFieldProps = {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  disabled?: boolean;
  error?: string;
  trailing?: ReactNode;
  ref?: Ref<HTMLInputElement>;
};

export function AuthField({
  ref,
  label,
  type,
  value,
  onChange,
  autoComplete,
  disabled,
  error,
  trailing,
}: AuthFieldProps) {
  return (
    <div>
      <div className="relative">
        <input
          ref={ref}
          type={type}
          placeholder={label}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          autoComplete={autoComplete}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "h-12 w-full rounded-[var(--radius-md)] border bg-[var(--creed-surface)] px-4 text-[15px] text-[var(--creed-text-primary)] outline-none transition-colors placeholder:text-[var(--creed-text-tertiary)] focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60",
            trailing ? "pr-12" : "",
            error
              ? "border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]/15"
              : "border-[var(--creed-border)] focus:border-[var(--creed-accent)] focus:ring-[var(--creed-accent)]/15"
          )}
        />
        {trailing ? (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>
        ) : null}
      </div>
      {error ? <p className="mt-1.5 text-[13px] text-[#DC2626]">{error}</p> : null}
    </div>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  error,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  disabled?: boolean;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [show, setShow] = useState(false);
  const eyeShake = useAnimatedIconControls(0, undefined, 600);

  return (
    <AuthField
      ref={inputRef}
      type={show ? "text" : "password"}
      label={label}
      autoComplete={autoComplete}
      value={value}
      onChange={onChange}
      disabled={disabled}
      error={error}
      trailing={
        <button
          type="button"
          tabIndex={-1}
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow((v) => !v)}
          onMouseEnter={eyeShake.start}
          onMouseLeave={eyeShake.settle}
          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--creed-text-tertiary)] transition-colors hover:text-[var(--creed-accent)]"
        >
          <EyeToggleIcon
            ref={eyeShake.iconRef}
            off={show}
            size={18}
            className="inline-flex items-center justify-center"
          />
        </button>
      }
    />
  );
}

export function AuthCheckbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        checked
          ? "border-[var(--creed-accent)] bg-[var(--creed-accent)] text-white"
          : "border-[var(--creed-border-strong)] bg-[var(--creed-surface)] hover:border-[var(--creed-text-tertiary)]"
      )}
    >
      {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
    </button>
  );
}

export function AuthSubmitButton({
  label,
  loading,
  disabled,
}: {
  label: string;
  loading: boolean;
  disabled?: boolean;
}) {
  const arrow = useAnimatedIconControls(80, undefined, 420);

  return (
    <button
      type="submit"
      disabled={disabled}
      onMouseEnter={arrow.start}
      onMouseLeave={arrow.settle}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse") arrow.start();
      }}
      className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--creed-accent)] text-[15px] font-medium text-white transition-colors hover:bg-[var(--creed-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
      {loading ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <ArrowRightIcon
          ref={arrow.iconRef}
          size={16}
          className="inline-flex shrink-0 items-center justify-center leading-none"
        />
      )}
    </button>
  );
}
