// Content model for /learn guides. Articles are typed data, not MDX, so they
// render 100% server-side with the site's exact styling and ship no client JS
// and no new dependency. Each article is one file under lib/marketing/learn/
// exporting an `Article`; index.ts registers them.

import type { FaqItem } from "@/lib/marketing/faq";

export type ArticleBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[]; accent?: string }
  | { type: "ol"; items: string[] }
  | {
      type: "labeled-list";
      items: { label: string; text: string; color: string }[];
    }
  | { type: "table"; caption?: string; headers: string[]; rows: string[][] }
  | {
      type: "code";
      lang?: string;
      code: string;
      /** Optional token spans for creed-code-block hljs colours (same as /bench). */
      parts?: { text: string; className?: string }[];
    }
  | { type: "quote"; text: string }
  | { type: "context-perf-chart" }
  | { type: "tax-compound-chart" };

// Kept for typing existing articles; the index no longer groups by cluster.
export type LearnCluster =
  | "category"
  | "problem"
  | "comparison"
  | "integration"
  | "company";

export type RelatedLink = { label: string; href: string };

export type Article = {
  slug: string;
  title: string;
  description: string;
  cluster: LearnCluster;
  datePublished: string;
  dateModified: string;
  lead: string;
  body: ArticleBlock[];
  faq: FaqItem[];
  related: RelatedLink[];
};
