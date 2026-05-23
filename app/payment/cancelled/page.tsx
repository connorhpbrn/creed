import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Checkout cancelled · Creed",
  description: "Your checkout was cancelled. No payment was taken.",
};

export default function PaymentCancelledPage() {
  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="t-section text-[var(--creed-text-primary)]">Checkout cancelled</h1>
        <p className="mt-4 max-w-sm text-[15px] leading-7 text-[var(--creed-text-secondary)]">
          No charge was made. Whenever you&apos;re ready, head back to pricing and
          start again.
        </p>
        <Link
          href="/pricing"
          className="mt-8 inline-flex h-11 items-center justify-center rounded-md bg-[#2563EB] px-6 text-[14px] font-medium text-white transition-colors hover:bg-[#1D4ED8]"
        >
          Back to pricing
        </Link>
      </div>
    </div>
  );
}
