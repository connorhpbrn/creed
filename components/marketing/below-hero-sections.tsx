"use client";

import { useState, type ReactNode } from "react";
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
  ReviewDemo,
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
    <main className="bg-[var(--creed-background)] pb-12">
      <HowCreedWorksSection />
      <GovernedCollaborationSection />
      <HowItWorksSection />
      <IntegrationsSection />
      <WhatsOnTheWaySection />
      <FaqSection />
      <ClosingCtaSection configured={configured} />
      <MarketingFooter />
    </main>
  );
}

// A bento tile whose media slot is a flat colour plate with an interactive
// demo floating on it, and the explainer copy below. The two cards stretch to
// equal height via the grid; the plate flexes to fill.
function PlateCard({
  plateColor,
  number,
  numberColor,
  title,
  body,
  square = false,
  children,
}: {
  plateColor: string;
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
        "flex flex-col rounded-2xl bg-[var(--creed-surface)] p-3 md:p-4",
        !square && "h-full",
      )}
    >
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-xl p-4 sm:p-6",
          // Square plate at the 3-up desktop width; auto height (content) when
          // the grid collapses to one column so a full-width square isn't huge.
          square ? "lg:aspect-square" : "min-h-[380px] flex-1",
        )}
        style={{ backgroundColor: plateColor }}
      >
        <div className="relative w-full">{children}</div>
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
        headline="How Creed works"
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
    <article className="rounded-2xl bg-[var(--creed-surface)] p-3 md:p-4">
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
        <div className={cn("flex", flip ? "lg:order-1" : "lg:order-2")}>
          {/* Flat colour plate filling its half of the card, with a uniform
              min-height across rows so the cards line up. The demo inside hugs
              its content and is centred, so the Update pill can expand/collapse
              smoothly without changing the plate's height. `inert` keeps the
              decorative demos' buttons out of the tab order + a11y tree. */}
          <div
            className="flex min-h-[420px] w-full items-center justify-center rounded-[16px] p-5"
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
          plateColor="var(--plate-create)"
          number="1"
          numberColor="#ec4899"
          title="Describe yourself"
          body="Answer a few quick questions and Creed drafts your starter profile."
          square
        >
          <CreateDemo />
        </PlateCard>
        <PlateCard
          plateColor="var(--plate-connect)"
          number="2"
          numberColor="#22c55e"
          title="Extract your context"
          body="Pull the context you've already built across your tools into one profile."
          square
        >
          <ConnectDemo />
        </PlateCard>
        <PlateCard
          plateColor="var(--plate-improve)"
          number="3"
          numberColor="#2563eb"
          title="Review and improve"
          body="See what your starter Creed scores, then keep sharpening it over time."
          square
        >
          <ReviewDemo />
        </PlateCard>
      </div>
    </section>
  );
}

// Each tile's name is coloured to match its icon's dominant brand colour.
// Mono icons (ChatGPT, Grok, Cursor, OpenCode, Devin, v0, Custom, GitHub,
// Notion) fall through to the primary text colour so the name reads as the
// same monochrome as the glyph. Hermes' yellow is darkened in light mode so
// it stays legible on the white card.
const STACK_NAME_ACCENT: Partial<Record<BrandLogoKey, string>> = {
  claude: "text-[#FF6200]",
  claudecode: "text-[#FF6200]",
  codex: "text-[#0066FF]",
  openclaw: "text-[#FF0000]",
  hermes: "text-[#B58900] dark:text-[#FFBB00]",
  replit: "text-[#F26207]",
  whirl: "text-[#0066FF]",
  obsidian: "text-[#7C3AED]",
};

function StackTile({ brand, label }: { brand: BrandLogoKey; label: string }) {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-2.5 rounded-2xl bg-[var(--creed-surface)] px-2 py-4">
      <BrandImage brand={brand} label={label} className="h-10 w-10" />
      <div
        className={cn(
          "text-center text-[12px] font-medium leading-tight tracking-[-0.01em]",
          STACK_NAME_ACCENT[brand] ?? "text-[var(--creed-text-primary)]",
        )}
      >
        {label}
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
    <article className="flex w-full flex-col overflow-hidden rounded-2xl bg-[var(--creed-surface)] sm:w-[340px]">
      <div className={cn("px-5 py-2.5", style.fill)}>
        <span className={cn("text-[14px] font-medium", style.text)}>
          {column.label}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        {task.code ? (
          <div className="font-mono text-[11px] tracking-tight text-[var(--creed-text-tertiary)]">
            {task.code}
          </div>
        ) : null}
        <h3 className="mt-1.5 text-[16px] font-medium leading-snug tracking-[-0.01em] text-[var(--creed-text-primary)]">
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
