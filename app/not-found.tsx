import Link from "next/link";

// 404 for any unmatched route under the app router. Stays branded so it
// reads as part of Creed rather than a Next.js default page.
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="t-section text-[var(--creed-text-primary)]">
        Page not found
      </h1>
      <p className="max-w-md text-[15px] leading-7 text-[var(--creed-text-secondary)]">
        That URL doesn&apos;t resolve to anything on Creed. Double-check the
        link, or jump back to a page we know exists.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <Link
          href="/home"
          className="inline-flex h-10 items-center justify-center rounded-md bg-[#2563EB] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[#1D4ED8]"
        >
          Back home
        </Link>
        <Link
          href="/pricing"
          className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--creed-border)] bg-transparent px-5 text-[14px] font-medium text-[var(--creed-text-primary)] transition-colors hover:bg-[var(--creed-surface-raised)]"
        >
          See pricing
        </Link>
      </div>
    </div>
  );
}
