import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import {
  MarketingFooter,
  MarketingHeroBanner,
} from "@/components/marketing/site-chrome";
import { JsonLd } from "@/components/marketing/json-ld";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/structured-data";

const PATH = "/bench";
const TITLE = "Benchmarks";
const DESCRIPTION =
  "How well frontier models perform when using Creed: reading a personal context file, respecting it, and proposing good updates. Coming soon.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
};

// Placeholder rows for the skeleton chart. Widths are deliberately unlabeled
// and unranked; the page promises the benchmark without pre-announcing any
// model's score.
const SKELETON_BARS = [78, 64, 91, 52, 70];

export default function BenchPage() {
  return (
    <>
      <JsonLd
        data={graph(
          webPageSchema({ path: PATH, name: TITLE, description: DESCRIPTION }),
          breadcrumbSchema(PATH, [
            { name: "Creed", path: "/home" },
            { name: "Benchmarks", path: PATH },
          ])
        )}
      />
      <div className="flex min-h-screen flex-col bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
        <MarketingHeroBanner configured={isSupabaseConfigured()} scrolled={false} />

        <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-20 pt-8 md:px-10 md:pb-24 md:pt-10">
          <div className="border-b border-[var(--creed-border)] pb-8">
            <AnimatedPageTitle text={TITLE} />
            <p className="mt-5 max-w-2xl text-[18px] leading-8 text-[var(--creed-text-secondary)]">
              How well frontier models perform when using Creed: reading your
              context file, respecting what it says, and proposing updates
              worth keeping. Measured the same way for every model, published
              here soon.
            </p>
          </div>

          {/* Skeleton leaderboard: unlabeled bars that gesture at the coming
              chart without ranking anyone yet. */}
          <div
            aria-hidden="true"
            className="mt-12 w-full max-w-md space-y-3"
            style={{
              maskImage:
                "linear-gradient(to bottom, black 30%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black 30%, transparent 100%)",
            }}
          >
            {SKELETON_BARS.map((width, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="h-6 w-6 shrink-0 rounded-[8px] bg-[var(--creed-surface-raised)]" />
                <div className="h-6 flex-1 overflow-hidden rounded-[8px] bg-[var(--creed-surface)]">
                  <div
                    className="h-full rounded-[8px] bg-[var(--creed-surface-raised)]"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
