import Link from "next/link";
import { Check, X } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { CodeCommand } from "@/components/marketing/code-command";
import { LearnArticleHeader } from "@/components/marketing/learn-article-header";
import { LearnContextPerfChart } from "@/components/marketing/learn-context-perf-chart";
import { LearnTaxCompoundChart } from "@/components/marketing/learn-tax-compound-chart";
import {
  MarketingFooter,
  MarketingHeroBanner,
} from "@/components/marketing/site-chrome";
import { FaqSection } from "@/components/marketing/faq-section";
import type { Article, ArticleBlock } from "@/lib/marketing/learn/types";
import { accentColorMap } from "@/lib/creed-data";

// Server-rendered article view for /learn/[slug]. Body, tables, FAQ, and
// related links ship in the initial HTML. Charts and the header icon are
// small client islands.

const PRODUCT_CTA = { label: "See how Creed works", href: "/home" };

function TableCell({ cell, isFirst }: { cell: string; isFirst: boolean }) {
  if (cell === "check") {
    return (
      <td className="px-4 py-3">
        <Check
          aria-label="Yes"
          className="h-4 w-4 text-[var(--creed-success)]"
          strokeWidth={2.5}
        />
      </td>
    );
  }
  if (cell === "cross") {
    return (
      <td className="px-4 py-3">
        <X
          aria-label="No"
          className="h-4 w-4"
          style={{ color: accentColorMap.boundaries }}
          strokeWidth={2.5}
        />
      </td>
    );
  }
  return (
    <td
      className={
        isFirst
          ? "px-4 py-3 font-medium text-[var(--creed-text-primary)]"
          : "px-4 py-3 text-[var(--creed-text-secondary)]"
      }
    >
      {cell}
    </td>
  );
}

function Block({ block }: { block: ArticleBlock }) {
  switch (block.type) {
    case "p":
      return (
        <p className="mt-5 text-[16px] leading-8 text-[var(--creed-text-secondary)]">
          {block.text}
        </p>
      );
    case "h2":
      return (
        <h2 className="mt-12 text-[24px] font-medium tracking-[-0.01em] text-[var(--creed-text-primary)] md:text-[28px]">
          {block.text}
        </h2>
      );
    case "h3":
      return (
        <h3 className="mt-8 text-[19px] font-medium text-[var(--creed-text-primary)]">
          {block.text}
        </h3>
      );
    case "ul":
      return (
        <ul className="mt-5 space-y-2.5">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="relative pl-5 text-[16px] leading-7 text-[var(--creed-text-secondary)]"
            >
              <span
                aria-hidden
                className="absolute left-0 top-[10px] h-2 w-2 rounded-[3px]"
                style={{
                  backgroundColor: block.accent ?? "var(--creed-accent)",
                }}
              />
              {item}
            </li>
          ))}
        </ul>
      );
    case "labeled-list":
      return (
        <ul className="mt-5 space-y-2.5">
          {block.items.map((item) => (
            <li
              key={item.label}
              className="relative pl-5 text-[16px] leading-7 text-[var(--creed-text-secondary)]"
            >
              <span
                aria-hidden
                className="absolute left-0 top-[10px] h-2 w-2 rounded-[3px]"
                style={{ backgroundColor: item.color }}
              />
              <span className="font-medium" style={{ color: item.color }}>
                {item.label}
              </span>
              {": "}
              {item.text}
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="mt-5 space-y-2.5">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="flex gap-3 text-[16px] leading-7 text-[var(--creed-text-secondary)]"
            >
              <span className="mt-[2px] shrink-0 text-[14px] font-medium tabular-nums text-[var(--creed-accent)]">
                {i + 1}.
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );
    case "table":
      return (
        <figure className="mt-7">
          {block.caption ? (
            <p className="mb-5 text-[16px] leading-8 text-[var(--creed-text-secondary)]">
              {block.caption}
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-lg border border-[var(--creed-border)]">
            <table className="w-full border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b border-[var(--creed-border)] bg-[var(--creed-surface)]">
                  {block.headers.map((h, i) => (
                    <th
                      key={i}
                      className="px-4 py-3 font-medium text-[var(--creed-text-primary)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr
                    key={r}
                    className="border-b border-[var(--creed-border)] last:border-0"
                  >
                    {row.map((cell, c) => (
                      <TableCell key={c} cell={cell} isFirst={c === 0} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      );
    case "code":
      return (
        <CodeCommand copyText={block.code} className="mt-6">
          {block.parts
            ? block.parts.map((part, i) =>
                part.className ? (
                  <span key={i} className={part.className}>
                    {part.text}
                  </span>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )
            : block.code}
        </CodeCommand>
      );
    case "quote":
      return (
        <blockquote className="mt-6 border-l-2 border-[var(--creed-border-strong)] pl-4 text-[16px] leading-8 text-[var(--creed-text-secondary)] italic">
          {block.text}
        </blockquote>
      );
    case "context-perf-chart":
      return <LearnContextPerfChart />;
    case "tax-compound-chart":
      return <LearnTaxCompoundChart />;
  }
}

export function LearnArticle({ article }: { article: Article }) {
  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <MarketingHeroBanner configured={isSupabaseConfigured()} scrolled={false} />

      <main className="mx-auto max-w-3xl px-6 pb-20 pt-8 md:px-10 md:pb-24 md:pt-10">
        <article>
          <LearnArticleHeader title={article.title} slug={article.slug} />

          <div className="mt-10 [&>:first-child]:mt-0">
            {article.body.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>

          {article.faq.length > 0 ? (
            <FaqSection items={article.faq} className="mt-14" />
          ) : null}

          <section className="mt-14">
            <h2 className="text-[15px] font-medium text-[var(--creed-text-primary)]">
              Related
            </h2>
            <ul className="mt-4 space-y-2.5">
              {[...article.related, PRODUCT_CTA].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[15px] text-[var(--creed-accent)] transition-colors hover:text-[var(--creed-accent-hover)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </article>
      </main>

      <MarketingFooter />
    </div>
  );
}
