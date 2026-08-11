"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@creed/ui/button";
import { Input } from "@creed/ui/input";

export function OpenOwnerClaimForm({ nextPath = "/" }: { nextPath?: string }) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!secret || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/open/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Could not claim this installation.");
      }
      window.location.assign(nextPath);
    } catch (claimError) {
      setError(
        claimError instanceof Error
          ? claimError.message
          : "Could not claim this installation.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 space-y-4">
      <div>
        <label
          htmlFor="owner-secret"
          className="mb-2 block text-[13px] font-medium text-[var(--creed-text-secondary)]"
        >
          Owner secret
        </label>
        <Input
          id="owner-secret"
          type="password"
          autoComplete="current-password"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          placeholder="Paste CREED_OWNER_SECRET"
          className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4"
          autoFocus
        />
      </div>
      {error ? (
        <p role="alert" className="text-[13px] leading-5 text-[var(--creed-danger)]">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={!secret || submitting}
        className="h-11 w-full rounded-xl bg-[var(--creed-text-primary)] text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]"
      >
        Open Creed
        {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
      </Button>
    </form>
  );
}
