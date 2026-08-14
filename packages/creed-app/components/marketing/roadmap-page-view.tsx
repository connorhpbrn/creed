"use client";

import { useEffect, useState } from "react";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import {
  MarketingFooter,
  MarketingHeroBanner,
} from "@/components/marketing/site-chrome";
import {
  RoadmapLabelTag,
  RoadmapStatusPill,
} from "@/components/marketing/roadmap-status";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@creed/ui/dialog";
import type { RoadmapColumn, RoadmapTask } from "@/lib/marketing/roadmap";

export function RoadmapPageView({ columns }: { columns: RoadmapColumn[] }) {
  const [scrolled, setScrolled] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setSelectedTaskId(new URLSearchParams(window.location.search).get("item"));
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
        </div>

        {total === 0 ? (
          <p className="mt-20 text-center text-[15px] text-[var(--creed-text-tertiary)]">
            The roadmap is being updated. Check back shortly.
          </p>
        ) : (
          <div className="mt-14 grid gap-5 md:mt-16 lg:grid-cols-3">
            {columns.map((column) => (
              <RoadmapColumnView
                key={column.id}
                column={column}
                selectedTaskId={selectedTaskId}
              />
            ))}
          </div>
        )}
      </main>

      <MarketingFooter />
    </div>
  );
}

function RoadmapColumnView({
  column,
  selectedTaskId,
}: {
  column: RoadmapColumn;
  selectedTaskId: string | null;
}) {
  return (
    <section className="flex flex-col">
      <div className="mb-4 flex items-center gap-2.5">
        <RoadmapStatusPill id={column.id} label={column.label} />
        <span className="text-[13px] tabular-nums text-[var(--creed-text-primary)]">
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
            <RoadmapCard
              key={task.id}
              task={task}
              selected={task.id === selectedTaskId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RoadmapCard({
  task,
  selected,
}: {
  task: RoadmapTask;
  selected: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (selected) setOpen(true);
  }, [selected]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="w-full cursor-pointer rounded-xl bg-[var(--creed-surface)] p-5 text-left transition-colors duration-200 hover:bg-[var(--creed-surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--creed-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--creed-background)]"
        >
          <span className="block text-[16px] font-medium leading-snug tracking-[-0.01em] text-[var(--creed-text-primary)]">
            {task.title}
          </span>

          {task.description ? (
            <span className="t-body mt-2 line-clamp-2 text-[var(--creed-text-secondary)]">
              {task.description}
            </span>
          ) : null}

          {task.labels.length > 0 ? (
            <span className="mt-3.5 flex flex-wrap gap-1.5">
              {task.labels.map((label) => (
                <RoadmapLabelTag key={label} label={label} />
              ))}
            </span>
          ) : null}
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[min(80vh,42rem)] overflow-y-auto rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)] sm:max-w-lg">
        <DialogHeader className="gap-3 pr-8">
          <DialogTitle className="text-[20px] leading-snug tracking-[-0.01em]">
            {task.title}
          </DialogTitle>
          <DialogDescription className="t-body whitespace-pre-wrap text-[var(--creed-text-secondary)]">
            {task.description ?? "No additional details yet."}
          </DialogDescription>
        </DialogHeader>

        {task.labels.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {task.labels.map((label) => (
              <RoadmapLabelTag key={label} label={label} />
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
