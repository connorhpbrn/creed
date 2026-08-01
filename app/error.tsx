"use client";

import { useEffect } from "react";
import Link from "next/link";

// Route-level error boundary. Catches errors thrown by any server or
// client component below the root segment that doesn't have its own
// nested `error.tsx`. Pairs with the existing `global-error.tsx`, which
// only fires when the root layout itself throws.
//
// Visual style mirrors the marketing surface (creed CSS variables,
// `t-section` headline) so the page doesn't look orphaned when it
// renders mid-flow.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to Vercel logs alongside the digest the user sees.
    console.error("[route-error]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="t-section text-[var(--creed-text-primary)]">
        Something went sideways
      </h1>
      <p className="max-w-md text-[15px] leading-7 text-[var(--creed-text-secondary)]">
        This is a temporary error. Try again, or head back to the home page -
        if it keeps happening, the digest below helps us track it down.
      </p>
      {error.digest ? (
        <code className="t-meta rounded-md bg-[var(--creed-surface-raised)] px-2.5 py-1 font-mono text-[12px] text-[var(--creed-text-tertiary)]">
          digest: {error.digest}
        </code>
      ) : null}
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--creed-accent)] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[var(--creed-accent-hover)]"
        >
          Try again
        </button>
        <Link
          href="/home"
          className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--creed-border)] bg-transparent px-5 text-[14px] font-medium text-[var(--creed-text-primary)] transition-colors hover:bg-[var(--creed-surface-raised)]"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
