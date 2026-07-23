"use client";

import { useEffect, useState } from "react";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import {
  MarketingFooter,
  MarketingHeroBanner,
} from "@/components/marketing/site-chrome";
import { RoadmapStatusPill } from "@/components/marketing/roadmap-status";
import type { RoadmapColumn, RoadmapTask } from "@/lib/marketing/roadmap";

export function RoadmapPageView({ columns }: { columns: RoadmapColumn[] }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const total = columns.reduce((sum, column) => sum + column.tasks.length, 0);

  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <MarketingHeroBanner configured scrolled={scrolled} />

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-8 md:px-10 md:pb-28 md:pt-10">
        <div className="mx-auto max-w-2xl text-center">
          <AnimatedPageTitle
            text="Roadmap"
            className="justify-center"
          />
          <p className="t-lede mx-auto mt-5 max-w-xl text-[var(--creed-text-tertiary)]">
            A live view of what we&apos;re building, straight from our task
            board.
          </p>
        </div>

        {total === 0 ? (
          <p className="mt-20 text-center text-[15px] text-[var(--creed-text-tertiary)]">
            The roadmap is being updated. Check back shortly.
          </p>
        ) : (
          <div className="mt-14 grid gap-5 md:mt-16 lg:grid-cols-3">
            {columns.map((column) => (
              <RoadmapColumnView key={column.id} column={column} />
            ))}
          </div>
        )}
      </main>

      <MarketingFooter />
    </div>
  );
}

function RoadmapColumnView({ column }: { column: RoadmapColumn }) {
  return (
    <section className="flex flex-col">
      <div className="mb-4 flex items-center gap-2.5">
        <RoadmapStatusPill id={column.id} label={column.label} />
        <span className="text-[13px] tabular-nums text-[var(--creed-text-tertiary)]">
          {column.tasks.length}
        </span>
      </div>

      {column.tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--creed-border)] px-5 py-10 text-center text-[13px] text-[var(--creed-text-tertiary)]">
          Nothing here yet
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {column.tasks.map((task) => (
            <RoadmapCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </section>
  );
}

function RoadmapCard({ task }: { task: RoadmapTask }) {
  return (
    <article className="rounded-xl bg-[var(--creed-surface)] p-5">
      <h3 className="text-[16px] font-medium leading-snug tracking-[-0.01em] text-[var(--creed-text-primary)]">
        {task.title}
      </h3>

      {task.description ? (
        <p className="t-body mt-2 line-clamp-2 text-[var(--creed-text-secondary)]">
          {task.description}
        </p>
      ) : null}

      {task.labels.length > 0 ? (
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {task.labels.map((label) => (
            <span
              key={label}
              className="rounded-[6px] bg-[var(--creed-surface-raised)] px-2 py-0.5 font-mono text-[12px] text-[var(--creed-text-tertiary)]"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
