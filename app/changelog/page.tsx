import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import {
  MarketingFooter,
  MarketingHeroBanner,
} from "@/components/marketing/site-chrome";
import { JsonLd } from "@/components/marketing/json-ld";
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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

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

          <div className="mt-10 flex flex-col gap-12">
            {changelog.map((entry) => (
              <article key={entry.date} className="flex flex-col gap-3">
                <time
                  dateTime={entry.date}
                  className="text-[13px] font-medium text-[var(--creed-text-tertiary)]"
                >
                  {formatDate(entry.date)}
                </time>
                <h2 className="text-[22px] font-medium tracking-[-0.01em] text-[var(--creed-text-primary)] md:text-[24px]">
                  {entry.title}
                </h2>
                <p className="text-[16px] leading-8 text-[var(--creed-text-secondary)]">
                  {entry.body}
                </p>
                {entry.highlights ? (
                  <ul className="mt-1 space-y-2">
                    {entry.highlights.map((h, i) => (
                      <li
                        key={i}
                        className="relative pl-5 text-[15px] leading-7 text-[var(--creed-text-secondary)] before:absolute before:left-0 before:top-[10px] before:h-2 before:w-2 before:rounded-[3px] before:bg-[#2563EB]"
                      >
                        {h}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
