import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MarketingFooter,
  MarketingHeroBanner,
} from "@/components/marketing/site-chrome";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import { JsonLd } from "@/components/marketing/json-ld";
import { LearnArticleCard } from "@/components/marketing/learn-article-card";
import { learnArticles } from "@/lib/marketing/learn";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/structured-data";
import { ConnectIcon } from "@/components/ui/connect";
import { FileTextIcon } from "@/components/ui/file-text";
import { GitCompareArrowsIcon } from "@/components/ui/git-compare-arrows";
import { RefreshCwIcon } from "@/components/ui/refresh-cw";

const PATH = "/learn";
const TITLE = "Learn";
const DESCRIPTION =
  "Personal context files: what they are, the re-explaining tax, how memory compares, and how to connect your tools.";

// Client icon components passed as props to LearnArticleCard (supported RSC
// pattern). Do not call helpers from learn-icons.tsx here - that module is
// client-only and invoking it from this server page throws at runtime.
const ARTICLE_ICONS = {
  "personal-context-file": FileTextIcon,
  "re-explaining-tax": RefreshCwIcon,
  "memory-vs-context-file": GitCompareArrowsIcon,
  "connect-your-tools": ConnectIcon,
} as const;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
};

export default function LearnIndexPage() {
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

        <main className="mx-auto max-w-3xl px-6 pb-20 pt-8 md:px-10 md:pb-24 md:pt-10">
          <header className="border-b border-[var(--creed-border)] pb-8">
            <AnimatedPageTitle text="Learn" />
          </header>

          <ul className="mt-10 grid gap-3 sm:grid-cols-2">
            {learnArticles.map((article) => {
              const Icon =
                ARTICLE_ICONS[article.slug as keyof typeof ARTICLE_ICONS] ??
                FileTextIcon;
              return (
                <li key={article.slug}>
                  <LearnArticleCard
                    href={`/learn/${article.slug}`}
                    title={article.title}
                    description={article.description}
                    icon={Icon}
                  />
                </li>
              );
            })}
          </ul>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
