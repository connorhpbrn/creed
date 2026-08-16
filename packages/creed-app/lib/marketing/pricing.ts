// Canonical pricing facts for the public site. One source of truth shared by:
//   - the interactive pricing cards (components/marketing/pricing-page-view.tsx)
//   - the always-visible, crawlable pricing reference (pricing-reference.tsx)
//   - the SoftwareApplication Offer schema (lib/seo/structured-data.ts)
//   - /llms.txt and /llms-full.txt
//
// Keeping every price in one module means a crawler, an AI answer engine, and a
// human reading the cards can never be quoted three different numbers. These
// are list prices shown to the buyer; the actual charge always uses the live
// Stripe price. Keep them in step with the Cloud prices in lib/stripe.ts.

export type BillingCycle = "monthly" | "yearly";

export type CardPricing = { price: string; cadence: string; tagline: string };

export const CLOUD_PRICING: Record<BillingCycle, CardPricing> = {
  monthly: {
    price: "$12",
    cadence: "/mo",
    tagline: "Managed hosting for every Creed you own.",
  },
  yearly: {
    price: "$120",
    cadence: "/yr",
    tagline: "Managed hosting, billed yearly.",
  },
};

// A flat, human-and-crawler-readable description of every plan. This is what
// the crawlable reference table and the plain-text llms files render from, so
// an AI asked "how much does Creed cost" reads the same facts a visitor sees.
export type PlanFact = {
  name: string;
  price: string;
  cadence: string;
  summary: string;
  usage: string;
  details?: string;
};

export const PLAN_FACTS: PlanFact[] = [
  {
    name: "Open",
    price: "$0",
    cadence: "forever",
    summary:
      "Self-host Personal Creeds with MCP, GitHub version control, import, and export.",
    usage: "Bring your own OpenRouter API key.",
  },
  {
    name: "Cloud, monthly",
    price: "$12",
    cadence: "per month",
    summary:
      "In development. Public availability and final pricing will be announced before launch.",
    usage: "Managed usage is being tested.",
    details: "See the roadmap for progress.",
  },
  {
    name: "Cloud, yearly",
    price: "$120",
    cadence: "per year",
    summary: "In development. Public availability and final pricing will be announced before launch.",
    usage: "Managed usage is being tested.",
    details: "See the roadmap for progress.",
  },
];

// One-line pricing summary reused in plain-text surfaces (llms.txt).
export const PRICING_ONE_LINER =
  "Creed Open is free and MIT licensed. It supports self-hosted Personal Creeds and uses your own OpenRouter key. Creed Cloud is in development.";
