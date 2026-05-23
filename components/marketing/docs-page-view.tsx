"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { AnimatedPageTitle, AnimatedSectionHeading } from "@/components/marketing/animated-page-title";
import { IntegrationGlyph } from "@/components/creed/brand";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/site-chrome";
import { cn } from "@/lib/utils";

const lightApostlesImage = "/assets/landing/backgrounds/light-apostles.avif";
const darkApostlesImage = "/assets/landing/backgrounds/dark-apostles.avif";

type DocsSection = {
  id: string;
  label: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

type SectionGuide = {
  title: string;
  belongs: string[];
  avoid: string[];
};

type ExampleGroup = {
  title: string;
  good: string[];
  bad: string[];
};

type MaintenanceBrand = "openclaw" | "codex" | "claude" | "opencode" | "hermes" | "custom";

type MaintenancePattern = {
  title: string;
  brand: MaintenanceBrand;
  recommendation: string;
};

const sections: DocsSection[] = [
  {
    id: "overview",
    label: "Overview",
    title: "What Creed is",
    paragraphs: [
      "Creed is your personal context profile. One file that captures who you are: values, goals, work, preferences, constraints, people, health, routines. Any AI you talk to knows you instantly instead of starting from zero every conversation.",
      "It is not a journal, scratchpad, or chat log. The value comes from keeping the profile concise, current, and specific enough that every section actually changes how AI replies to you.",
    ],
  },
  {
    id: "how-agents-should-use-creed",
    label: "How AI uses Creed",
    title: "How AI should use Creed",
    paragraphs: [
      "Connected agents read Creed before answering you, let it shape how they reply, and propose narrow updates as they learn new things about you. You approve the good ones and the profile sharpens over time.",
    ],
    bullets: [
      "Read the visible profile before answering, planning, recommending, or scheduling anything.",
      "Anchor tone, defaults, and assumptions to what the profile already says about you.",
      "Respect constraints and routines without being asked to repeat them.",
      "When something new is learned about the user, propose a small focused update to the right section.",
      "Keep the profile concise. Propose tightening or pruning when a section is stale or bloated.",
      "Never use Creed as a session log, mood tracker, or place for things only true today.",
    ],
  },
  {
    id: "mcp-setup",
    label: "MCP setup",
    title: "MCP setup should finish in one prompt",
    paragraphs: [
      "Creed MCP uses a long-lived bearer token. Agents should install the provided MCP config into persistent local configuration, verify the tools, read Creed once, confirm the write policy, and only then say the connection is ready.",
      "You should not need to run a second prompt to make Creed sticky. If the agent can edit its own MCP configuration, it should do so during setup. If it cannot, it should provide the exact file path and ready-to-use config block.",
    ],
    bullets: [
      "Always read https://creed.md/docs during setup if anything is unclear.",
      "Verify by listing MCP tools and calling read_creed once.",
      "Call get_write_policy and confirm whether updates should use propose_creed_update or direct_edit_creed.",
      "Do not claim connected unless read_creed succeeds and a valid write policy is visible.",
      "For OpenCode, configure Creed as a remote MCP with oauth set to false and an Authorization bearer header.",
      "For OpenCode, do not run opencode mcp auth creed because Creed MCP does not use OAuth.",
    ],
  },
  {
    id: "when-to-propose",
    label: "When to propose",
    title: "When to propose",
    paragraphs: [
      "Propose an update when you learn something durable about the user, something that would change how a future AI should reply to them, not just a one-time mood or task. The test is: would this make every next AI conversation better?",
    ],
    bullets: [
      "Propose new identity facts, values, or defaults that should follow the user across every AI.",
      "Propose preference changes when the user clearly signals a new style they want by default.",
      "Propose Goals updates when a near-term outcome shifts or completes. Keep them concrete and current.",
      "Propose Routines, People, or Health updates when AI should account for them in future replies.",
      "Propose tightening or removing a section when it has gone stale, vague, or contradicted itself.",
    ],
  },
  {
    id: "when-not-to-propose",
    label: "When not to propose",
    title: "When not to propose",
    paragraphs: [
      "Most bad proposals are not wrong, they are noisy. If something does not change how a future AI should treat the user, it should not be in the profile.",
    ],
    bullets: [
      "Do not propose session summaries, mood updates, or diary-style entries.",
      "Do not propose generic personality praise (curious, driven, thoughtful) without a concrete anchor.",
      "Do not propose one-off task instructions or things only true for the next hour.",
      "Do not ask the user what to add. Either propose something durable or do nothing.",
    ],
  },
  {
    id: "how-each-section-works",
    label: "How each section works",
    title: "How each section works",
    paragraphs: [
      "Each section captures a different kind of context about the user. Good agents aim updates at the section that best matches what they learned instead of dumping everything into one bucket.",
    ],
  },
  {
    id: "good-and-bad-proposal-examples",
    label: "Good vs bad examples",
    title: "Good and bad proposal examples",
    paragraphs: [
      "Examples are often more useful than abstract rules. These are the kinds of updates Creed should accept and the kinds it should keep out.",
    ],
  },
  {
    id: "how-to-behave-after-meaningful-work",
    label: "After a real conversation",
    title: "After a real conversation",
    paragraphs: [
      "When you finish helping the user with something real, ask: did I learn something durable about them? Did anything in the profile look stale or wrong? Only then decide whether to propose an update.",
    ],
    bullets: [
      "Ask whether you learned something durable enough to help every future AI conversation.",
      "Check whether any section now reads as stale, vague, duplicated, or contradicted.",
      "Prefer one sharp refinement or prune over several loose additions.",
      "If yes, propose it proactively without asking what to propose.",
      "If no, do nothing and leave Creed unchanged.",
      "If you spot a problem in the profile itself, propose the fix and flag it clearly.",
    ],
  },
  {
    id: "recurring-maintenance",
    label: "Recurring maintenance",
    title: "Keep your profile sharp",
    paragraphs: [
      "The best Creed setups also revisit the file on a cadence. A small recurring review compares the profile with what's actually true now, sharpens what belongs, and prunes what's gone stale.",
      "Recurring maintenance should improve quality, not volume. The goal is to keep the profile concise and current.",
    ],
    bullets: [
      "Run a recurring check when an agent has enough autonomy to review the profile without micromanagement.",
      "Look for goals that shipped, routines that changed, or context that no longer fits.",
      "Tighten generic phrasing into concrete defaults grounded in real examples.",
      "Prefer pruning and merging over constant appending.",
      "If nothing has changed, do nothing.",
    ],
  },
  {
    id: "direct-edit-vs-proposal-mode",
    label: "Direct edit vs proposal mode",
    title: "Direct edit vs proposal mode",
    paragraphs: [
      "Creed can run in reviewed proposal mode or trusted direct-edit mode. The mechanics differ, but the standard stays the same: only durable, profile-worthy context belongs in the file.",
    ],
    bullets: [
      "Proposal mode is the default reviewed path. Agents suggest updates and you decide what enters the profile.",
      "Direct-edit mode is the trusted path when approval is off. Agents may edit directly, but they should still protect the profile with the same restraint.",
      "Neither mode turns Creed into a scratchpad. The bar for what belongs does not move.",
    ],
  },
];

const sectionGuides: SectionGuide[] = [
  {
    title: "Identity",
    belongs: [
      "Concrete role, defining traits, values, and defaults that make the user distinct.",
      "Anchors AI should hang every reply on: voice, taste, what they care about.",
    ],
    avoid: [
      "Bio-style life history.",
      "Generic personality words without a real example behind them.",
    ],
  },
  {
    title: "Beliefs",
    belongs: [
      "Stable values or worldview that should change how AI reasons or recommends.",
      "Convictions that explain why the user prefers certain trade-offs.",
    ],
    avoid: [
      "Platitudes or motivational quotes.",
      "Things the user has not actually committed to.",
    ],
  },
  {
    title: "Goals",
    belongs: [
      "Live priorities: near-term outcomes and longer-horizon aims.",
      "Concrete targets with stale-by hints when timing matters.",
    ],
    avoid: [
      "Vague intentions like 'grow' or 'be better'.",
      "Goals that shipped or were abandoned without being updated.",
    ],
  },
  {
    title: "Work",
    belongs: [
      "What the user does, the tools and stack they use, and how they like to work.",
      "Real surfaces, methods, collaborators, and craft details AI should know.",
    ],
    avoid: [
      "Exhaustive resume-style history.",
      "One-off project notes that belong in Goals or Context.",
    ],
  },
  {
    title: "Preferences",
    belongs: [
      "Specific reply-style defaults: length, tone, formatting, follow-up behavior.",
      "Concrete do/avoid rules AI should apply by default.",
    ],
    avoid: [
      "Generic 'be helpful' or 'be honest' filler.",
      "Momentary tone requests from one chat.",
    ],
  },
  {
    title: "Constraints",
    belongs: [
      "Hard noes, sensitive topics, and actions that need explicit permission.",
      "Lines AI should not cross even if the user seems to ask in the moment.",
    ],
    avoid: [
      "Temporary dislikes.",
      "Vague fears that do not give AI a concrete rule.",
    ],
  },
  {
    title: "People",
    belongs: [
      "Named relationships: who they are, why they matter, what AI should remember.",
      "Family, partners, collaborators, and pets that come up in conversation.",
    ],
    avoid: [
      "Casual mentions of strangers.",
      "Sensitive details the user has not explicitly chosen to share.",
    ],
  },
  {
    title: "Health",
    belongs: [
      "Conditions, sensitivities, dietary patterns, and accessibility needs, paired with how AI should accommodate them.",
      "Durable physical or mental health context that should shape suggestions.",
    ],
    avoid: [
      "One-off symptoms or short-term illnesses.",
      "Diagnoses without any guidance for how AI should respond.",
    ],
  },
  {
    title: "Routines",
    belongs: [
      "Daily, weekly, and seasonal rhythms AI should respect when planning or scheduling.",
      "Working hours, sleep windows, deep-work blocks, recurring commitments.",
    ],
    avoid: [
      "Today's todo list.",
      "Routines the user has clearly stopped following.",
    ],
  },
  {
    title: "Context",
    belongs: [
      "Durable catch-all details that don't fit elsewhere: location, life stage, environment.",
      "Background facts AI should know but that aren't preferences, goals, or constraints.",
    ],
    avoid: [
      "Mood updates or session recap.",
      "Long open-question lists that belong in your own notes.",
    ],
  },
];

const exampleGroups: ExampleGroup[] = [
  {
    title: "Goals",
    good: [
      "Ship Creed v1 to public launch by end of June; current focus is onboarding polish.",
      "Move to Lisbon in Q4. Researching neighborhoods and visa paths now.",
    ],
    bad: [
      "Be more productive this year.",
      "Worked on the landing page for three hours today.",
    ],
  },
  {
    title: "Preferences",
    good: [
      "Default to concise replies. No preamble, no recap of what I just said.",
      "Push back when I'm wrong instead of agreeing politely.",
    ],
    bad: [
      "Be helpful and friendly.",
      "Use a professional tone unless I say otherwise today.",
    ],
  },
  {
    title: "Routines",
    good: [
      "Deep-work mornings 8 to 12, no calls. Schedule meetings after lunch.",
      "Sleep window 11pm–7am, don't suggest tasks past 10pm.",
    ],
    bad: [
      "Tries to be productive every day.",
      "Started a new gym schedule this week, will see how it goes.",
    ],
  },
  {
    title: "Health",
    good: [
      "Lactose intolerant. Suggest dairy-free alternatives in any recipe.",
      "ADHD. Break long plans into short steps and surface one next action at a time.",
    ],
    bad: [
      "Generally healthy.",
      "Had a headache this afternoon.",
    ],
  },
  {
    title: "People",
    good: [
      "Maya: partner, designer, prefers we make travel decisions together.",
      "Jonas: co-founder, handles ops, default to him for legal and finance questions.",
    ],
    bad: [
      "Met someone interesting at a conference last week.",
      "Friend group is great.",
    ],
  },
];

const maintenancePatterns: MaintenancePattern[] = [
  {
    title: "OpenClaw",
    brand: "openclaw",
    recommendation:
      "Recommended: set up a recurring background task that re-reads your profile, compares it against recent conversations, and proposes only durable refinements.",
  },
  {
    title: "Codex",
    brand: "codex",
    recommendation:
      "Recommended: schedule a periodic review that checks whether goals, routines, or preferences have shifted and proposes tightening when they have.",
  },
  {
    title: "Claude Code",
    brand: "claude",
    recommendation:
      "Recommended: keep Creed in local config and pair it with a lightweight recurring reminder that revisits the profile after meaningful work.",
  },
  {
    title: "OpenCode",
    brand: "opencode",
    recommendation:
      "Recommended: reference Creed from your bootstrap instructions and use any existing recurring review flow to keep the profile current instead of letting it drift.",
  },
  {
    title: "Hermes",
    brand: "hermes",
    recommendation:
      "Recommended: keep Creed in a stable bootstrap path and use scheduled scripts to revisit durable context on a cadence you trust.",
  },
  {
    title: "Custom agent",
    brand: "custom",
    recommendation:
      "Recommended: build recurring profile review into your own workflow with cron, queues, or whatever scheduling primitive your stack already uses.",
  },
];

const navItems = sections.map(({ id, label }) => ({ id, label }));

export function DocsPageView() {
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState(navItems[0]?.id ?? "overview");

  const sectionIds = useMemo(() => navItems.map((section) => section.id), []);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const sectionElements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (!sectionElements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible?.target?.id) {
          setActiveSection(visible.target.id);
        }
      },
      {
        rootMargin: "-18% 0px -58% 0px",
        threshold: [0.1, 0.25, 0.5, 0.75],
      }
    );

    sectionElements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [sectionIds]);

  function scrollToSection(sectionId: string) {
    const target = document.getElementById(sectionId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${sectionId}`);
  }

  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <section className="relative h-60 overflow-hidden bg-[#e9e5de] dark:bg-[#0e0e0d] md:h-72">
        <div className="absolute inset-x-0 top-0 h-screen">
          <Image
            src={lightApostlesImage}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center dark:hidden"
          />
          <Image
            src={darkApostlesImage}
            alt=""
            fill
            sizes="100vw"
            className="hidden object-cover object-center dark:block"
          />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,31,60,0.16)_0%,rgba(15,31,60,0.08)_28%,rgba(15,31,60,0.05)_56%,rgba(255,255,255,0)_76%)] dark:bg-[linear-gradient(180deg,rgba(0,0,0,0.32)_0%,rgba(0,0,0,0.18)_28%,rgba(0,0,0,0.08)_56%,rgba(0,0,0,0)_76%)]" />
        <div className="absolute -bottom-[22%] left-[-10%] h-[58%] w-[46%] rounded-[100%] bg-white/82 blur-[112px] dark:bg-[#0e0e0d]/82" />
        <div className="absolute -bottom-[22%] right-[-10%] h-[58%] w-[46%] rounded-[100%] bg-white/82 blur-[112px] dark:bg-[#0e0e0d]/82" />
        <div className="absolute left-1/2 bottom-[-14%] h-[34%] w-[64%] -translate-x-1/2 rounded-[100%] bg-white/40 blur-[128px] dark:bg-[#0e0e0d]/45" />
        <div className="absolute inset-x-0 bottom-0 h-[72%] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(249,249,248,0.025)_20%,rgba(249,249,248,0.14)_42%,rgba(249,249,248,0.48)_68%,rgba(249,249,248,0.86)_86%,#f9f9f8_100%)] dark:bg-[linear-gradient(180deg,rgba(14,14,13,0)_0%,rgba(14,14,13,0.04)_20%,rgba(14,14,13,0.18)_42%,rgba(14,14,13,0.52)_68%,rgba(14,14,13,0.88)_86%,#0e0e0d_100%)]" />
        <div className="absolute left-1/2 bottom-[-24%] h-[54%] w-[148%] -translate-x-1/2 rounded-[50%_50%_0_0] bg-[var(--creed-background)]/82 blur-[26px]" />
        <div className="relative z-10 flex flex-col px-6 py-5 md:px-10 md:py-7">
          <MarketingHeader configured scrolled={scrolled} />
        </div>
      </section>

      <motion.main className="mx-auto max-w-6xl px-6 pb-20 pt-8 md:px-10 md:pb-24 md:pt-10" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0, ease: [0.16, 1, 0.3, 1] }}>
        <div className="border-b border-[var(--creed-border)] pb-8">
          <AnimatedPageTitle
            delay={0.24}
            text="Docs"
            className="t-section text-[var(--creed-text-primary)]"
          />
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.46, delay: 0.42, ease: [0.16, 1, 0.3, 1] }} className="mt-5 max-w-5xl text-[17px] leading-8 text-[var(--creed-text-secondary)] md:text-[18px]">
            What Creed is, how AI uses it, and what belongs in your personal context profile.
          </motion.p>
        </div>

        <div className="mt-8 block md:hidden">
          <div className="text-[13px] font-medium text-[var(--creed-text-tertiary)]">On this page</div>
          <div className="mt-4 flex flex-wrap gap-3">
            {navItems.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  scrollToSection(section.id);
                }}
                className="text-[14px] text-[#2563EB] transition-colors hover:text-[#1D4ED8]"
              >
                {section.label}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-14 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-20">
          <aside className="hidden lg:block">
            <div className="sticky top-28">
              <div className="text-[13px] font-medium text-[var(--creed-text-tertiary)]">
                On this page
              </div>
              <nav className="mt-5 space-y-3">
                {navItems.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      scrollToSection(section.id);
                    }}
                    className={cn(
                      "block text-[14px] leading-6 transition-colors",
                      activeSection === section.id
                        ? "font-medium text-[#2563EB]"
                        : "text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
                    )}
                  >
                    {section.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          <div className="min-w-0">
            {sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                className={cn(
                  "scroll-mt-28 py-8 md:py-10",
                  index === sections.length - 1 ? "" : "border-b border-[var(--creed-border)]"
                )}
              >
                <AnimatedSectionHeading text={section.title} className="t-step" />

                {section.paragraphs ? (
                  <div className="mt-5 space-y-4 text-[15px] leading-8 text-[var(--creed-text-secondary)] md:text-[16px]">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                ) : null}

                {section.bullets ? (
                  <ul className="mt-5 space-y-3 pl-5 text-[15px] leading-8 text-[var(--creed-text-secondary)] md:text-[16px]">
                    {section.bullets.map((item) => (
                      <li key={item} className="list-disc marker:text-[#2563EB]">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {section.id === "how-agents-should-use-creed" ? (
                  <p className="mt-6 text-[15px] leading-8 text-[var(--creed-text-secondary)] md:text-[16px]">
                    Set this up from{" "}
                    <Link href="/connections" className="font-medium text-[#2563EB] hover:text-[#1D4ED8]">
                      Connections
                    </Link>
                    , then review proposed updates from the{" "}
                    <Link href="/file" className="font-medium text-[#2563EB] hover:text-[#1D4ED8]">
                      file view
                    </Link>
                    .
                  </p>
                ) : null}

                {section.id === "recurring-maintenance" ? (
                  <div className="mt-8 grid gap-4 md:grid-cols-2">
                    {maintenancePatterns.map((pattern) => (
                      <div
                        key={pattern.title}
                        className="rounded-[20px] bg-[var(--creed-surface)] p-5"
                      >
                        <div className="flex items-center gap-3">
                          <IntegrationGlyph
                            kind={pattern.brand}
                            framed={false}
                            className="h-7 w-7 shrink-0"
                            assetClassName="h-7 w-7"
                          />
                          <div className="text-[16px] font-medium text-[var(--creed-text-primary)]">
                            {pattern.title}
                          </div>
                        </div>
                        <p className="mt-3 text-[15px] leading-7 text-[var(--creed-text-secondary)] md:text-[16px]">
                          {pattern.recommendation}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {section.id === "how-each-section-works" ? (
                  <div className="mt-8 space-y-8">
                    {sectionGuides.map((guide) => (
                      <div key={guide.title} className="border-t border-[var(--creed-border)] pt-6 first:border-t-0 first:pt-0">
                        <h3 className="text-[18px] font-medium text-[var(--creed-text-primary)]">
                          {guide.title}
                        </h3>
                        <div className="mt-4 grid gap-6 md:grid-cols-2">
                          <div>
                            <div className="text-[12px] font-medium tracking-[0.02em] text-[#2563EB]">
                              What belongs
                            </div>
                            <ul className="mt-3 space-y-2 pl-5 text-[15px] leading-7 text-[var(--creed-text-secondary)] md:text-[16px]">
                              {guide.belongs.map((item) => (
                                <li key={item} className="list-disc marker:text-[#2563EB]">
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <div className="text-[12px] font-medium tracking-[0.02em] text-[var(--creed-text-tertiary)]">
                              What to avoid
                            </div>
                            <ul className="mt-3 space-y-2 pl-5 text-[15px] leading-7 text-[var(--creed-text-secondary)] md:text-[16px]">
                              {guide.avoid.map((item) => (
                                <li key={item} className="list-disc marker:text-[var(--creed-text-tertiary)]">
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {section.id === "good-and-bad-proposal-examples" ? (
                  <div className="mt-8 space-y-8">
                    {exampleGroups.map((group) => (
                      <div key={group.title} className="border-t border-[var(--creed-border)] pt-6 first:border-t-0 first:pt-0">
                        <h3 className="text-[18px] font-medium text-[var(--creed-text-primary)]">
                          {group.title}
                        </h3>
                        <div className="mt-4 grid gap-6 md:grid-cols-2">
                          <div>
                            <div className="text-[12px] font-medium tracking-[0.02em] text-[var(--creed-success)]">
                              Good
                            </div>
                            <ul className="mt-3 space-y-2 text-[15px] leading-7 text-[var(--creed-text-secondary)] md:text-[16px]">
                              {group.good.map((item) => (
                                <li key={item} className="flex items-start gap-2">
                                  <span
                                    aria-hidden
                                    className="mt-[3px] shrink-0 font-mono text-[14px] font-medium leading-6 text-[var(--creed-success)]"
                                  >
                                    +
                                  </span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <div className="text-[12px] font-medium tracking-[0.02em] text-[var(--creed-danger)]">
                              Bad
                            </div>
                            <ul className="mt-3 space-y-2 text-[15px] leading-7 text-[var(--creed-text-secondary)] md:text-[16px]">
                              {group.bad.map((item) => (
                                <li key={item} className="flex items-start gap-2">
                                  <span
                                    aria-hidden
                                    className="mt-[3px] shrink-0 font-mono text-[14px] font-medium leading-6 text-[var(--creed-danger)]"
                                  >
                                    −
                                  </span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </motion.main>

      <MarketingFooter />
    </div>
  );
}
