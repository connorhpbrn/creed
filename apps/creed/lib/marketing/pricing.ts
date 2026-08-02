// Canonical pricing facts for the public site. One source of truth shared by:
//   - the interactive pricing cards (components/marketing/pricing-page-view.tsx)
//   - the always-visible, crawlable pricing reference (pricing-reference.tsx)
//   - the SoftwareApplication Offer schema (lib/seo/structured-data.ts)
//   - /llms.txt and /llms-full.txt
//
// Keeping every price in one module means a crawler, an AI answer engine, and a
// human reading the cards can never be quoted three different numbers. These
// are list prices shown to the buyer; the actual charge always uses the live
// Stripe price. Keep them in step with the Stripe prices and lib/seat-config.ts.

export type BillingCycle = "monthly" | "yearly" | "lifetime";

export type CardPricing = { price: string; cadence: string; tagline: string };

export const PERSONAL_PRICING: Record<BillingCycle, CardPricing> = {
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

export const COMPANY_PRICING: Record<BillingCycle, CardPricing> = {
  monthly: {
    price: "$129",
    cadence: "/mo",
    tagline: "10 seats, then $12/mo each.",
  },
  yearly: {
    price: "$999",
    cadence: "/yr",
    tagline: "10 seats, then $99/yr each.",
  },
  lifetime: {
    price: "$1,999",
    cadence: "one-time",
    tagline: "10 lifetime seats, then $199 each.",
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
  seats?: string;
};

export const PLAN_FACTS: PlanFact[] = [
  {
    name: "Open",
    price: "$0",
    cadence: "forever",
    summary:
      "Self-host the open source build. Full Creed editor, all MCP connections, and quality scoring. No hosted sync, backups, or storage.",
    usage: "Bring your own AI key.",
  },
  {
    name: "Personal, monthly",
    price: "$12",
    cadence: "per month",
    summary:
      "Hosted Creed for one person. Cross-device sync, backups, and managed auth and storage.",
    usage: "$5 per month of usage included, BYOK available.",
  },
  {
    name: "Personal, yearly",
    price: "$99",
    cadence: "per year",
    summary: "The monthly Personal plan billed once a year.",
    usage: "$5 per month of usage included, BYOK available.",
  },
  {
    name: "Personal, lifetime",
    price: "$199",
    cadence: "one-time",
    summary: "Personal, hosted and yours forever with a single payment.",
    usage: "$20 one-time usage credit, BYOK available.",
  },
  {
    name: "Company, monthly",
    price: "$129",
    cadence: "per month",
    summary:
      "One shared Company Creed every member's agents read, with member roles, an activity view across the team, and admin controls.",
    usage: "$50 per month of usage included, BYOK available.",
    seats: "10 seats included, then $12 per month for each extra seat.",
  },
  {
    name: "Company, yearly",
    price: "$999",
    cadence: "per year",
    summary: "The monthly Company plan billed once a year.",
    usage: "$50 per month of usage included, BYOK available.",
    seats: "10 seats included, then $99 per year for each extra seat.",
  },
  {
    name: "Company, lifetime",
    price: "$1,999",
    cadence: "one-time",
    summary: "A shared Company Creed owned forever with a single payment.",
    usage: "$200 one-time usage credit, BYOK available.",
    seats: "10 lifetime seats included, then $199 for each extra lifetime seat.",
  },
];

// One-line pricing summary reused in plain-text surfaces (llms.txt).
export const PRICING_ONE_LINER =
  "Open source is free to self-host. Personal hosting is $12/mo, $99/yr, or $199 lifetime. The Company plan is $129/mo, $999/yr, or $1,999 lifetime for 10 seats, with extra seats available. All hosted plans support BYOK.";
