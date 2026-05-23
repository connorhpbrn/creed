"use client";

import { useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import type { StaticImageData } from "next/image";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { MarketingFooter } from "@/components/marketing/site-chrome";
import { useLandingAuthState } from "@/components/marketing/use-landing-auth-state";
import { usePaidStatus } from "@/components/marketing/use-paid-status";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { ArrowRightIcon } from "@/components/ui/arrow-right";
import { splitPreservingLigatures } from "@/lib/landing-text";
import { cn } from "@/lib/utils";

const claudeCodeIcon = "/assets/agents/claudecode.svg";
const codexIcon = "/assets/agents/codex.svg";
const hermesIcon = "/assets/agents/hermes.svg";
const openClawIcon = "/assets/agents/openclaw.svg";
const openCodeIcon = "/assets/agents/opencode.svg";

type BrandLogoKey =
  | "chatgpt"
  | "claude"
  | "github"
  | "hermes"
  | "openclaw"
  | "notion"
  | "obsidian"
  | "opencode";

const brandLogoMap: Record<
  BrandLogoKey,
  { src: string | StaticImageData; imageClassName?: string }
> = {
  chatgpt: {
    src: codexIcon,
    imageClassName: "scale-[0.92]",
  },
  claude: {
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
};

const faqItems = [
  {
    question: "What actually goes in a Creed?",
    answer:
      "Who you are, what you're working toward, how you like AI to talk to you, the people and routines that shape your week, plus any health, accessibility, or hard noes AI should respect. One concise profile, not a journal.",
  },
  {
    question: "Why not just retell every AI who I am each time?",
    answer:
      "Because it doesn't stick, doesn't cross tools, and you end up repeating yourself. Creed gives every AI the same profile to read before answering, and lets them propose updates as they learn more about you.",
  },
  {
    question: "Which tools does Creed work with?",
    answer:
      "Creed is built for tools like Claude Code, Codex, Hermes, OpenClaw, and custom agents. Support for tools like Notion and Obsidian is coming for editing and storage.",
  },
  {
    question: "What gets written back to Creed?",
    answer:
      "Durable things AI learns about you, a sharper preference, a new routine, a goal that shifted. Not session recap, not mood, not generic praise.",
  },
  {
    question: "Do I have to review every change?",
    answer:
      "No. You can keep agent edits reviewable, or trust them to write directly when you want a lighter loop. The point is control when you want it, not friction by default.",
  },
  {
    question: "Is Creed for teams or just for me?",
    answer: "Creed is a personal profile. A team version is in the works.",
  },
];

const titleViewport = { once: true, amount: 0.86 } as const;

export function BelowHeroSections({ configured }: { configured: boolean }) {
  return (
    <main className="bg-[var(--creed-background)] pb-12">
      <CreedBentoSection />
      <GovernedCollaborationSection />
      <HowItWorksSection />
      <IntegrationsSection />
      <FaqSection />
      <ClosingCtaSection configured={configured} />
      <MarketingFooter />
    </main>
  );
}

function CreedBentoSection() {
  return (
    <section className="px-6 py-20 md:px-10 md:py-24 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          headline="The home for your personal context"
          subline="Everything that makes an AI useful to you, in one place."
        />

        <ScreenshotStage />
      </div>
    </section>
  );
}

function ScreenshotStage() {
  return (
    <MediaSlot
      src="/assets/landing/screenshots/light-overview.png"
      darkSrc="/assets/landing/screenshots/dark-overview.png"
      filename="overview.png"
      width={1480}
      height={1080}
      className="mx-auto mt-10 max-w-3xl rounded-[28px] md:rounded-[36px]"
      imageClassName="object-cover object-top"
    />
  );
}

// Landing-asset naming convention (canonical — keep code references in sync):
//
//   /assets/landing/backgrounds/{light|dark}-<name>.avif  // hero backgrounds (apostles)
//   /assets/landing/screenshots/{light|dark}-<name>.png   — UI shots (overview, review, propose)
//   /assets/landing/graphics/{light|dark}-<name>.png      — step illustrations (create, connect, review)
//   /assets/landing/brands/<name>.png                     — third-party logos (mono variants flipped via .creed-invert-on-dark)
//
// Every below-hero image is theme-paired. `MediaSlot` and `BrandImage` render
// a clean placeholder (path + dimensions) when a referenced file isn't on
// disk yet — so a missing image surfaces in dev as a visible card telling
// you what to add, not a silent blank tile.
function MediaSlot({
  src,
  darkSrc,
  filename,
  width,
  height,
  className,
  imageClassName,
}: {
  src: string;
  darkSrc?: string;
  filename: string;
  width: number;
  height: number;
  className?: string;
  imageClassName?: string;
}) {
  const [errored, setErrored] = useState(false);

  return (
    <div
      className={cn("relative w-full overflow-hidden", className)}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {errored ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[var(--creed-surface-raised)] px-4 text-center text-[var(--creed-text-secondary)]">
          <div className="t-meta break-all font-mono opacity-90">
            {(() => {
              const trimmed = src.replace(/^\/+/, "");
              const lastSlash = trimmed.lastIndexOf("/");
              if (lastSlash < 0) return trimmed;
              return (
                <>
                  <span className="opacity-60">/{trimmed.slice(0, lastSlash)}/</span>
                  {trimmed.slice(lastSlash + 1)}
                </>
              );
            })()}
          </div>
          <div className="t-meta opacity-60">
            {width} × {height}
          </div>
        </div>
      ) : (
        <>
          <Image
            src={src}
            alt={filename}
            fill
            sizes="(min-width: 1024px) 768px, 100vw"
            className={cn("object-cover", darkSrc && "dark:hidden", imageClassName)}
            onError={() => setErrored(true)}
          />
          {darkSrc ? (
            <Image
              src={darkSrc}
              alt={filename}
              fill
              sizes="(min-width: 1024px) 768px, 100vw"
              className={cn("hidden object-cover dark:block", imageClassName)}
              // If either variant fails to load (e.g. one of the new
              // light-/dark- files isn't on disk yet) we still want the
              // dev placeholder, not a silent blank tile.
              onError={() => setErrored(true)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function GovernedCollaborationSection() {
  return (
    <section className="px-6 py-20 md:px-10 md:py-24 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          headline="Review everything or nothing"
          subline="Approve every agent edit, or let them write directly."
          align="left"
        />

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <MediaSlot
            src="/assets/landing/screenshots/light-review.png"
            darkSrc="/assets/landing/screenshots/dark-review.png"
            filename="review.png"
            width={870}
            height={856}
            className="rounded-[28px] md:rounded-[32px]"
            imageClassName="object-cover object-top"
          />
          <MediaSlot
            src="/assets/landing/screenshots/light-nothing.png"
            darkSrc="/assets/landing/screenshots/dark-nothing.png"
            filename="nothing.png"
            width={870}
            height={856}
            className="rounded-[28px] md:rounded-[32px]"
            imageClassName="object-cover object-top"
          />
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    {
      number: "1",
      title: "Create your Creed",
      body: "Answer a few sharp questions and generate your starter profile.",
      imageSrc: "/assets/landing/graphics/light-create.png",
      imageDarkSrc: "/assets/landing/graphics/dark-create.png",
    },
    {
      number: "2",
      title: "Connect your agents",
      body: "Paste one prompt and they’ll read your profile before answering you.",
      imageSrc: "/assets/landing/graphics/light-connect.png",
      imageDarkSrc: "/assets/landing/graphics/dark-connect.png",
    },
    {
      number: "3",
      title: "Review what sticks",
      body: "Approve the updates worth keeping and let your profile sharpen over time.",
      imageSrc: "/assets/landing/graphics/light-improve.png",
      imageDarkSrc: "/assets/landing/graphics/dark-improve.png",
    },
  ];

  return (
    <section className="px-6 py-24 md:px-10 md:py-30 lg:px-12">
      <SectionHeading
        headline="How Creed works"
        subline="Set your context once and let your agents keep it sharp."
        className="max-w-[52rem]"
      />

      <div className="mx-auto mt-14 grid max-w-6xl gap-14 lg:grid-cols-3">
        {steps.map((step) => (
          <article key={step.number} className="relative w-full">
            <MediaSlot
              src={step.imageSrc}
              darkSrc={step.imageDarkSrc}
              filename={step.imageSrc.split("/").pop() ?? ""}
              width={600}
              height={600}
              className="rounded-[28px] bg-[#ECEDF1] dark:bg-[var(--creed-surface-raised)] md:rounded-[32px]"
            />
            <div className="mt-5 px-1">
              <h3 className="t-step text-[var(--creed-text-primary)]">
                <span className="mr-2 font-normal text-[var(--creed-text-tertiary)]">{step.number}</span>
                {step.title}
              </h3>
              <p className="t-body mt-2.5 max-w-[20rem] text-[var(--creed-text-secondary)]">
                {step.body}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function IntegrationsSection() {
  const agents = [
    { label: "Codex", brand: "chatgpt" as const },
    { label: "Claude", brand: "claude" as const },
    { label: "Hermes", brand: "hermes" as const },
    { label: "OpenClaw", brand: "openclaw" as const },
    { label: "OpenCode", brand: "opencode" as const },
  ];
  const integrations = [
    { label: "GitHub", brand: "github" as const },
    { label: "Notion", brand: "notion" as const },
    { label: "Obsidian", brand: "obsidian" as const },
  ];

  return (
    <section className="px-6 py-24 md:px-10 md:py-30 lg:px-12">
      <SectionHeading
        headline="Works with your stack"
        subline="Connect Creed once, then every AI you talk to knows you instantly."
        className="max-w-[64rem]"
      />

      {/* Both rows share the same column track so Integrations icons line up
          directly under the first three Agents. Centred under the section
          heading. */}
      <div className="mx-auto mt-14 grid max-w-[44rem] gap-10">
        <div>
          <div className="t-body-lg font-medium text-[var(--creed-text-primary)]">Agents</div>
          <div className="mt-6 grid grid-cols-3 justify-items-start gap-x-3 gap-y-7 md:grid-cols-5">
            {agents.map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-3">
                <div className="flex h-[96px] w-[96px] items-center justify-center rounded-2xl bg-[var(--creed-surface)]">
                  <BrandImage brand={item.brand} label={item.label} className="h-[52px] w-[52px]" />
                </div>
                <div className="t-body text-[var(--creed-text-secondary)]">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="t-body-lg font-medium text-[var(--creed-text-primary)]">Integrations</div>
          <div className="mt-6 grid grid-cols-3 justify-items-start gap-x-3 gap-y-7 md:grid-cols-5">
            {integrations.map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-3">
                <div className="flex h-[96px] w-[96px] items-center justify-center rounded-2xl bg-[var(--creed-surface)]">
                  <BrandImage brand={item.brand} label={item.label} className="h-[52px] w-[52px]" />
                </div>
                <div className="t-body text-[var(--creed-text-secondary)]">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="px-6 py-24 md:px-10 md:py-30 lg:px-12">
      <SectionHeading headline="Questions" />

      <div className="mx-auto mt-14 max-w-4xl">
        {faqItems.map((item, index) => {
          const open = openIndex === index;

          return (
            <div key={item.question} className="border-b border-[var(--creed-border)]">
              <button
                type="button"
                onClick={() => setOpenIndex(open ? -1 : index)}
                className="flex w-full items-center justify-between gap-6 py-7 text-left"
              >
                <span className="t-body-lg font-medium text-[var(--creed-text-primary)]">{item.question}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-300",
                    open && "rotate-180"
                  )}
                />
              </button>

              <div
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                  open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
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
    </section>
  );
}

function ClosingCtaSection({ configured }: { configured: boolean }) {
  const authState = useLandingAuthState(configured);
  const paidStatus = usePaidStatus(configured);
  const isPaid = authState === "signed-in" && paidStatus === "paid";
  const closingArrow = useAnimatedIconControls(80, undefined, 420);

  return (
    <section className="px-6 py-24 md:px-10 md:py-30 lg:px-12">
      <div className="mx-auto max-w-4xl text-center">
        <AnimatedSectionTitle className="t-section justify-center text-[var(--creed-text-primary)]">
          {"Give every agent\nthe same starting point"}
        </AnimatedSectionTitle>

        <ClosingFadeIn delay={1.55}>
          <p className="t-lede mx-auto mt-5 max-w-2xl text-[var(--creed-text-tertiary)]">
            Try Creed today for completely free.
          </p>
        </ClosingFadeIn>

        <ClosingFadeIn delay={1.85}>
          <div className="mt-9 flex justify-center">
            {isPaid ? (
              <Link
                href="/file"
                onMouseEnter={closingArrow.start}
                onMouseLeave={closingArrow.settle}
                onPointerDown={(event) => {
                  if (event.pointerType !== "mouse") closingArrow.start();
                }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#2563EB] pl-4 pr-3 text-[14px] font-medium text-white transition-colors hover:bg-[#1D4ED8]"
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
                href="/pricing"
                onMouseEnter={closingArrow.start}
                onMouseLeave={closingArrow.settle}
                onPointerDown={(event) => {
                  if (event.pointerType !== "mouse") closingArrow.start();
                }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#2563EB] pl-4 pr-3 text-[14px] font-medium text-white transition-colors hover:bg-[#1D4ED8]"
              >
                <span className="leading-none">Get Started</span>
                <ArrowRightIcon
                  ref={closingArrow.iconRef}
                  size={16}
                  className="inline-flex shrink-0 items-center justify-center leading-none"
                />
              </Link>
            )}
          </div>
        </ClosingFadeIn>
      </div>
    </section>
  );
}

function ClosingFadeIn({
  delay,
  children,
}: {
  delay: number;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={titleViewport}
      transition={{ delay, duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
      style={{ willChange: "transform, opacity, filter" }}
    >
      {children}
    </motion.div>
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
        className
      )}
    >
      <AnimatedSectionTitle
        className={cn(
          "t-section text-[var(--creed-text-primary)]",
          centered ? "justify-center" : "justify-center md:justify-start"
        )}
      >
        {headline}
      </AnimatedSectionTitle>
      {subline ? (
        <p
          className={cn(
            "t-lede mt-5 max-w-2xl text-[var(--creed-text-tertiary)]",
            centered ? "mx-auto" : "mx-auto md:mx-0"
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
const MONOCHROME_BRANDS = new Set<BrandLogoKey>(["github", "opencode"]);

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
          className
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
          asset.imageClassName
        )}
        draggable={false}
        onError={() => setErrored(true)}
      />
    </div>
  );
}

function AnimatedSectionTitle({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const lines = useMemo(() => children.split("\n"), [children]);
  const hasExplicitBreak = lines.length > 1;

  return (
    <motion.h2
      initial="hidden"
      whileInView="visible"
      viewport={titleViewport}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: 0.042,
          },
        },
      }}
      className={cn("flex flex-wrap", !hasExplicitBreak && "md:flex-nowrap", className)}
    >
      {lines.map((line, lineIndex) => {
        const words = line.split(" ");
        return (
          <span
            key={`${line}-${lineIndex}`}
            className={cn(
              hasExplicitBreak
                ? "basis-full whitespace-nowrap"
                : "basis-auto whitespace-normal md:basis-auto md:whitespace-nowrap"
            )}
          >
            {words.map((word, wordIndex) => (
              <span
                key={`${word}-${lineIndex}-${wordIndex}`}
                className="inline-block whitespace-nowrap"
              >
                {splitPreservingLigatures(word).map((glyph, glyphIndex) => (
                  <motion.span
                    key={`${glyph}-${lineIndex}-${wordIndex}-${glyphIndex}`}
                    variants={{
                      hidden: { opacity: 0, filter: "blur(10px)", y: 10 },
                      visible: { opacity: 1, filter: "blur(0px)", y: 0 },
                    }}
                    transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
                    className="inline-block whitespace-pre"
                  >
                    {glyph}
                  </motion.span>
                ))}
                {wordIndex < words.length - 1 ? (
                  <motion.span
                    variants={{
                      hidden: { opacity: 0, filter: "blur(10px)", y: 10 },
                      visible: { opacity: 1, filter: "blur(0px)", y: 0 },
                    }}
                    transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
                    className="inline-block whitespace-pre"
                  >
                    {" "}
                  </motion.span>
                ) : null}
              </span>
            ))}
          </span>
        );
      })}
    </motion.h2>
  );
}
