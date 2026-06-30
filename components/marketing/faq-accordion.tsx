"use client";

// Shared FAQ accordion for the public site: the landing "Questions" section and
// the /context explainer's "Common questions" both render through this so the
// two stay visually identical. One item open at a time, the first open by
// default. The answer text stays in the DOM even when collapsed (a grid-rows
// collapse, not an unmount), so search and answer engines can still read every
// answer regardless of which item is expanded.

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { FaqItem } from "@/lib/marketing/faq";
import { cn } from "@/lib/utils";

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div>
      {items.map((item, index) => {
        const open = openIndex === index;

        return (
          <div key={item.question} className="border-b border-[var(--creed-border)]">
            <button
              type="button"
              onClick={() => setOpenIndex(open ? -1 : index)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-6 py-7 text-left"
            >
              <span className="t-body-lg font-medium text-[var(--creed-text-primary)]">
                {item.question}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-300",
                  open && "rotate-180",
                )}
              />
            </button>

            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <p className="t-body max-w-3xl pb-7 text-[var(--creed-text-secondary)]">
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
