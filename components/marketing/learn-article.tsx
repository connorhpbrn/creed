import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import {
  MarketingFooter,
  MarketingHeroBanner,
} from "@/components/marketing/site-chrome";
import { FaqSection } from "@/components/marketing/faq-section";
import type { Article, ArticleBlock } from "@/lib/marketing/learn/types";

// Server-rendered article view for /learn/[slug]. Everything ships in the
// initial HTML: the lead answer, headings, tables, code, FAQ, and related
// links. No client component wraps the content, so answer engines and no-JS
// crawlers read the whole page.

// Every article's Related list ends with the same product CTA. It lives here,
// not in each article's data, so retargeting it is a one-line change.
const PRODUCT_CTA = { label: "See how Creed works", href: "/home" };

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
              className="relative pl-5 text-[16px] leading-7 text-[var(--creed-text-secondary)] before:absolute before:left-0 before:top-[10px] before:h-2 before:w-2 before:rounded-[3px] before:bg-[#2563EB]"
            >
              {item}
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
              <span className="mt-[2px] shrink-0 text-[14px] font-medium tabular-nums text-[#2563EB]">
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
          <div className="overflow-x-auto rounded-[14px] border border-[var(--creed-border)]">
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
                      <td
                        key={c}
                        className={
                          c === 0
                            ? "px-4 py-3 font-medium text-[var(--creed-text-primary)]"
                            : "px-4 py-3 text-[var(--creed-text-secondary)]"
                        }
                      >
                        {cell}
                      </td>
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
        <pre className="mt-6 overflow-x-auto rounded-[16px] bg-[var(--creed-surface)] p-5 font-mono text-[13px] leading-6 text-[var(--creed-text-primary)]">
          <code>{block.code}</code>
        </pre>
      );
    case "quote":
      return (
        <blockquote className="mt-6 border-l-2 border-[var(--creed-border-strong)] pl-4 text-[16px] leading-8 text-[var(--creed-text-secondary)] italic">
          {block.text}
        </blockquote>
      );
  }
}

export function LearnArticle({ article }: { article: Article }) {
  const leadParagraphs = article.lead.split("\n\n");

  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <MarketingHeroBanner configured={isSupabaseConfigured()} scrolled={false} />

      <main className="mx-auto max-w-3xl px-6 pb-20 pt-8 md:px-10 md:pb-24 md:pt-10">
        <article>
          <AnimatedPageTitle text={article.title} />

          <div className="mt-6">
            {leadParagraphs.map((para, i) => (
              <p
                key={i}
                className={
                  "text-[17px] leading-8 text-[var(--creed-text-primary)]" +
                  (i > 0 ? " mt-4" : "")
                }
              >
                {para}
              </p>
            ))}
          </div>

          <div>
            {article.body.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>

          {article.faq.length > 0 ? (
            <FaqSection
              heading="Frequently asked questions"
              items={article.faq}
              className="mt-14"
            />
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
                    className="text-[15px] text-[#2563EB] transition-colors hover:text-[#1D4ED8]"
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
