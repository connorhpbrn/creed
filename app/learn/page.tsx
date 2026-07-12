import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MarketingFooter,
  MarketingHeroBanner,
} from "@/components/marketing/site-chrome";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import { JsonLd } from "@/components/marketing/json-ld";
import { articlesByCluster } from "@/lib/marketing/learn";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/structured-data";

const PATH = "/learn";
const TITLE = "Learn";
const DESCRIPTION =
  "Guides on personal context files: what they are, how to stop repeating yourself to AI, how to share context across ChatGPT, Claude, and Cursor, and how Creed compares to the memory tools.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
};

export default function LearnIndexPage() {
  const groups = articlesByCluster();

  return (
    <>
      <JsonLd
        data={graph(
          webPageSchema({ path: PATH, name: TITLE, description: DESCRIPTION }),
          breadcrumbSchema(PATH, [
            { name: "Creed", path: "/home" },
            { name: "Learn", path: PATH },
          ])
        )}
      />
      <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
        <MarketingHeroBanner configured={isSupabaseConfigured()} scrolled={false} />

        <main className="mx-auto max-w-4xl px-6 pb-20 pt-8 md:px-10 md:pb-24 md:pt-10">
          <header className="border-b border-[var(--creed-border)] pb-8">
            <AnimatedPageTitle text="Learn" />
            <p className="mt-4 max-w-2xl text-[18px] leading-8 text-[var(--creed-text-secondary)]">
              How to keep one context file every AI reads before it answers. The
              category, the common problems, honest comparisons, and how to
              connect your tools.
            </p>
          </header>

          <div className="mt-12 flex flex-col gap-14">
            {groups.map((group) => (
              <section key={group.cluster}>
                <h2 className="text-[22px] font-medium tracking-[-0.01em] text-[var(--creed-text-primary)] md:text-[24px]">
                  {group.title}
                </h2>
                <p className="mt-2 text-[15px] text-[var(--creed-text-tertiary)]">
                  {group.blurb}
                </p>
                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {group.articles.map((article) => (
                    <li key={article.slug}>
                      <Link
                        href={`/learn/${article.slug}`}
                        className="flex h-full flex-col rounded-[16px] bg-[var(--creed-surface)] p-5 transition-colors hover:bg-[var(--creed-surface-raised)]"
                      >
                        <span className="line-clamp-2 text-[16px] font-medium leading-6 text-[var(--creed-text-primary)]">
                          {article.title}
                        </span>
                        <span className="mt-2 line-clamp-3 text-[14px] leading-6 text-[var(--creed-text-secondary)]">
                          {article.description}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
