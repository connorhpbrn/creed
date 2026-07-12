// Schema.org structured data (JSON-LD) builders for the public site.
//
// These power rich results in classic search and, more importantly, give
// answer engines (AI Overviews, Perplexity, ChatGPT) a machine-readable
// description of what Creed is, what it costs, and the questions it answers.
// Everything is first-party constant data resolved against the deploy origin,
// so it stays accurate without per-request work.
//
// Render the output through <JsonLd> (components/marketing/json-ld.tsx).

import { GITHUB_URL, INSTAGRAM_URL, TWITTER_URL } from "@/lib/branding";
import type { FaqItem } from "@/lib/marketing/faq";
import { getSiteUrl } from "@/lib/supabase/env";

const SITE_NAME = "Creed";
const SITE_TAGLINE = "The personal context file every AI reads.";
const SITE_DESCRIPTION =
  "Creed is one personal context file that every AI reads before it answers. Written once, kept current by your agents, and portable across every tool you use.";

function base() {
  return getSiteUrl().replace(/\/$/, "");
}

function organizationId() {
  return `${base()}/#organization`;
}

function websiteId() {
  return `${base()}/#website`;
}

// The brand entity. `sameAs` ties the site to its off-site profiles, which is
// one of the signals engines use to resolve "Creed" to a real organization
// rather than a common noun.
export function organizationSchema() {
  const url = base();
  const sameAs = [GITHUB_URL, TWITTER_URL, INSTAGRAM_URL].filter(Boolean);

  return {
    "@type": "Organization",
    "@id": organizationId(),
    name: SITE_NAME,
    url,
    logo: `${url}/opengraph-image.jpg`,
    description: SITE_DESCRIPTION,
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

export function websiteSchema() {
  const url = base();

  return {
    "@type": "WebSite",
    "@id": websiteId(),
    name: SITE_NAME,
    url,
    description: SITE_TAGLINE,
    publisher: { "@id": organizationId() },
  };
}

// The product itself. Offers mirror the live pricing (free self-host, Personal
// $12/mo, $99/yr, $199 lifetime, and the live Company plan $129/mo, $999/yr,
// $1,999 lifetime) so a price quoted in an AI answer matches the pricing page.
export function softwareApplicationSchema() {
  const url = base();
  const offer = (name: string, price: string) => ({
    "@type": "Offer",
    name,
    price,
    priceCurrency: "USD",
    url: `${url}/pricing`,
  });

  return {
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    url,
    description: SITE_DESCRIPTION,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web",
    image: `${url}/opengraph-image.jpg`,
    publisher: { "@id": organizationId() },
    offers: [
      { "@type": "Offer", name: "Free (self-host)", price: "0", priceCurrency: "USD" },
      offer("Personal (monthly)", "12"),
      offer("Personal (yearly)", "99"),
      offer("Personal (lifetime)", "199"),
      offer("Company (monthly)", "129"),
      offer("Company (yearly)", "999"),
      offer("Company (lifetime)", "1999"),
    ],
  };
}

export function faqPageSchema(items: FaqItem[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

// A WebPage node for a content page, optionally with breadcrumbs. Used by the
// marketing explainer pages so each reads as a defined entity tied to the
// site, not an orphan. Pass `dateModified` (ISO date) to signal freshness,
// which answer engines weight for time-sensitive queries; it must match the
// visible "Last updated" line on the page so the two never disagree.
export function webPageSchema({
  path,
  name,
  description,
  dateModified,
}: {
  path: string;
  name: string;
  description: string;
  dateModified?: string;
}) {
  const url = `${base()}${path}`;

  return {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name,
    description,
    isPartOf: { "@id": websiteId() },
    breadcrumb: { "@id": `${url}#breadcrumb` },
    ...(dateModified ? { dateModified } : {}),
  };
}

// An Article node for a /learn guide. Authored and published by the Creed
// organization; datePublished/dateModified drive the freshness signal that AI
// engines weight, so keep dateModified in step with the article's registry.
export function articleSchema({
  path,
  headline,
  description,
  datePublished,
  dateModified,
}: {
  path: string;
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
}) {
  const url = `${base()}${path}`;

  return {
    "@type": "Article",
    "@id": `${url}#article`,
    url,
    headline,
    description,
    datePublished,
    dateModified,
    isPartOf: { "@id": websiteId() },
    author: { "@id": organizationId() },
    publisher: { "@id": organizationId() },
    image: `${base()}/opengraph-image.jpg`,
  };
}

export function breadcrumbSchema(
  path: string,
  trail: { name: string; path: string }[]
) {
  const url = `${base()}${path}`;

  return {
    "@type": "BreadcrumbList",
    "@id": `${url}#breadcrumb`,
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${base()}${crumb.path}`,
    })),
  };
}

// Wrap a set of schema nodes into one @graph document. One script tag, shared
// @id references resolved across nodes - the shape Google recommends.
export function graph(...nodes: object[]) {
  return {
    "@context": "https://schema.org",
    "@graph": nodes,
  };
}
