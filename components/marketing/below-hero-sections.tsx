"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import type { StaticImageData } from "next/image";
import Link from "next/link";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import {
  DirectEditDemo,
  ProposalDemo,
} from "@/components/marketing/governed-demos";
import {
  ConnectDemo,
  CreateDemo,
  UsageDemo,
} from "@/components/marketing/how-it-works-demos";
import {
  ReadDemo,
  ScoreDemo,
  UpdateDemo,
} from "@/components/marketing/how-creed-works-demos";
import { MarketingFooter } from "@/components/marketing/site-chrome";
import { SceneryImage } from "@/components/marketing/scenery-image";
import { useLandingAuthState } from "@/components/marketing/use-landing-auth-state";
import { usePaidStatus } from "@/components/marketing/use-paid-status";
import { useOnboardingResume } from "@/components/marketing/use-onboarding-resume";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { ArrowRightIcon } from "@/components/ui/arrow-right";
import { CommandIcon } from "@/components/ui/command";
import { useRoadmap } from "@/components/marketing/use-roadmap";
import { ROADMAP_STATUS_STYLE } from "@/components/marketing/roadmap-status";
import type { RoadmapColumn, RoadmapTask } from "@/lib/marketing/roadmap";
import { homeFaqItems as faqItems } from "@/lib/marketing/faq";
import { cn } from "@/lib/utils";

const lightFinaleImage = "/assets/landing/scenery/light-finale.png";
const darkFinaleImage = "/assets/landing/scenery/dark-finale.png";

const claudeCodeIcon = "/assets/agents/claudecode.svg";
const codexIcon = "/assets/agents/codex.svg";
const hermesIcon = "/assets/agents/hermes.svg";
const openClawIcon = "/assets/agents/openclaw.svg";
const openCodeIcon = "/assets/agents/opencode.svg";
const cursorIcon = "/assets/agents/cursor.svg";
const devinIcon = "/assets/agents/devin.svg";
const grokIcon = "/assets/agents/grok.svg";
const chatgptIcon = "/assets/agents/chatgpt.svg";
const claudeIcon = "/assets/agents/claude.svg";
const replitIcon = "/assets/agents/replit.svg";
const whirlIcon = "/assets/agents/whirl.svg";
const v0Icon = "/assets/agents/v0.svg";
const customIcon = "/assets/agents/customagent.svg";

type BrandLogoKey =
  | "chatgpt"
  | "claude"
  | "claudecode"
  | "codex"
  | "cursor"
  | "devin"
  | "github"
  | "grok"
  | "hermes"
  | "openclaw"
  | "notion"
  | "obsidian"
  | "opencode"
  | "replit"
  | "whirl"
  | "v0"
  | "custom";

const brandLogoMap: Record<
  BrandLogoKey,
  { src: string | StaticImageData; imageClassName?: string }
> = {
  codex: {
    src: codexIcon,
    imageClassName: "scale-[0.92]",
  },
  cursor: {
    src: cursorIcon,
    imageClassName: "scale-[0.88]",
  },
  devin: {
    src: devinIcon,
    imageClassName: "scale-[0.92]",
  },
  grok: {
    src: grokIcon,
    imageClassName: "scale-[0.84]",
  },
  chatgpt: {
    src: chatgptIcon,
    imageClassName: "scale-[0.9]",
  },
  claude: {
    src: claudeIcon,
    imageClassName: "scale-[0.92]",
  },
  claudecode: {
    src: claudeCodeIcon,
    imageClassName: "scale-[0.92]",
  },
  github: {
    src: "/assets/landing/brands/github.png",
    imageClassName: "scale-[0.86]",
  },
  hermes: {
    src: hermesIcon,
    imageClassName: "scale-[1.02]",
  },
  openclaw: {
    src: openClawIcon,
    imageClassName: "scale-[1.02]",
  },
  notion: {
    src: "/assets/landing/brands/notion.png",
    imageClassName: "scale-[0.82]",
  },
  obsidian: {
    src: "/assets/landing/brands/obsidian.png",
    imageClassName: "scale-[0.82]",
  },
  opencode: {
    src: openCodeIcon,
    imageClassName: "scale-[0.9]",
  },
  replit: {
    src: replitIcon,
    imageClassName: "scale-[0.92]",
  },
  whirl: {
    src: whirlIcon,
    imageClassName: "scale-[0.92]",
  },
  v0: {
    src: v0Icon,
    imageClassName: "scale-[0.82]",
  },
  custom: {
    src: customIcon,
    imageClassName: "scale-[0.94]",
  },
};

export function BelowHeroSections({ configured }: { configured: boolean }) {
  return (
    <main className="bg-[var(--creed-background)]">
      <WhyUseItSection />
      <HowCreedWorksSection />
      <GovernedCollaborationSection />
      <AiFeaturesSection />
      <HowItWorksSection />
      <IntegrationsSection />
      <WhatsOnTheWaySection />
      <FaqSection />
      <ClosingCtaSection configured={configured} />
      <div
        aria-hidden="true"
        className="h-16 bg-[var(--creed-background)] md:h-20"
      />
      <MarketingFooter />
    </main>
  );
}

const WHY_USE_IT_STATS = [
  {
    value: 1_200_000_000,
    suffix: "B+",
    cadence: "/m",
    divisor: 1_000_000_000,
    decimals: 1,
    label: "people use standalone AI tools",
    body: "Each tool starts cold unless your context travels with you.",
    accent: "#2563EB",
  },
  {
    value: 420_000_000,
    suffix: "M",
    cadence: "/m",
    divisor: 1_000_000,
    decimals: 0,
    label: "estimated multi-tool AI users",
    body: "A simple 35 percent estimate across monthly AI users.",
    accent: "#22C55E",
  },
  {
    value: 2_100_000_000_000,
    suffix: "T",
    cadence: "/m",
    divisor: 1_000_000_000_000,
    decimals: 1,
    label: "context tokens left behind",
    body: "Multi-tool users leaving 5,000 useful context tokens behind.",
    accent: "#EC4899",
  },
] as const;

function useCountUp(target: number, durationMs = 1400) {
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);

  useEffect(() => {
    let frameId = 0;
    const from = valueRef.current;
    const distance = target - from;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const nextValue = Math.round(from + distance * eased);
      valueRef.current = nextValue;
      setValue(nextValue);

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [durationMs, target]);

  return value;
}

function AnimatedStatNumber({
  value,
  divisor,
  decimals,
  suffix,
  cadence,
}: {
  value: number;
  divisor: number;
  decimals: number;
  suffix: string;
  cadence: string;
}) {
  const current = useCountUp(value);
  const display = (current / divisor).toFixed(decimals);
  const [whole, fraction] = display.split(".");

  return (
    <span className="inline-flex items-end tabular-nums">
      <span>
        {whole}
        {fraction ? (
          <>
            <span className="mx-[0.04em] inline-block translate-x-[3px] translate-y-[-0.012em] tracking-normal">
              .
            </span>
            {fraction}
          </>
        ) : null}
        {suffix}
      </span>
      <span className="mb-[0.2em] ml-[0.08em] text-[0.34em] font-medium leading-none tracking-[-0.02em] text-[var(--creed-text-primary)]">
        {cadence}
      </span>
    </span>
  );
}

function WhyUseItSection() {
  return (
    <section className="px-6 py-24 md:px-10 md:py-30 lg:px-12">
      <SectionHeading
        headline="Why Use It?"
        subline="AI adoption is exploding. Context is still trapped in the last tool you used."
        className="max-w-[64rem]"
      />

      <div className="mx-auto mt-14 grid max-w-6xl items-stretch gap-5 lg:grid-cols-3">
        {WHY_USE_IT_STATS.map((stat) => (
          <article
            key={stat.label}
            className="flex h-auto min-h-0 flex-col rounded-xl bg-[var(--creed-surface)] p-6 md:h-full md:min-h-[250px] md:p-7"
          >
            <div
              className="text-[4rem] font-semibold leading-[0.9] tracking-[-0.045em] md:text-[5.25rem]"
              style={{ color: stat.accent }}
            >
              <AnimatedStatNumber
                value={stat.value}
                divisor={stat.divisor}
                decimals={stat.decimals}
                suffix={stat.suffix}
                cadence={stat.cadence}
              />
            </div>
            <div className="mt-5">
              <h3 className="text-[1.35rem] font-medium leading-tight tracking-[-0.025em] text-[var(--creed-text-primary)]">
                {stat.label}
              </h3>
              <p className="t-body mt-3 text-[var(--creed-text-secondary)]">{stat.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// A bento tile whose media slot is a flat colour plate with an interactive
// demo floating on it, and the explainer copy below. The two cards stretch to
// equal height via the grid; the plate flexes to fill.
function PlateCard({
  plateColor,
  plateClassName,
  number,
  numberColor,
  title,
  body,
  square = false,
  children,
}: {
  plateColor: string;
  plateClassName?: string;
  number?: string;
  numberColor?: string;
  title: string;
  body: string;
  square?: boolean;
  children: ReactNode;
}) {
  return (
    <article
      className={cn(
        "flex min-w-0 flex-col rounded-xl bg-[var(--creed-surface)] p-3 md:p-4",
        !square && "h-full",
      )}
    >
      <div
        className={cn(
          "relative flex min-w-0 items-center justify-center overflow-hidden rounded-xl p-4 sm:p-6",
          // Square plate at the 3-up desktop width; auto height (content) when
          // the grid collapses to one column so a full-width square isn't huge.
          square ? "lg:aspect-square" : "min-h-[380px] flex-1",
          plateClassName,
        )}
        style={{ backgroundColor: plateColor }}
      >
        <div className="relative min-w-0 w-full">{children}</div>
      </div>
      <div className="mt-4 px-1 md:mt-5">
        <h3 className="t-step text-[var(--creed-text-primary)]">
          {number ? (
            <span
              className="mr-2 font-semibold"
              style={{ color: numberColor ?? "var(--creed-text-tertiary)" }}
            >
              {number}
            </span>
          ) : null}
          {title}
        </h3>
        <p className="t-body mt-2.5 text-[var(--creed-text-secondary)]">
          {body}
        </p>
      </div>
    </article>
  );
}

// The headline storyteller: the Creed loop (read -> update -> refine) told as
// three alternating rows, each a live auto-playing demo built from the real app
// UI floating on a flat colour plate. Sits first, above the supporting sections.
function HowCreedWorksSection() {
  return (
    <section className="px-6 py-24 md:px-10 md:py-30 lg:px-12">
      <SectionHeading
        headline="How It Works"
        subline="The profile your agents read, update, and keep sharp."
        className="max-w-[60rem]"
      />

      <div className="mx-auto mt-12 max-w-5xl space-y-5 md:mt-16 md:space-y-6">
        <LoopRow
          title="Every agent reads it first"
          body="Before it answers, any agent pulls your Creed over MCP, so you never re-explain who you are, what you're building, or how you like to work."
          plate="var(--plate-connect)"
        >
          <ReadDemo />
        </LoopRow>
        <LoopRow
          title="It updates as it learns"
          body="When an agent notices something durable, it proposes a precise edit. It lands in your Creed as a diff. Approve it and the section updates in place."
          plate="var(--plate-proposal)"
          flip
        >
          <UpdateDemo />
        </LoopRow>
        <LoopRow
          title="And it sharpens over time"
          body="Creed scores every section for signal, what's specific and what's thin, so your profile keeps getting sharper without you auditing it."
          plate="var(--plate-create)"
        >
          <ScoreDemo />
        </LoopRow>
      </div>
    </section>
  );
}

// One alternating row: explainer copy on one side, the demo on a flat colour
// plate on the other. `flip` swaps the sides on desktop; both stack text-first
// on mobile for reading flow.
function LoopRow({
  title,
  body,
  plate,
  flip = false,
  children,
}: {
  title: string;
  body: string;
  plate: string;
  flip?: boolean;
  children: ReactNode;
}) {
  return (
    // Each row is its own surface card (matching the other sections), holding the
    // explainer copy and the demo side by side.
    <article className="rounded-xl bg-[var(--creed-surface)] p-3 md:p-4">
      <div className="grid items-stretch gap-3 lg:grid-cols-2 lg:gap-4">
        <div
          className={cn(
            "flex flex-col justify-center px-4 py-6 md:px-8",
            flip ? "lg:order-2" : "lg:order-1",
          )}
        >
          <h3 className="text-[1.55rem] font-medium leading-[1.12] tracking-[-0.025em] text-[var(--creed-text-primary)] md:text-[1.85rem]">
            {title}
          </h3>
          <p className="t-body-lg mt-3.5 max-w-md text-[var(--creed-text-secondary)]">
            {body}
          </p>
        </div>
        <div className={cn("flex min-w-0", flip ? "lg:order-1" : "lg:order-2")}>
          {/* Flat colour plate filling its half of the card, with a uniform
              min-height across rows so the cards line up. The demo inside hugs
              its content and is centred, so the Update pill can expand/collapse
              smoothly without changing the plate's height. `inert` keeps the
              decorative demos' buttons out of the tab order + a11y tree. */}
          <div
            className="flex min-h-[420px] w-full items-center justify-center rounded-xl p-5"
            style={{ backgroundColor: plate }}
          >
            <div className="w-full max-w-[440px]" inert>
              {children}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function GovernedCollaborationSection() {
  return (
    <section className="px-6 py-20 md:px-10 md:py-24 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <SectionHeading
          headline="Review everything or nothing"
          subline="Approve every agent edit, or let them write directly."
        />

        <div className="mt-12 grid items-stretch gap-5 md:grid-cols-2">
          <PlateCard
            plateColor="var(--plate-proposal)"
            title="You control what gets remembered."
            body="Agents propose updates in real time, but nothing changes until you approve it."
          >
            <ProposalDemo />
          </PlateCard>
          <PlateCard
            plateColor="var(--plate-direct)"
            title="Let trusted agents write directly."
            body="Agents can update your Creed without review, keeping your context current as you work."
          >
            <DirectEditDemo />
          </PlateCard>
        </div>
      </div>
    </section>
  );
}

const PANEL_DEMO_STEPS = [
  {
    mode: "Search",
    prompt: "billing",
    status: "Open billing settings",
    action: "Take me there",
  },
  {
    mode: "Ask",
    prompt: "what changed in Goals?",
    status: "Goals has 2 proposals and one accepted edit this week.",
    action: "Summarized",
  },
  {
    mode: "Agent",
    prompt: "tighten my Work section",
    status: "Drafting a reversible proposal",
    action: "Review diff",
  },
] as const;

function useCyclingIndex(length: number, intervalMs = 2400) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setIndex((current) => (current + 1) % length),
      intervalMs,
    );
    return () => window.clearInterval(intervalId);
  }, [intervalMs, length]);

  return index;
}

function useTypedPanelPrompt(text: string, resetKey: number) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    setTyped("");
    let index = 0;
    let intervalId: number | undefined;
    const startTimeoutId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        index += 1;
        setTyped(text.slice(0, index));
        if (index >= text.length && intervalId !== undefined) {
          window.clearInterval(intervalId);
        }
      }, 34);
    }, 240);

    return () => {
      window.clearTimeout(startTimeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [resetKey, text]);

  return typed;
}

function PanelFeatureDemo() {
  const stepIndex = useCyclingIndex(PANEL_DEMO_STEPS.length);
  const step = PANEL_DEMO_STEPS[stepIndex];
  const typedPrompt = useTypedPanelPrompt(step.prompt, stepIndex);

  return (
    <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[0_10px_30px_rgba(28,28,26,0.10)]">
      <div className="flex items-center gap-2 border-b border-[var(--creed-border)] px-3.5 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-[8px] bg-[#FCE7F3] text-[#DB2777] dark:bg-[#3F1230] dark:text-[#F472B6]">
          <CommandIcon size={14} />
        </span>
        <div className="min-w-0 flex-1 text-[13px] font-medium text-[var(--creed-text-primary)]">
          Panel
        </div>
        <div className="flex rounded-[8px] bg-[var(--creed-surface-raised)] p-0.5">
          {PANEL_DEMO_STEPS.map((item, index) => (
            <span
              key={item.mode}
              className={cn(
                "rounded-[6px] px-2 py-1 text-[10px] font-medium transition-colors duration-200",
                index === stepIndex
                  ? "bg-[var(--creed-surface)] text-[var(--creed-text-primary)] shadow-sm"
                  : "text-[var(--creed-text-tertiary)]",
              )}
            >
              {item.mode}
            </span>
          ))}
        </div>
      </div>

      <div className="p-3.5">
        <div className="rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 py-2.5 text-[13px] text-[var(--creed-text-primary)]">
          {typedPrompt || "\u00A0"}
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 rounded-md bg-[var(--creed-surface-raised)] px-3 py-2.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-[3px] bg-[#DB2777]" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--creed-text-primary)]">
              {step.status}
            </span>
          </div>
          <div className="flex items-center gap-2 px-1 text-[12px] text-[var(--creed-text-tertiary)]">
            <span className="rounded-[5px] bg-[var(--creed-surface-raised)] px-1.5 py-0.5 font-medium text-[var(--creed-text-secondary)]">
              ↵
            </span>
            <span>{step.action}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// The Tab demo loop, mirroring the real in-editor flow: a line types out, Tab
// is pressed (the keycap depresses), the in-app ring spinner runs while the
// suggestion is in flight, the whole ghost appears at once, and a second Tab
// press solidifies it. No caret, no word-by-word streaming, no colour change.
const TAB_DEMO_PREFIX = "Keep replies short and";
const TAB_DEMO_GHOST = " lead with the answer, not the setup.";

type TabDemoPhase =
  | "typing"
  | "press-invoke"
  | "loading"
  | "ghost"
  | "press-accept"
  | "accepted"
  | "pause";

const TAB_DEMO_PHASE_MS: Record<Exclude<TabDemoPhase, "typing">, number> = {
  "press-invoke": 170,
  loading: 950,
  ghost: 1500,
  "press-accept": 170,
  accepted: 2400,
  pause: 300,
};

const TAB_DEMO_NEXT: Record<Exclude<TabDemoPhase, "typing">, TabDemoPhase> = {
  "press-invoke": "loading",
  loading: "ghost",
  ghost: "press-accept",
  "press-accept": "accepted",
  accepted: "pause",
  pause: "typing",
};

function TabFeatureDemo() {
  const [phase, setPhase] = useState<TabDemoPhase>("typing");
  const [typedChars, setTypedChars] = useState(0);

  useEffect(() => {
    if (phase === "typing") {
      if (typedChars >= TAB_DEMO_PREFIX.length) {
        const id = window.setTimeout(() => setPhase("press-invoke"), 420);
        return () => window.clearTimeout(id);
      }
      const id = window.setTimeout(() => setTypedChars((c) => c + 1), 46);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => {
      if (phase === "accepted") setTypedChars(0);
      setPhase(TAB_DEMO_NEXT[phase]);
    }, TAB_DEMO_PHASE_MS[phase]);
    return () => window.clearTimeout(id);
  }, [phase, typedChars]);

  const pressed = phase === "press-invoke" || phase === "press-accept";
  const showGhost = phase === "ghost" || phase === "press-accept";

  return (
    <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[0_10px_30px_rgba(28,28,26,0.10)]">
      <div className="flex items-center gap-2 border-b border-[var(--creed-border)] px-3.5 py-3">
        <span className="h-4 w-1 shrink-0 rounded-[3px] bg-[#06B6D4]" />
        <div className="min-w-0 flex-1 text-[13px] font-medium text-[var(--creed-text-primary)]">
          Preferences
        </div>
        <span
          className={cn(
            "rounded-[6px] border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--creed-text-secondary)] transition-all duration-150",
            pressed &&
              "translate-y-[1px] scale-95 bg-[var(--creed-border)] text-[var(--creed-text-primary)]",
          )}
        >
          Tab
        </span>
      </div>

      <div className="min-h-[132px] p-4 text-[14px] leading-[1.7] text-[var(--creed-text-primary)]">
        <span>{TAB_DEMO_PREFIX.slice(0, typedChars)}</span>
        {phase === "accepted" ? <span>{TAB_DEMO_GHOST}</span> : null}
        {showGhost ? (
          <span className="text-[var(--creed-text-tertiary)]">
            {TAB_DEMO_GHOST}
          </span>
        ) : null}
        {phase === "loading" ? (
          <span className="creed-tab-spinner" aria-hidden />
        ) : null}
        {phase === "ghost" ? (
          <span className="ml-2 inline-flex items-center gap-1 align-middle text-[11px] text-[var(--creed-text-tertiary)]">
            <kbd className="inline-flex h-4 items-center rounded border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] px-1 text-[10px] font-medium leading-none text-[var(--creed-text-secondary)]">
              Tab
            </kbd>
            accept
          </span>
        ) : null}
      </div>
    </div>
  );
}

function AiFeaturesSection() {
  return (
    <section className="px-6 py-24 md:px-10 md:py-30 lg:px-12">
      <SectionHeading
        headline="AI inside the file"
        subline="Three focused surfaces, each built for a different kind of help."
        className="max-w-[64rem]"
      />

      <div className="mx-auto mt-14 grid max-w-6xl items-stretch gap-5 lg:grid-cols-3">
        <PlateCard
          plateColor="#2563EB"
          plateClassName="min-h-[272px]"
          title="Analysis"
          body="Score every section for signal, weak spots, and what to sharpen next."
          square
        >
          <ScoreDemo />
        </PlateCard>
        <PlateCard
          plateColor="#EC4899"
          title="Panel"
          body="Search, ask, and let Creed draft reversible edits without leaving the file."
          square
        >
          <PanelFeatureDemo />
        </PlateCard>
        <PlateCard
          plateColor="#22C55E"
          title="Tab"
          body="Press Tab and it finishes the thought in your voice, drawn from your whole file."
          square
        >
          <TabFeatureDemo />
        </PlateCard>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section className="px-6 py-24 md:px-10 md:py-30 lg:px-12">
      <SectionHeading
        headline="Get started in minutes"
        subline="Three steps to a profile every agent can read."
        className="max-w-[52rem]"
      />

      <div className="mx-auto mt-14 grid max-w-6xl items-start gap-5 lg:grid-cols-3">
        <PlateCard
          plateColor="#FBBF24"
          number="1"
          numberColor="#FBBF24"
          title="Describe yourself"
          body="Answer a few quick questions and Creed drafts your starter profile."
          square
        >
          <CreateDemo />
        </PlateCard>
        <PlateCard
          plateColor="#F97316"
          number="2"
          numberColor="#F97316"
          title="Extract your context"
          body="Pull the context you've already built across your tools into one profile."
          square
        >
          <ConnectDemo />
        </PlateCard>
        <PlateCard
          plateColor="#EF4444"
          number="3"
          numberColor="#EF4444"
          title="Monitor usage"
          body="See where your AI allowance goes across Analysis, Tab, and Panel."
          square
        >
          <UsageDemo />
        </PlateCard>
      </div>
    </section>
  );
}

// Roadmap-style colour pairs for compact stack tiles: soft tinted cap,
// saturated label. Monochrome brands share a neutral pair.
const STACK_TILE_STYLE: Record<BrandLogoKey, { fill: string; text: string }> = {
  chatgpt: {
    fill: "bg-[#F3F4F6] dark:bg-[#1f1f1d]",
    text: "text-[#1F1F1A] dark:text-[#e7e7e2]",
  },
  claude: {
    fill: "bg-[#FFF1E7] dark:bg-[#3a1f12]/55",
    text: "text-[#C2410C] dark:text-[#FB923C]",
  },
  claudecode: {
    fill: "bg-[#FFF1E7] dark:bg-[#3a1f12]/55",
    text: "text-[#C2410C] dark:text-[#FB923C]",
  },
  codex: {
    fill: "bg-[#EFF6FF] dark:bg-[#102341]/60",
    text: "text-[var(--creed-accent-hover)] dark:text-[#60A5FA]",
  },
  cursor: {
    fill: "bg-[#F3F4F6] dark:bg-[#1f1f1d]",
    text: "text-[#1F1F1A] dark:text-[#e7e7e2]",
  },
  custom: {
    fill: "bg-[#F3F4F6] dark:bg-[#252932]/70",
    text: "text-[#4B5563] dark:text-[#D1D5DB]",
  },
  devin: {
    fill: "bg-[#F3F4F6] dark:bg-[#1f1f1d]",
    text: "text-[#1F1F1A] dark:text-[#e7e7e2]",
  },
  github: {
    fill: "bg-[#F3F4F6] dark:bg-[#1f1f1d]",
    text: "text-[#1F1F1A] dark:text-[#e7e7e2]",
  },
  grok: {
    fill: "bg-[#F3F4F6] dark:bg-[#1f1f1d]",
    text: "text-[#1F1F1A] dark:text-[#e7e7e2]",
  },
  hermes: {
    fill: "bg-[#FFFBEB] dark:bg-[#3a2a12]/50",
    text: "text-[#B45309] dark:text-[#FBBF24]",
  },
  notion: {
    fill: "bg-[#F3F4F6] dark:bg-[#1f1f1d]",
    text: "text-[#1F1F1A] dark:text-[#e7e7e2]",
  },
  obsidian: {
    fill: "bg-[#F5F3FF] dark:bg-[#2d1b45]/55",
    text: "text-[#6D28D9] dark:text-[#A78BFA]",
  },
  openclaw: {
    fill: "bg-[#FEF2F2] dark:bg-[#3F1212]/50",
    text: "text-[#DC2626] dark:text-[#F87171]",
  },
  opencode: {
    fill: "bg-[#F3F4F6] dark:bg-[#1f1f1d]",
    text: "text-[#1F1F1A] dark:text-[#e7e7e2]",
  },
  replit: {
    fill: "bg-[#FFF1E7] dark:bg-[#3a1f12]/55",
    text: "text-[#C2410C] dark:text-[#FB923C]",
  },
  whirl: {
    fill: "bg-[#EFF6FF] dark:bg-[#102341]/60",
    text: "text-[var(--creed-accent-hover)] dark:text-[#60A5FA]",
  },
  v0: {
    fill: "bg-[#F3F4F6] dark:bg-[#1f1f1d]",
    text: "text-[#1F1F1A] dark:text-[#e7e7e2]",
  },
};

function StackTile({ brand, label }: { brand: BrandLogoKey; label: string }) {
  const style = STACK_TILE_STYLE[brand];

  return (
    <div className="flex w-full min-w-0 flex-col overflow-hidden rounded-xl bg-[var(--creed-surface)]">
      <div
        className={cn(
          "flex min-h-10 items-center justify-center px-2 py-2.5",
          style.fill,
        )}
      >
        <div
          className={cn(
            "text-center text-[12px] font-medium leading-tight tracking-[-0.01em]",
            style.text,
          )}
        >
          {label}
        </div>
      </div>
      <div className="flex min-h-16 items-center justify-center px-2 py-4">
        <BrandImage brand={brand} label={label} className="h-10 w-10" />
      </div>
    </div>
  );
}

function IntegrationsSection() {
  const agents: Array<{ label: string; brand: BrandLogoKey }> = [
    { label: "ChatGPT", brand: "chatgpt" },
    { label: "Claude", brand: "claude" },
    { label: "Grok", brand: "grok" },
    { label: "OpenClaw", brand: "openclaw" },
    { label: "Hermes", brand: "hermes" },
    { label: "Cursor", brand: "cursor" },
    { label: "OpenCode", brand: "opencode" },
    { label: "Devin", brand: "devin" },
    { label: "Codex", brand: "codex" },
    { label: "Claude Code", brand: "claudecode" },
    { label: "Replit", brand: "replit" },
    { label: "Whirl", brand: "whirl" },
    { label: "v0", brand: "v0" },
    { label: "Custom", brand: "custom" },
  ];
  return (
    <section className="px-6 py-24 md:px-10 md:py-30 lg:px-12">
      <SectionHeading
        headline="Works with your stack"
        subline="Connect Creed once, then every AI you talk to knows you instantly."
        className="max-w-[64rem]"
      />

      <div className="mx-auto mt-14 grid max-w-[46rem] grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-7">
        {agents.map((item) => (
          <StackTile key={item.label} brand={item.brand} label={item.label} />
        ))}
      </div>
    </section>
  );
}

// A teaser of the live roadmap: the top item in each status (Next, In Progress,
// Shipped), pulled from the same median board as the /roadmap page. Renders
// nothing until data arrives, and hides itself if the board is empty or
// unavailable, so it never shows an empty shell on the landing page.
function WhatsOnTheWaySection() {
  const columns = useRoadmap();

  const cards = (columns ?? [])
    .map((column) => ({ column, task: column.tasks[0] }))
    .filter((entry): entry is { column: RoadmapColumn; task: RoadmapTask } =>
      Boolean(entry.task),
    );

  if (cards.length === 0) return null;

  return (
    <section className="px-6 py-24 md:px-10 md:py-30 lg:px-12">
      <SectionHeading
        headline="What's on the way"
        subline="The top of each stage, pulled live from our task board."
        className="max-w-[56rem]"
      />

      <div className="mx-auto mt-14 flex max-w-6xl flex-wrap justify-center gap-5">
        {cards.map(({ column, task }) => (
          <RoadmapTeaserCard key={column.id} column={column} task={task} />
        ))}
      </div>
    </section>
  );
}

// One teaser card: a colour-coded status header bar built into the card (the
// look from the reference roadmap), then the feature title and a short summary.
function RoadmapTeaserCard({
  column,
  task,
}: {
  column: RoadmapColumn;
  task: RoadmapTask;
}) {
  const style = ROADMAP_STATUS_STYLE[column.id];
  return (
    <article className="flex w-full flex-col overflow-hidden rounded-xl bg-[var(--creed-surface)] sm:w-[340px]">
      <div className={cn("px-5 py-2.5", style.fill)}>
        <span className={cn("text-[14px] font-medium", style.text)}>
          {column.label}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-[16px] font-medium leading-snug tracking-[-0.01em] text-[var(--creed-text-primary)]">
          {task.title}
        </h3>
        {task.description ? (
          <p className="t-body mt-2 line-clamp-2 text-[var(--creed-text-secondary)]">
            {task.description}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function FaqSection() {
  return (
    <section className="px-6 py-24 md:px-10 md:py-30 lg:px-12">
      <SectionHeading headline="Questions" />

      <div className="mx-auto mt-14 max-w-[46rem]">
        <FaqAccordion items={faqItems} />
      </div>
    </section>
  );
}

function ClosingCtaSection({ configured }: { configured: boolean }) {
  const authState = useLandingAuthState(configured);
  const paidStatus = usePaidStatus(configured);
  const canResume = useOnboardingResume(configured);
  const isPaid = authState === "signed-in" && paidStatus === "paid";
  const closingArrow = useAnimatedIconControls(80, undefined, 420);

  return (
    <section className="relative flex min-h-[94svh] items-center overflow-hidden bg-[var(--creed-background)]">
      {/* Full-bleed closing art (theme-paired light/dark), the bookend to the
          hero. SceneryImage self-heals to a labelled placeholder until the file
          is dropped into public/assets/landing/scenery/. */}
      <SceneryImage
        src={lightFinaleImage}
        fileName="light-finale.png"
        label="Light finale"
        hint="wide landscape, ~2400x1400"
        className="dark:hidden"
      />
      <SceneryImage
        src={darkFinaleImage}
        fileName="dark-finale.png"
        label="Dark finale"
        hint="wide landscape, ~2400x1400"
        className="hidden dark:block"
      />

      {/* Light, soft scrim localized behind the copy so the white headline stays
          legible without visibly dimming the art. Sits under the melt layer so
          the faded edges stay clean page background. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(92%_54%_at_50%_50%,rgba(0,0,0,0.16)_0%,rgba(0,0,0,0.05)_46%,rgba(0,0,0,0)_70%)]" />

      {/* Melt the art into the page background at both the top and bottom edges,
          so it reads as a band the page opens into and out of. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "var(--scenery-fade-band)" }}
      />

      <div className="relative z-10 mx-auto w-full max-w-4xl px-6 py-24 text-center md:px-10 md:py-30 lg:px-12">
        <SectionTitle className="t-section justify-center text-white">
          Stop starting from scratch
        </SectionTitle>

        <p className="t-lede mx-auto mt-5 max-w-2xl text-white/85">
          Every agent you use, already up to speed.
        </p>

        <div className="mt-9 flex justify-center">
          {isPaid ? (
            <Link
              href="/file"
              onMouseEnter={closingArrow.start}
              onMouseLeave={closingArrow.settle}
              onPointerDown={(event) => {
                if (event.pointerType !== "mouse") closingArrow.start();
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white pl-4 pr-3 text-[14px] font-medium text-[#19345f] transition-colors hover:bg-[#f6f7fb]"
            >
              <span className="leading-none">Go to app</span>
              <ArrowRightIcon
                ref={closingArrow.iconRef}
                size={16}
                className="inline-flex shrink-0 items-center justify-center leading-none"
              />
            </Link>
          ) : (
            <Link
              href={canResume ? "/onboarding" : "/pricing"}
              onMouseEnter={closingArrow.start}
              onMouseLeave={closingArrow.settle}
              onPointerDown={(event) => {
                if (event.pointerType !== "mouse") closingArrow.start();
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white pl-4 pr-3 text-[14px] font-medium text-[#19345f] transition-colors hover:bg-[#f6f7fb]"
            >
              <span className="leading-none">
                {canResume ? "Resume" : "Get Started"}
              </span>
              <ArrowRightIcon
                ref={closingArrow.iconRef}
                size={16}
                className="inline-flex shrink-0 items-center justify-center leading-none"
              />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  headline,
  subline,
  align = "center",
  className,
}: {
  headline: string;
  subline?: string;
  align?: "center" | "left";
  className?: string;
}) {
  const centered = align === "center";

  return (
    <div
      className={cn(
        centered
          ? "mx-auto max-w-3xl px-2 text-center sm:px-0 md:max-w-[72rem]"
          : "mx-auto max-w-3xl px-2 text-center sm:px-0 md:mx-0 md:max-w-2xl md:text-left",
        className,
      )}
    >
      <SectionTitle
        className={cn(
          "t-section text-[var(--creed-text-primary)]",
          centered ? "justify-center" : "justify-center md:justify-start",
        )}
      >
        {headline}
      </SectionTitle>
      {subline ? (
        <p
          className={cn(
            "t-lede mt-5 max-w-2xl text-[var(--creed-text-tertiary)]",
            centered ? "mx-auto" : "mx-auto md:mx-0",
          )}
        >
          {subline}
        </p>
      ) : null}
    </div>
  );
}

// Black-on-white brand logos that need flipping to white in dark mode.
// Coloured brand assets (Claude, Codex, OpenClaw, Hermes, etc.) skip this.
const MONOCHROME_BRANDS = new Set<BrandLogoKey>([
  "github",
  "opencode",
  "cursor",
  "devin",
  "grok",
  "chatgpt",
  "v0",
  "custom",
]);

function BrandImage({
  brand,
  label,
  className,
}: {
  brand: BrandLogoKey;
  label: string;
  className?: string;
}) {
  const asset = brandLogoMap[brand];
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md bg-[var(--creed-surface-raised)] text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--creed-text-tertiary)]",
          className,
        )}
        title={typeof asset.src === "string" ? asset.src : label}
      >
        {label.slice(0, 2)}
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <Image
        src={asset.src}
        alt={label}
        fill
        sizes="160px"
        className={cn(
          "pointer-events-none select-none object-contain",
          MONOCHROME_BRANDS.has(brand) && "creed-invert-on-dark",
          asset.imageClassName,
        )}
        draggable={false}
        onError={() => setErrored(true)}
      />
    </div>
  );
}

// Static section title. The per-glyph blur-in lives only on the landing hero
// and onboarding now; below-hero titles render plainly (keeping the same
// flex-wrap line handling so multi-line and single-line headings lay out the
// same as before).
function SectionTitle({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const lines = children.split("\n");
  const hasExplicitBreak = lines.length > 1;

  return (
    <h2
      className={cn(
        "flex flex-wrap",
        !hasExplicitBreak && "md:flex-nowrap",
        className,
      )}
    >
      {lines.map((line, lineIndex) => (
        <span
          key={`${line}-${lineIndex}`}
          className={
            hasExplicitBreak
              ? "basis-full whitespace-nowrap"
              : "basis-auto whitespace-normal md:whitespace-nowrap"
          }
        >
          {line}
        </span>
      ))}
    </h2>
  );
}
