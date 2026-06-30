"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import { MarketingFooter, MarketingHeroBanner } from "@/components/marketing/site-chrome";
import { ArrowRightIcon, type ArrowRightIconHandle } from "@/components/ui/arrow-right";
import { contextFileFaqItems } from "@/lib/marketing/faq";
import { FaqAccordion } from "@/components/marketing/faq-accordion";

const contentSections = [
  {
    heading: "A file every AI reads",
    paragraphs: [
      "A personal context file is a single, structured profile that describes who you are, what you are working toward, and how you want AI to respond. You write it once. Every agent you connect reads it before it answers, so you stop re-explaining yourself in each new conversation, tool, or session.",
      "It is the opposite of starting cold. Instead of teaching a fresh assistant your role, your preferences, and your constraints every time, you keep one source of truth that every model reads first.",
    ],
  },
  {
    heading: "What goes in it",
    paragraphs: [
      "Creed organizes a personal context file into ten focused sections. Five are always on: Identity, Goals, Work, Preferences, and Routines. Five are optional and appear only when you fill them in: Beliefs, Constraints, People, Health, and Context.",
      "Each section is short, specific, and written to change how AI replies, not to store everything. A good context file names real tools, real people, and real defaults. It is meant to be read end to end in under a minute.",
    ],
  },
  {
    heading: "How your agents keep it current",
    paragraphs: [
      "As an agent learns something durable about you, a sharper preference, a new routine, or a goal that shifted, it proposes a narrowly scoped update to the right section. You review the change and approve what stays, or you let trusted agents edit directly when you want a lighter loop.",
      "Session chatter, one-off instructions, and passing moods are left out by design. The file stays a curated profile, not a chat log.",
    ],
  },
  {
    heading: "Portable, and yours",
    paragraphs: [
      "Your context file is plain Markdown that you control. Creed connects to agents like Claude Code, Codex, Cursor, and ChatGPT over MCP, and integrates with GitHub for version control, with Notion and Obsidian on the way.",
      "You bring your own AI key, your tokens stay yours, and deleting your account wipes everything. There is no lock-in: the file travels with you across tools instead of living inside one app's memory.",
    ],
  },
];

export function ContextFilePageView() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <MarketingHeroBanner configured scrolled={scrolled} />

      <main
        className="mx-auto max-w-3xl px-6 pb-20 pt-8 md:px-10 md:pb-24 md:pt-10"
      >
        <div className="border-b border-[var(--creed-border)] pb-8">
          <AnimatedPageTitle
            text="What is a context file?"
            className="t-section text-[var(--creed-text-primary)]"
          />
          <p
            className="mt-5 max-w-2xl text-[18px] leading-8 text-[var(--creed-text-secondary)]"
          >
            One profile that every AI reads before it answers you, written once and kept
            current by your agents.
          </p>
        </div>

        {contentSections.map((section) => (
          <section key={section.heading} className="border-b border-[var(--creed-border)] py-8 md:py-10">
            <h2 className="text-[20px] font-medium text-[var(--creed-text-primary)] md:text-[22px]">
              {section.heading}
            </h2>
            <div className="mt-4 space-y-4">
              {section.paragraphs.map((paragraph, index) => (
                <p
                  key={index}
                  className="max-w-2xl text-[16px] leading-7 text-[var(--creed-text-secondary)] md:text-[17px]"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}

        <section className="py-8 md:py-10">
          <h2 className="text-[20px] font-medium text-[var(--creed-text-primary)] md:text-[22px]">
            Common questions
          </h2>
          <div className="mt-4">
            <FaqAccordion items={contextFileFaqItems} />
          </div>
        </section>

        <div className="pt-2">
          <ContextFileCta />
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}

function ContextFileCta() {
  const arrowRef = useRef<ArrowRightIconHandle | null>(null);

  return (
    <Link
      href="/pricing"
      onMouseEnter={() => arrowRef.current?.startAnimation()}
      onMouseLeave={() => arrowRef.current?.stopAnimation()}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#2563EB] pl-4 pr-3 text-[14px] font-medium text-white transition-colors hover:bg-[#1D4ED8]"
    >
      <span className="leading-none">Create your Creed</span>
      <ArrowRightIcon ref={arrowRef} size={16} className="inline-flex shrink-0 items-center justify-center leading-none" />
    </Link>
  );
}
