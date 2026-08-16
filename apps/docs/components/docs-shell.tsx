"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { BrandedCredit } from "@creed/ui/branded-credit";
import { DocsLogo } from "./docs-logo";
import { useOpenSections } from "./use-open-sections";

export type DocsEntry = {
  id: string;
  label: string;
  group: string;
  title: string;
  content: ReactNode;
};

export function DocsShell({ entries }: { entries: DocsEntry[] }) {
  const groups = useMemo(
    () =>
      Array.from(new Set(entries.map((entry) => entry.group))).map((group) => ({
        group,
        entries: entries.filter((entry) => entry.group === group),
      })),
    [entries],
  );
  const [active, setActive] = useState(entries[0]?.id ?? "");
  const locked = useRef(false);
  const unlockTimer = useRef<number | null>(null);
  const { isOpen, toggle } = useOpenSections(groups.slice(0, 2).map(({ group }) => group));

  useEffect(() => {
    const elements = entries
      .map(({ id }) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));
    const observer = new IntersectionObserver(
      (observed) => {
        if (locked.current) return;
        const top = observed
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top?.target.id) setActive(top.target.id);
      },
      { rootMargin: "-96px 0px -68% 0px" },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [entries]);

  function goTo(id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    setActive(id);
    locked.current = true;
    if (unlockTimer.current) window.clearTimeout(unlockTimer.current);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
    unlockTimer.current = window.setTimeout(() => {
      locked.current = false;
    }, 1000);
  }

  const navigation = (mobile = false) => (
    <nav className="space-y-1" aria-label="Documentation">
      {groups.map(({ group, entries: groupEntries }) => {
        const open = isOpen(group);
        const activeGroup = groupEntries.some(({ id }) => id === active);
        return (
          <div key={group}>
            <button
              type="button"
              onClick={() => toggle(group)}
              aria-expanded={open}
              className={`flex w-full items-center justify-between gap-2 py-1.5 text-left text-[15px] font-medium transition-colors ${
                !mobile && activeGroup
                  ? "text-[var(--creed-accent)]"
                  : "text-[var(--creed-text-primary)] hover:text-[var(--creed-accent)]"
              }`}
            >
              {group}
              <ChevronDown className={`h-[18px] w-[18px] transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
            </button>
            <AnimatePresence initial={false}>
              {open ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="mb-3 mt-1 space-y-2.5">
                    {groupEntries.map((entry) => (
                      <a
                        key={entry.id}
                        href={`#${entry.id}`}
                        onClick={(event) => {
                          event.preventDefault();
                          goTo(entry.id);
                        }}
                        className={`block text-[14px] leading-6 transition-colors ${
                          !mobile && active === entry.id
                            ? "font-medium text-[var(--creed-accent)]"
                            : "text-[var(--creed-text-primary)] hover:text-[var(--creed-accent)]"
                        }`}
                      >
                        {entry.label}
                      </a>
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <div className="mx-auto max-w-[1280px] px-5 pb-24 pt-10 md:px-8 md:pt-14">
        <div className="mb-10 lg:hidden">
          <div className="mb-4 text-[17px] font-semibold">On this page</div>
          {navigation(true)}
        </div>

        <div className="grid gap-16 lg:grid-cols-[220px_minmax(0,900px)] lg:gap-20">
          <aside className="hidden lg:block">
            <div className="sticky top-10 pb-12">
              <DocsLogo className="mb-5 h-[18px] w-auto" />
              {navigation()}
            </div>
          </aside>

          <main className="min-w-0">
            {entries.map((entry, index) => (
              <section
                key={entry.id}
                id={entry.id}
                className={`scroll-mt-10 py-10 ${index === entries.length - 1 ? "" : "border-b border-[var(--creed-border)]"}`}
              >
                <div
                  className="ProseMirror docs-prose"
                  style={{
                    "--section-accent": "var(--creed-accent)",
                    "--section-accent-tint": "rgba(124, 58, 237, 0.11)",
                    "--section-accent-border": "rgba(124, 58, 237, 0.12)",
                    "--section-accent-bar": "rgba(124, 58, 237, 0.82)",
                  } as CSSProperties}
                >
                  <h2>{entry.title}</h2>
                  {entry.content}
                </div>
              </section>
            ))}
          </main>
        </div>
        <div className="mx-auto mt-9 max-w-[640px] border-t border-[var(--creed-border)] pt-9">
          <BrandedCredit
            accent="var(--creed-accent)"
            style={{ color: "var(--creed-text-tertiary)" }}
          />
        </div>
      </div>
    </div>
  );
}
