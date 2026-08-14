"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRightIcon,
  type ArrowUpRightIconHandle,
} from "@creed/ui/arrow-up-right";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import { MarketingFooter, MarketingHeroBanner } from "@/components/marketing/site-chrome";
import { useCreedEdition } from "@/components/creed/edition-provider";

const stackRows = [
  {
    name: "Supabase",
    purpose: "Backend, database, and authentication infrastructure",
    mobilePurpose: "Backend",
    website: "https://supabase.com",
  },
  {
    name: "Vercel",
    purpose: "Hosting and deployment infrastructure",
    mobilePurpose: "Deployment",
    website: "https://vercel.com",
  },
  {
    name: "Stripe",
    purpose: "Payment processing and billing",
    mobilePurpose: "Billing",
    website: "https://stripe.com",
    capability: "managedBilling",
  },
  {
    name: "OpenRouter",
    purpose: "AI model access for certain features",
    mobilePurpose: "Model access",
    website: "https://openrouter.ai",
  },
  {
    name: "Resend",
    purpose: "Transactional email delivery",
    mobilePurpose: "Email delivery",
    website: "https://resend.com",
    capability: "sharedCreeds",
  },
  {
    name: "GitHub",
    purpose: "Version control and optional Creed file sync",
    mobilePurpose: "Version control",
    website: "https://github.com",
  },
  {
    name: "Median",
    purpose: "Processes feedback submitted via the in-app modal",
    mobilePurpose: "Feedback",
    website: "https://median.sh",
    capability: "feedback",
  },
] as const;

export function StackPageView() {
  const { capabilities } = useCreedEdition();
  const [scrolled, setScrolled] = useState(false);
  const visibleRows = stackRows.filter(
    (row) => !("capability" in row) || capabilities[row.capability],
  );

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
        </div>

        <section className="py-8 md:py-10">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--creed-border)]">
                <th className="px-1 py-4 text-[15px] font-medium text-[var(--creed-text-tertiary)] md:px-2 md:text-[16px]">
                  Name
                </th>
                <th className="px-1 py-4 text-[15px] font-medium text-[var(--creed-text-tertiary)] md:px-2 md:text-[16px]">
                  Purpose
                </th>
                <th className="px-1 py-4 text-[15px] font-medium text-[var(--creed-text-tertiary)] md:px-2 md:text-[16px]">
                  Website
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr
                  key={row.name}
                  className={index === visibleRows.length - 1 ? "" : "border-b border-[var(--creed-border)]"}
                >
                  <td className="px-1 py-5 text-[16px] font-medium text-[var(--creed-text-primary)] md:px-2 md:text-[17px]">
                    {row.name}
                  </td>
                  <td className="px-1 py-5 text-[15px] leading-7 text-[var(--creed-text-secondary)] md:px-2 md:text-[16px]">
                    <span className="md:hidden">{row.mobilePurpose}</span>
                    <span className="hidden md:inline">{row.purpose}</span>
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
      className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[var(--creed-accent)] transition-colors hover:text-[var(--creed-accent-hover)] md:text-[16px]"
    >
      {label}
      <ArrowUpRightIcon ref={arrowRef} size={16} className="inline-flex h-4 w-4 items-center justify-center" />
    </a>
  );
}
