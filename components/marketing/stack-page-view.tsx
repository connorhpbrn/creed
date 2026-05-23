"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  ArrowUpRightIcon,
  type ArrowUpRightIconHandle,
} from "@/components/ui/arrow-up-right";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/site-chrome";

const lightApostlesImage = "/assets/landing/backgrounds/light-apostles.avif";
const darkApostlesImage = "/assets/landing/backgrounds/dark-apostles.avif";

const lastUpdated = "8 April 2026";

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
      <section className="relative h-60 overflow-hidden bg-[#e9e5de] dark:bg-[#0e0e0d] md:h-72">
        <div className="absolute inset-x-0 top-0 h-screen">
          <Image
            src={lightApostlesImage}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center dark:hidden"
          />
          <Image
            src={darkApostlesImage}
            alt=""
            fill
            sizes="100vw"
            className="hidden object-cover object-center dark:block"
          />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,31,60,0.16)_0%,rgba(15,31,60,0.08)_28%,rgba(15,31,60,0.05)_56%,rgba(255,255,255,0)_76%)] dark:bg-[linear-gradient(180deg,rgba(0,0,0,0.32)_0%,rgba(0,0,0,0.18)_28%,rgba(0,0,0,0.08)_56%,rgba(0,0,0,0)_76%)]" />
        <div className="absolute -bottom-[22%] left-[-10%] h-[58%] w-[46%] rounded-[100%] bg-white/82 blur-[112px] dark:bg-[#0e0e0d]/82" />
        <div className="absolute -bottom-[22%] right-[-10%] h-[58%] w-[46%] rounded-[100%] bg-white/82 blur-[112px] dark:bg-[#0e0e0d]/82" />
        <div className="absolute left-1/2 bottom-[-14%] h-[34%] w-[64%] -translate-x-1/2 rounded-[100%] bg-white/40 blur-[128px] dark:bg-[#0e0e0d]/45" />
        <div className="absolute inset-x-0 bottom-0 h-[72%] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(249,249,248,0.025)_20%,rgba(249,249,248,0.14)_42%,rgba(249,249,248,0.48)_68%,rgba(249,249,248,0.86)_86%,#f9f9f8_100%)] dark:bg-[linear-gradient(180deg,rgba(14,14,13,0)_0%,rgba(14,14,13,0.04)_20%,rgba(14,14,13,0.18)_42%,rgba(14,14,13,0.52)_68%,rgba(14,14,13,0.88)_86%,#0e0e0d_100%)]" />
        <div className="absolute left-1/2 bottom-[-24%] h-[54%] w-[148%] -translate-x-1/2 rounded-[50%_50%_0_0] bg-[var(--creed-background)]/82 blur-[26px]" />
        <div className="relative z-10 flex flex-col px-6 py-5 md:px-10 md:py-7">
          <MarketingHeader configured scrolled={scrolled} />
        </div>
      </section>

      <motion.main className="mx-auto max-w-4xl px-6 pb-20 pt-8 md:px-10 md:pb-24 md:pt-10" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0, ease: [0.16, 1, 0.3, 1] }}>
        <div className="border-b border-[var(--creed-border)] pb-8">
          <AnimatedPageTitle
            delay={0.24}
            text="Creed Stack"
            className="t-section text-[var(--creed-text-primary)]"
          />
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.46, delay: 0.42, ease: [0.16, 1, 0.3, 1] }} className="mt-5 max-w-2xl text-[18px] leading-8 text-[var(--creed-text-secondary)]">
            The technology Creed uses to run, store, and process your data.
          </motion.p>
        </div>

        <div className="border-b border-[var(--creed-border)] pb-8 pt-8 text-[14px] text-[var(--creed-text-secondary)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <span>
              <span className="text-[var(--creed-text-tertiary)]">Last updated</span> {lastUpdated}
            </span>
          </div>
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
      </motion.main>

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
