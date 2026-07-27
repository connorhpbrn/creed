"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import type { ChangelogEntry } from "@/lib/marketing/changelog";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map((part) => parseInt(part, 10));
  if (!year || !month || !day) return iso;
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

export function ChangelogAccordion({
  entries,
}: {
  entries: ChangelogEntry[];
}) {
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  return (
    <div className="mt-10 flex flex-col gap-12">
      {entries.map((entry) => {
        const entryId = `${entry.date}:${entry.title}`;
        const isOpen = openEntryId === entryId;

        return (
          <article key={entryId}>
            <time
              dateTime={entry.date}
              className="text-[13px] font-medium text-[var(--creed-text-tertiary)]"
            >
              {formatDate(entry.date)}
            </time>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenEntryId(isOpen ? null : entryId)}
              className="group mt-3 flex items-center gap-2 text-left"
            >
              <h2 className="text-[22px] font-medium tracking-[-0.01em] text-[var(--creed-text-primary)] transition-opacity duration-200 group-hover:opacity-70 md:text-[24px]">
                {entry.title}
              </h2>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className={`size-5 shrink-0 text-[var(--creed-text-primary)] transition-[opacity,transform] duration-200 group-hover:opacity-70 ${
                  isOpen ? "rotate-90" : ""
                }`}
              >
                <path
                  d="m9 6 6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  key="content"
                  initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{
                    duration: reduceMotion ? 0 : 0.24,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="overflow-hidden"
                >
                  <div className="pt-4">
                    <p className="text-[16px] leading-8 text-[var(--creed-text-secondary)]">
                      {entry.body}
                    </p>
                    {entry.highlights ? (
                      <ol className="mt-3 list-decimal space-y-2 pl-5 marker:font-medium marker:text-[var(--creed-accent)]">
                        {entry.highlights.map((highlight, index) => (
                          <li
                            key={index}
                            className="pl-1 text-[15px] leading-7 text-[var(--creed-text-secondary)]"
                          >
                            {highlight}
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </article>
        );
      })}
    </div>
  );
}
