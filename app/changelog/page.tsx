import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import {
  MarketingFooter,
  MarketingHeroBanner,
} from "@/components/marketing/site-chrome";
import { JsonLd } from "@/components/marketing/json-ld";
import { ChangelogAccordion } from "@/components/marketing/changelog-accordion";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/structured-data";
import { changelog } from "@/lib/marketing/changelog";

const PATH = "/changelog";
const TITLE = "Changelog";
const DESCRIPTION =
  "What's new in Creed: recent releases and improvements, newest first.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
};

export default function ChangelogPage() {
  const latest = changelog[0]?.date;

  return (
    <>
      <JsonLd
        data={graph(
          webPageSchema({
            path: PATH,
            name: TITLE,
            description: DESCRIPTION,
            ...(latest ? { dateModified: latest } : {}),
          }),
          breadcrumbSchema(PATH, [
            { name: "Creed", path: "/home" },
            { name: "Changelog", path: PATH },
          ])
        )}
      />
      <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
        <MarketingHeroBanner configured={isSupabaseConfigured()} scrolled={false} />

        <main className="mx-auto max-w-3xl px-6 pb-20 pt-8 md:px-10 md:pb-24 md:pt-10">
          <header className="border-b border-[var(--creed-border)] pb-8">
            <AnimatedPageTitle text="Changelog" />
            <p className="mt-4 max-w-2xl text-[18px] leading-8 text-[var(--creed-text-secondary)]">
              What&apos;s new in Creed, newest first.
            </p>
          </header>

          <ChangelogAccordion entries={changelog} />
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
