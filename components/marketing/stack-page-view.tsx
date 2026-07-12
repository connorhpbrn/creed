"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRightIcon,
  type ArrowUpRightIconHandle,
} from "@/components/ui/arrow-up-right";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import { MarketingFooter, MarketingHeroBanner } from "@/components/marketing/site-chrome";

const stackRows = [
  {
    name: "Supabase",
    purpose: "Backend, database, and authentication infrastructure",
    website: "https://supabase.com",
  },
  {
    name: "Vercel",
    purpose: "Hosting and deployment infrastructure",
    website: "https://vercel.com",
  },
  {
    name: "Stripe",
    purpose: "Payment processing and billing",
    website: "https://stripe.com",
  },
  {
    name: "OpenRouter",
    purpose: "AI model access for certain features",
    website: "https://openrouter.ai",
  },
  {
    name: "Median",
    purpose: "Processes feedback submitted via the in-app modal",
    website: "https://median.sh",
  },
] as const;

export function StackPageView() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <MarketingHeroBanner configured scrolled={scrolled} />

      <main className="mx-auto max-w-4xl px-6 pb-20 pt-8 md:px-10 md:pb-24 md:pt-10">
        <div className="border-b border-[var(--creed-border)] pb-8">
          <AnimatedPageTitle text="Stack" />
          <p className="mt-5 max-w-2xl text-[18px] leading-8 text-[var(--creed-text-secondary)]">
            The technology Creed uses to run, store, and process your data.
          </p>
        </div>

        <section className="py-8 md:py-10">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--creed-border)]">
                <th className="px-1 py-4 text-[13px] font-medium text-[var(--creed-text-tertiary)] md:px-2">
                  Name
                </th>
                <th className="px-1 py-4 text-[13px] font-medium text-[var(--creed-text-tertiary)] md:px-2">
                  Purpose
                </th>
                <th className="px-1 py-4 text-[13px] font-medium text-[var(--creed-text-tertiary)] md:px-2">
                  Website
                </th>
              </tr>
            </thead>
            <tbody>
              {stackRows.map((row, index) => (
                <tr
                  key={row.name}
                  className={index === stackRows.length - 1 ? "" : "border-b border-[var(--creed-border)]"}
                >
                  <td className="px-1 py-5 text-[16px] font-medium text-[var(--creed-text-primary)] md:px-2 md:text-[17px]">
                    {row.name}
                  </td>
                  <td className="px-1 py-5 text-[15px] leading-7 text-[var(--creed-text-secondary)] md:px-2 md:text-[16px]">
                    {row.purpose}
                  </td>
                  <td className="px-1 py-5 md:px-2">
                    <StackLink href={row.website} label={row.website.replace(/^https?:\/\//, "")} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}

// External-link row used by the stack table. Hovering the anchor triggers
// the arrow's bounce-shrink animation via the icon's imperative handle.
function StackLink({ href, label }: { href: string; label: string }) {
  const arrowRef = useRef<ArrowUpRightIconHandle | null>(null);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onMouseEnter={() => arrowRef.current?.startAnimation()}
      onMouseLeave={() => arrowRef.current?.stopAnimation()}
      className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[#2563EB] transition-colors hover:text-[#1D4ED8] md:text-[16px]"
    >
      {label}
      <ArrowUpRightIcon ref={arrowRef} size={16} className="inline-flex h-4 w-4 items-center justify-center" />
    </a>
  );
}
