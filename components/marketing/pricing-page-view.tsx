"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { Check, Star, X } from "lucide-react";
import {
  ArrowUpRightIcon,
  type ArrowUpRightIconHandle,
} from "@/components/ui/arrow-up-right";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import {
  MarketingFooter,
  MarketingHeroBanner,
} from "@/components/marketing/site-chrome";
import { useLandingAuthState } from "@/components/marketing/use-landing-auth-state";
import {
  useStripeCheckout,
  type CheckoutPlan,
} from "@/components/marketing/use-stripe-checkout";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { GITHUB_URL } from "@/lib/branding";
import { cn } from "@/lib/utils";

type Feature = { label: string; included: boolean; star?: boolean };

type BillingCycle = "monthly" | "yearly" | "lifetime";

const SHARED_FEATURES: Feature[] = [
  { label: "Full Creed editor with rich components", included: true },
  { label: "All MCP connections and integrations", included: true },
  { label: "Quality scoring and inline diff review", included: true },
  { label: "Use credits or bring your own key", included: true },
];

const FREE_EXTRAS: Feature[] = [
  { label: "Managed backend, auth and storage", included: false },
  { label: "Cross-device sync and backups", included: false },
];

const PRO_EXTRAS: Feature[] = [
  { label: "Managed backend, auth and storage", included: true },
  { label: "Cross-device sync and backups", included: true },
];

// The Company card collapses all of Personal into a single ticked line, then
// lists the company-workspace exclusives as gold stars.
const COMPANY_FEATURES: Feature[] = [
  { label: "Everything in Personal", included: true },
  { label: "Shared Company Creed", included: true, star: true },
  { label: "Per-employee Work Creeds", included: true, star: true },
  { label: "Admin controls for members", included: true, star: true },
  {
    label: "Pooled company credits for AI features",
    included: true,
    star: true,
  },
  { label: "Priority support and updates", included: true, star: true },
];

// Per-cycle price + copy for the Personal and Company cards. Company is
// display-only (Coming Soon); its prices are placeholders until the tier ships.
type CardPricing = { price: string; cadence: string; tagline: string };

const PERSONAL_PRICING: Record<BillingCycle, CardPricing> = {
  monthly: {
    price: "$12",
    cadence: "/mo",
    tagline: "Solo access, billed monthly.",
  },
  yearly: {
    price: "$99",
    cadence: "/yr",
    tagline: "Solo access, billed yearly.",
  },
  lifetime: {
    price: "$199",
    cadence: "one-time",
    tagline: "Solo access, hosted and yours forever.",
  },
};

const COMPANY_PRICING: Record<BillingCycle, CardPricing> = {
  monthly: {
    price: "$199",
    cadence: "/mo",
    tagline: "Team access, billed monthly.",
  },
  yearly: {
    price: "$1,999",
    cadence: "/yr",
    tagline: "Team access, billed yearly.",
  },
  lifetime: {
    price: "$2,999",
    cadence: "one-time",
    tagline: "Team access, hosted and yours forever.",
  },
};

export function PricingPageView() {
  const [scrolled, setScrolled] = useState(false);
  // Monthly is the front door: the strategy is "subscribe to try, own it if
  // you love it", so the page opens on the monthly price.
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const githubHref = GITHUB_URL ?? "https://github.com";
  const personal = PERSONAL_PRICING[cycle];
  const company = COMPANY_PRICING[cycle];

  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <MarketingHeroBanner configured scrolled={scrolled} />

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-8 md:px-10 md:pb-24 md:pt-10">
        <div className="flex flex-col gap-6 border-b border-[var(--creed-border)] pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <AnimatedPageTitle
              text="Pricing"
              className="t-section text-[var(--creed-text-primary)]"
            />
            <p className="mt-5 max-w-2xl text-[18px] leading-8 text-[var(--creed-text-secondary)]">
              Run Creed yourself for free, or skip the setup and let us host it.
            </p>
          </div>

          {/* Sits on the right, baseline-aligned with the subtext above the
              separator. Stacks under the subtext on narrow screens. */}
          <div className="shrink-0">
            <BillingToggle cycle={cycle} onChange={setCycle} />
          </div>
        </div>

        <section className="py-10 md:py-12">
          <div className="grid gap-4 md:grid-cols-3 md:gap-5">
            <PricingCard
              name="Open"
              nameClassName="text-[var(--creed-border-strong)]"
              price="$0"
              cadence="forever"
              tagline="Self-host the open source build for free."
              features={[...SHARED_FEATURES, ...FREE_EXTRAS]}
              cta={{
                kind: "external",
                label: "View on GitHub",
                href: githubHref,
                style: "outline",
              }}
            />
            <PricingCard
              name="Personal"
              nameClassName="text-[#2563EB]"
              price={personal.price}
              cadence={personal.cadence}
              tagline={personal.tagline}
              features={[...SHARED_FEATURES, ...PRO_EXTRAS]}
              cta={{ kind: "plan", plan: "personal", cycle }}
            />
            <PricingCard
              name="Company"
              nameClassName="text-[#F59E0B] dark:text-[#F5A623]"
              price={company.price}
              cadence={company.cadence}
              tagline={company.tagline}
              features={COMPANY_FEATURES}
              cta={{ kind: "coming-soon", label: "Coming Soon" }}
            />
          </div>

          <p className="mt-7 text-center text-[13px] leading-6 text-[var(--creed-text-tertiary)]">
            All plans let you use Creed credits or bring your own OpenRouter API
            key for model spend.
          </p>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}

function BillingToggle({
  cycle,
  onChange,
}: {
  cycle: BillingCycle;
  onChange: (cycle: BillingCycle) => void;
}) {
  const options: { value: BillingCycle; label: string }[] = [
    { value: "monthly", label: "Monthly" },
    { value: "yearly", label: "Yearly" },
    { value: "lifetime", label: "Lifetime" },
  ];

  return (
    <div className="relative inline-flex items-center rounded-[10px] bg-[var(--creed-surface)] p-1">
      {options.map((option) => {
        const active = cycle === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className="relative z-10 rounded-[7px] px-3.5 py-1.5 text-[13px] font-medium transition-colors"
          >
            {active ? (
              <motion.span
                layoutId="billing-toggle-pill"
                className="absolute inset-0 -z-10 rounded-[7px] bg-[#2563EB]"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span
              className={cn(
                active ? "text-white" : "text-[var(--creed-text-secondary)]",
              )}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

type PricingCardCta =
  | {
      kind: "external";
      label: string;
      href: string;
      style: "solid" | "outline";
    }
  | { kind: "plan"; plan: CheckoutPlan; cycle: BillingCycle }
  | { kind: "coming-soon"; label: string };

function PricingCard({
  name,
  nameClassName,
  price,
  cadence,
  tagline,
  features,
  cta,
}: {
  name: string;
  nameClassName: string;
  price: string;
  cadence: string;
  tagline: string;
  features: Feature[];
  cta: PricingCardCta;
}) {
  return (
    <div className="flex flex-col rounded-[20px] bg-[var(--creed-surface)] p-6 md:p-7">
      <div>
        <div
          className={cn(
            "text-[40px] font-semibold leading-none tracking-[-0.02em]",
            nameClassName,
          )}
        >
          {name}
        </div>
        <div className="mt-5">
          <PriceRow price={price} cadence={cadence} />
        </div>
        <p className="mt-3 text-[14px] leading-6 text-[var(--creed-text-secondary)]">
          {tagline}
        </p>
      </div>

      <div className="my-6 h-px bg-[var(--creed-border)]" />

      <ul className="flex-1 space-y-2.5">
        {features.map((feature) => (
          <li key={feature.label} className="flex items-start gap-2.5">
            <span className="mt-[5px] inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center">
              {feature.star ? (
                <Star
                  className="h-[14px] w-[14px] fill-[#F59E0B] text-[#F59E0B] dark:fill-[#F5A623] dark:text-[#F5A623]"
                  strokeWidth={2.75}
                />
              ) : feature.included ? (
                <Check
                  className="h-[14px] w-[14px] text-[#16A34A]"
                  strokeWidth={2.75}
                />
              ) : (
                <X
                  className="h-[14px] w-[14px] text-[#DC2626] dark:text-[#F87171]"
                  strokeWidth={2.75}
                />
              )}
            </span>
            <span
              className={cn(
                "text-[14px] leading-6",
                feature.included
                  ? "text-[var(--creed-text-primary)]"
                  : "text-[var(--creed-text-tertiary)]",
              )}
            >
              {feature.label}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-7">
        {cta.kind === "external" ? (
          <ExternalCta cta={cta} />
        ) : cta.kind === "coming-soon" ? (
          <ComingSoonCta label={cta.label} />
        ) : (
          <PlanCta plan={cta.plan} cycle={cta.cycle} />
        )}
      </div>
    </div>
  );
}

// A single value (price or cadence) that rolls vertically with a slot-machine
// blur when it changes. The invisible sizer reserves the box (width + baseline)
// so the absolutely-positioned animated copies land in place and never shift
// the surrounding layout off-baseline.
function RollingValue({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-block align-baseline", className)}>
      <span aria-hidden className="invisible whitespace-nowrap">
        {value}
      </span>
      <AnimatePresence initial={false}>
        <motion.span
          key={value}
          // A slow, smooth blur cross-fade with a gentle vertical drift - the
          // old value softens and lifts away as the new one settles up through
          // a blur. One unified eased tween (no spring) keeps it calm and clean.
          initial={{ y: "0.4em", opacity: 0, filter: "blur(6px)" }}
          animate={{ y: "0em", opacity: 1, filter: "blur(0px)" }}
          exit={{ y: "-0.4em", opacity: 0, filter: "blur(6px)" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="absolute left-0 top-0 whitespace-nowrap"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// Price cluster: the price and the cadence, each rolling with a slot-machine
// blur (via RollingValue) when the billing cycle flips.
function PriceRow({ price, cadence }: { price: string; cadence: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[36px] font-semibold leading-none tracking-[-0.02em] text-[var(--creed-text-primary)]">
        <RollingValue value={price} />
      </span>
      <span className="text-[13px] font-medium text-[var(--creed-text-tertiary)]">
        <RollingValue value={cadence} />
      </span>
    </div>
  );
}

function ExternalCta({
  cta,
}: {
  cta: { label: string; href: string; style: "solid" | "outline" };
}) {
  const arrowRef = useRef<ArrowUpRightIconHandle | null>(null);
  return (
    <a
      href={cta.href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => arrowRef.current?.startAnimation()}
      onMouseLeave={() => arrowRef.current?.stopAnimation()}
      className={ctaClass(cta.style)}
    >
      {cta.label}
      {cta.style === "outline" ? (
        <ArrowUpRightIcon
          ref={arrowRef}
          size={16}
          className="inline-flex h-4 w-4 items-center justify-center"
        />
      ) : null}
    </a>
  );
}

function ComingSoonCta({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled
      className="inline-flex h-10 w-full cursor-default items-center justify-center gap-1.5 rounded-md bg-[#F59E0B] px-4 text-[14px] font-medium text-white dark:bg-[#F5A623]"
    >
      {label}
    </button>
  );
}

// Lightweight billing summary for the pricing CTAs. Composes the marketing
// auth state with a single /api/stripe/status read so the cards can tell
// owner / subscriber / unpaid / signed-out apart.
function useBillingSummary(): {
  authState: ReturnType<typeof useLandingAuthState>;
  access: boolean;
  billingMode: string | null;
} {
  const authState = useLandingAuthState();
  const [summary, setSummary] = useState<{
    access: boolean;
    billingMode: string | null;
  }>({
    access: false,
    billingMode: null,
  });

  useEffect(() => {
    if (authState !== "signed-in") {
      setSummary({ access: false, billingMode: null });
      return;
    }
    let active = true;
    fetch("/api/stripe/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { paid?: boolean; billingMode?: string | null } | null) => {
        if (active && data) {
          setSummary({
            access: Boolean(data.paid),
            billingMode: data.billingMode ?? null,
          });
        }
      })
      .catch(() => {
        /* treat as no access; the gate re-checks server-side anyway */
      });
    return () => {
      active = false;
    };
  }, [authState]);

  return { authState, ...summary };
}

/**
 * CTA for a purchasable plan. Resolves to one of:
 *
 *   lifetime owner             → "Owned" → /file (all cycles)
 *   subscriber, lifetime tab   → "Own it for $199" (upgrade-to-own)
 *   subscriber, monthly/yearly → "Current plan" → /file
 *   signed-in, unpaid          → "Get Started" → checkout(plan, cadence)
 *   signed-out                 → Google sign-in → /onboarding
 */
function PlanCta({ plan, cycle }: { plan: CheckoutPlan; cycle: BillingCycle }) {
  const { authState, access, billingMode } = useBillingSummary();
  const { startCheckout, submitting } = useStripeCheckout();

  // Owned outright - terminal state, no further purchase possible.
  if (access && billingMode === "lifetime") {
    return (
      <Link
        href="/file"
        className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-[#16A34A] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#15803d]"
      >
        <Check className="h-4 w-4" strokeWidth={2.75} />
        Owned
      </Link>
    );
  }

  // Active subscriber. The lifetime card offers the upgrade; the monthly card
  // shows their current plan and routes into the app.
  if (access && billingMode === "subscription") {
    if (cycle === "lifetime") {
      return (
        <button
          type="button"
          onClick={() => void startCheckout({ plan, cadence: "lifetime" })}
          disabled={submitting}
          className={ctaClass("solid")}
        >
          {submitting ? "Starting" : "Own it for $199"}
        </button>
      );
    }
    return (
      <Link
        href="/file"
        className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-[var(--creed-border)] bg-transparent px-4 text-[14px] font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)]"
      >
        Current plan
      </Link>
    );
  }

  // Signed out: hand off to Google sign-in, then the onboarding funnel (which
  // can't carry the chosen cycle through OAuth, so it always starts on the
  // monthly try-it path; yearly and lifetime are picked later once signed in).
  if (authState === "signed-out") {
    return (
      <GoogleSignInButton
        label="Get Started"
        showIcon={false}
        redirectTo="/onboarding"
        className={ctaClass("solid")}
      />
    );
  }

  // Signed in but unpaid (or auth still resolving - show the same button so the
  // layout doesn't jump). Start checkout for this card's plan + mode directly.
  return (
    <button
      type="button"
      onClick={() => void startCheckout({ plan, cadence: cycle })}
      disabled={submitting}
      className={ctaClass("solid")}
    >
      {submitting ? "Starting" : "Get Started"}
    </button>
  );
}

function ctaClass(style: "solid" | "outline") {
  if (style === "solid") {
    return "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-[#2563EB] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-70";
  }
  return "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-[var(--creed-border)] bg-transparent px-4 text-[14px] font-medium text-[var(--creed-text-primary)] transition-colors hover:bg-[var(--creed-surface-raised)]";
}
