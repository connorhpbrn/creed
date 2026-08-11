"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, X } from "lucide-react";
import {
  ArrowUpRightIcon,
  type ArrowUpRightIconHandle,
} from "@creed/ui/arrow-up-right";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import {
  MarketingFooter,
  MarketingHeroBanner,
} from "@/components/marketing/site-chrome";
import { useLandingAuthState } from "@/components/marketing/use-landing-auth-state";
import {
  useStripeCheckout,
  type CheckoutPlan,
} from "@creed/cloud/components/marketing/use-stripe-checkout";
import { GoogleSignInButton } from "@creed/cloud/components/auth/google-sign-in-button";
import { GITHUB_URL } from "@/lib/branding";
import {
  CLOUD_PRICING,
  type BillingCycle,
} from "@/lib/marketing/pricing";
import { cn } from "@creed/ui/utils";

type Feature = { label: string; included: boolean };

const OPEN_FEATURES: Feature[] = [
  { label: "Unlimited Creeds", included: true },
  { label: "Bring your own models", included: true },
  { label: "Fully managed", included: false },
  { label: "Automatic backups & updates", included: false },
  { label: "$5/mo AI credits included", included: false },
];

function cloudFeatures(): Feature[] {
  return OPEN_FEATURES.map((feature) => ({ ...feature, included: true }));
}

// Per-cycle price + copy for the Personal and Shared cards live in
// lib/marketing/pricing.ts so the cards, the crawlable reference table, the
// Offer schema, and the llms files all quote one set of numbers. The Shared
// plan is live and purchasable; both cards run the real checkout.

export function PricingPageView({ reference }: { reference?: ReactNode }) {
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
  const cloud = CLOUD_PRICING[cycle];
  const billing = useBillingSummary();

  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <MarketingHeroBanner configured scrolled={scrolled} />

      {/* Two plans instead of three, so the page narrows to match rather than
          stretching two cards across a three-card container. max-w-3xl over two
          columns lands within a few pixels of the card width max-w-6xl gave
          over three, so a card looks exactly as it always did. */}
      <main
        className={cn(
          "mx-auto px-6 pb-20 pt-8 md:px-10 md:pb-24 md:pt-10",
          "max-w-3xl"
        )}
      >
        <div className="flex flex-col gap-6 border-b border-[var(--creed-border)] pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <AnimatedPageTitle text="Pricing" />
            <p className="t-lede mt-5 max-w-2xl text-[var(--creed-text-secondary)]">
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
          <div
            className={cn(
              "grid gap-4 md:gap-5",
              "md:grid-cols-2"
            )}
          >
            <PricingCard
              name="Open"
              nameClassName="text-[var(--creed-border-strong)]"
              price="$0"
              cadence="forever"
              tagline="Self-host the open source build for free."
              features={OPEN_FEATURES}
              cta={{
                kind: "external",
                label: "View on GitHub",
                href: githubHref,
                style: "outline",
              }}
            />
            <PricingCard
              name="Cloud"
              nameClassName="text-[var(--creed-accent)]"
              price={cloud.price}
              cadence={cloud.cadence}
              tagline={cloud.tagline}
              features={cloudFeatures()}
              cta={{ kind: "plan", plan: "personal", cycle }}
              billing={billing}
            />
          </div>

          <p className="mt-7 text-center text-[13px] leading-6 text-[var(--creed-text-tertiary)]">
            Same product. Cloud covers hosting, credits, backups, and operations.
          </p>
        </section>

        {reference}
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
  ];

  return (
    <div className="relative isolate inline-flex items-center rounded-sm bg-[var(--creed-surface)] p-1">
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
                className="absolute inset-0 -z-10 rounded-[7px] bg-[var(--creed-accent)]"
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
  billing,
}: {
  name: string;
  nameClassName: string;
  price: string;
  cadence: string;
  tagline: string;
  features: Feature[];
  cta: PricingCardCta;
  billing?: BillingSummary;
}) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl bg-[var(--creed-surface)] p-6 md:p-7">
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
              {feature.included ? (
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
          <PlanCta plan={cta.plan} cycle={cta.cycle} billing={billing} />
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
      <span className="text-[14px] font-medium text-[var(--creed-text-secondary)]">
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

function useBillingPortal() {
  const [opening, setOpening] = useState(false);

  async function openPortal() {
    if (opening) return;
    setOpening(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Couldn't open billing");
      }
      window.location.href = data.url;
    } catch {
      setOpening(false);
    }
  }

  return { openPortal, opening };
}

// Lightweight billing summary for the pricing CTAs. Composes the marketing
// auth state with a single /api/stripe/status read so the cards can tell
// owner / subscriber / unpaid / signed-out apart.
type PlanBillingStatus = {
  paid: boolean;
  interval: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

type BillingSummary = {
  authState: ReturnType<typeof useLandingAuthState>;
  access: boolean;
  personal?: PlanBillingStatus;
};

type CachedBillingSummary = Omit<BillingSummary, "authState">;

const EMPTY_BILLING_SUMMARY: CachedBillingSummary = {
  access: false,
};

const BILLING_SUMMARY_CACHE_KEY = "creed:pricing-billing-summary";
let cachedBillingSummary: CachedBillingSummary | null = null;

function readCachedBillingSummary(): CachedBillingSummary | null {
  if (cachedBillingSummary) return cachedBillingSummary;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(BILLING_SUMMARY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBillingSummary;
    cachedBillingSummary = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedBillingSummary(summary: CachedBillingSummary | null) {
  cachedBillingSummary = summary;
  if (typeof window === "undefined") return;
  try {
    if (summary) {
      window.sessionStorage.setItem(BILLING_SUMMARY_CACHE_KEY, JSON.stringify(summary));
    } else {
      window.sessionStorage.removeItem(BILLING_SUMMARY_CACHE_KEY);
    }
  } catch {
    /* storage can be unavailable in private or restricted browser contexts */
  }
}

function useBillingSummary(): BillingSummary {
  const authState = useLandingAuthState();
  const [summary, setSummary] = useState<CachedBillingSummary>(
    () => readCachedBillingSummary() ?? EMPTY_BILLING_SUMMARY,
  );

  useEffect(() => {
    if (authState !== "signed-in") {
      writeCachedBillingSummary(null);
      setSummary(EMPTY_BILLING_SUMMARY);
      return;
    }
    let active = true;
    fetch("/api/stripe/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: {
        paid?: boolean;
        personal?: PlanBillingStatus;
      } | null) => {
        if (active && data) {
          const nextSummary: CachedBillingSummary = {
            access: Boolean(data.paid),
            personal: data.personal,
          };
          writeCachedBillingSummary(nextSummary);
          setSummary(nextSummary);
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

function planCycleFromStatus(status: PlanBillingStatus | undefined): BillingCycle | null {
  if (!status?.paid) return null;
  return status.interval === "year" ? "yearly" : "monthly";
}

function PlanCta({
  plan,
  cycle,
  billing,
}: {
  plan: CheckoutPlan;
  cycle: BillingCycle;
  billing?: BillingSummary;
}) {
  const fallbackBilling = useBillingSummary();
  const summary = billing ?? fallbackBilling;
  const { authState } = summary;
  const { startCheckout, submitting } = useStripeCheckout();
  const { openPortal, opening } = useBillingPortal();

  const tone: "blue" | "amber" = "blue";
  const ownedStatus = summary.personal;
  const ownedCycle = planCycleFromStatus(ownedStatus);

  if (ownedCycle === "monthly" || ownedCycle === "yearly") {
    const label =
      cycle === ownedCycle
        ? "Manage billing"
        : cycle === "yearly"
          ? "Switch to yearly"
          : "Switch to monthly";
    return (
      <button
        type="button"
        onClick={() => void openPortal()}
        disabled={opening}
        className={ctaClass("solid", tone)}
      >
        {opening ? "Opening" : label}
      </button>
    );
  }

  // Signed out: hand off to Google sign-in, then back to pricing so they can
  // buy Cloud without being forced through onboarding.
  if (authState === "signed-out") {
    return (
      <GoogleSignInButton
        label="Get Started"
        showIcon={false}
        redirectTo="/pricing"
        className={ctaClass("solid", tone)}
      />
    );
  }

  // Signed in but unpaid (or auth still resolving - show the same button so the
  // layout doesn't jump). Start checkout for this card's plan + mode directly.
  return (
    <button
      type="button"
      onClick={() => void startCheckout({ plan, cadence: cycle, returnTo: "/pricing" })}
      disabled={submitting}
      className={ctaClass("solid", tone)}
    >
      {submitting ? "Starting" : "Get Started"}
    </button>
  );
}

function ctaClass(
  style: "solid" | "outline",
  tone: "blue" | "amber" = "blue",
) {
  if (style === "solid") {
    // Shared CTAs are amber to match the "Shared" wordmark; everything else
    // is the blue primary.
    const color =
      tone === "amber"
        ? "bg-[#F59E0B] hover:bg-[#D97706] dark:bg-[#F5A623] dark:hover:bg-[#E0951E]"
        : "bg-[var(--creed-accent)] hover:bg-[var(--creed-accent-hover)]";
    return `inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md ${color} px-4 text-[14px] font-medium text-white transition-colors disabled:opacity-70`;
  }
  return "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-[var(--creed-border)] bg-transparent px-4 text-[14px] font-medium text-[var(--creed-text-primary)] transition-colors hover:bg-[var(--creed-surface-raised)]";
}
