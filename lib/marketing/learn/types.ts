// Content model for /learn guides. Articles are typed data, not MDX, so they
// render 100% server-side with the site's exact styling and ship no client JS
// and no new dependency. Each article is one file under lib/marketing/learn/
// exporting an `Article`; index.ts registers them.

import type { FaqItem } from "@/lib/marketing/faq";

// A block of article body. Kept deliberately small so authoring stays simple
// and every block has a single, predictable server-rendered shape.
export type ArticleBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; caption?: string; headers: string[]; rows: string[][] }
  | { type: "code"; lang?: string; code: string }
  | { type: "quote"; text: string };

export type LearnCluster =
  | "category"
  | "problem"
  | "comparison"
  | "integration"
  | "company";

export type RelatedLink = { label: string; href: string };

export type Article = {
  slug: string;
  // Used verbatim as the <h1> and, with the "| Creed" template, the <title>.
  title: string;
  // Meta description. Written to directly answer the query in one sentence.
  description: string;
  cluster: LearnCluster;
  // ISO dates. dateModified drives freshness metadata; keep it current when
  // the article changes.
  datePublished: string;
  dateModified: string;
  // The lead answer: 150-200 words that completely answer the query, rendered
  // right under the H1. This is the passage AI engines lift, so it must stand
  // alone. Paragraphs are separated by a blank line.
  lead: string;
  body: ArticleBlock[];
  faq: FaqItem[];
  // 3-5 related links: other /learn slugs (as "/learn/<slug>"). The trailing
  // product CTA is appended by the article renderer, not stored per article.
  related: RelatedLink[];
};

// Display metadata for each cluster, used by the /learn index to group and
// order the guides.
export const CLUSTER_META: Record<
  LearnCluster,
  { title: string; blurb: string; order: number }
> = {
  category: {
    title: "The personal context file",
    blurb: "What it is, what goes in it, and how to write one.",
    order: 1,
  },
  problem: {
    title: "Common problems",
    blurb: "Why AI keeps forgetting you, and what actually fixes it.",
    order: 2,
  },
  comparison: {
    title: "Comparisons",
    blurb: "How Creed sits next to chatbot memory and the memory tools.",
    order: 3,
  },
  integration: {
    title: "Connect your tools",
    blurb: "Wire one context file into the agents you already use.",
    order: 4,
  },
  company: {
    title: "For teams",
    blurb: "One shared context file every agent in your company reads.",
    order: 5,
  },
};
