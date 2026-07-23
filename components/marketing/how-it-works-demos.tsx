"use client";

// Three auto-playing mini-demos for the "How Creed works" steps, reflecting the
// current app:
//  - CreateDemo: a mini onboarding interview that types through the starter
//    questions, then lands on a ready state.
//  - ConnectDemo: a single "All agents" card mashing up the onboarding
//    copy-prompt button and the Connections all-agents glyph, with the button
//    repeatedly flashing copied.
//  - UsageDemo: a small stacked usage chart for the three AI features.
// Client-only mock state, mobile-first (everything stacks vertically), no backend.

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { AnimatedIconButton } from "@/components/creed/animated-icon-action";
import { AnimatedCheckmark } from "@/components/ui/animated-checkmark";
import { CopyIcon } from "@/components/ui/copy";

const EASE = [0.22, 1, 0.36, 1] as const;

// ----- step 1: create (mini interview) -------------------------------------

const INTERVIEW = [
  { label: "How would you describe yourself?", placeholder: "Founder and designer in Lisbon" },
  { label: "What are you working toward?", placeholder: "Ship the v2 beta by August" },
  { label: "How should AI reply to you?", placeholder: "Lead with the answer, keep it tight" },
] as const;
const CREATE_ACCENT = "#FBBF24";

function useTypedLoop(text: string, active: boolean, speedMs = 32) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!active) {
      setTyped("");
      return;
    }

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
      }, speedMs);
    }, 300);

    return () => {
      window.clearTimeout(startTimeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [active, speedMs, text]);

  return typed;
}

export function CreateDemo() {
  const [step, setStep] = useState(0);
  const total = INTERVIEW.length;
  const done = step >= total;
  const current = INTERVIEW[Math.min(step, total - 1)];
  const typed = useTypedLoop(current.placeholder, !done);

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setStep((currentStep) => (currentStep >= total ? 0 : currentStep + 1)),
      done ? 1500 : 2300,
    );
    return () => window.clearTimeout(timeoutId);
  }, [done, step, total]);

  return (
    <div className="w-full">
      <div className="flex min-h-[232px] flex-col rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4 shadow-[0_8px_24px_rgba(28,28,26,0.04)] lg:min-h-0">
        <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--creed-surface-raised)]">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: CREATE_ACCENT }}
            initial={false}
            animate={{ width: `${(Math.min(step, total) / total) * 100}%` }}
            transition={{ duration: 0.4, ease: EASE }}
          />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {!done ? (
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.24, ease: EASE }}
              className="lg:min-h-[164px]"
            >
              <div className="mt-4 text-[12px] font-medium text-[var(--creed-text-tertiary)]">
                Question {step + 1} of {total}
              </div>
              <div className="mt-1 text-[16px] font-medium leading-snug text-[var(--creed-text-primary)]">
                {current.label}
              </div>
              <div className="mt-3 flex h-11 items-center rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] px-3.5 text-[14px] text-[var(--creed-text-primary)]">
                <span className="truncate">
                  {typed || "\u00A0"}
                </span>
              </div>
              <div className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--creed-text-primary)] px-4 text-[13px] font-medium text-[var(--creed-button-primary-fg)]">
                {step === total - 1 ? "Create my Creed" : "Continue"}
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, ease: EASE }}
              className="flex flex-1 flex-col items-center justify-center gap-3 text-center lg:min-h-[164px]"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#ECFDF5] text-[#16A34A] dark:bg-[#052e1a]/55 dark:text-[#4ade80]">
                <Check className="h-4 w-4" />
              </span>
              <div className="text-[14px] font-medium text-[var(--creed-text-primary)]">Your starter Creed is ready</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ----- step 2: connect (all-agents mashup) ---------------------------------

const ALL_AGENTS_MASK = {
  WebkitMaskImage: "url(/assets/agents/all.svg)",
  maskImage: "url(/assets/agents/all.svg)",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
  maskPosition: "center",
  WebkitMaskSize: "contain",
  maskSize: "contain",
} as const;

export function ConnectDemo() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1150);
    }, 2600);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="w-full">
      <div className="flex w-full flex-col rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5 text-left">
        <div className="flex items-center gap-3">
          {/* All-agents glyph recoloured by the cycling palette: the asset is a
              monochrome svg, so we mask the cycling background to its shape. */}
          <span aria-hidden className="creed-copy-cycle inline-block h-9 w-9 shrink-0" style={ALL_AGENTS_MASK} />
          <div>
            <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">All agents</div>
            <div className="mt-1 text-[13px] text-[var(--creed-text-secondary)]">One prompt connects them all.</div>
          </div>
        </div>
        <p className="mt-4 text-[13px] leading-6 text-[var(--creed-text-secondary)]">
          Paste it into any AI. It reads your Creed before every reply.
        </p>
        <div className="mt-4">
          <AnimatedIconButton
            type="button"
            icon={CopyIcon}
            showIcon={!copied}
            className="creed-copy-cycle min-w-[116px] justify-center rounded-md px-4 text-white"
            tabIndex={-1}
          >
            {copied ? (
              <>
                <AnimatedCheckmark className="h-4 w-4" size={16} />
                Copied
              </>
            ) : (
              "Copy prompt"
            )}
          </AnimatedIconButton>
        </div>
      </div>
    </div>
  );
}

// ----- step 3: usage --------------------------------------------------------

const USAGE_DAYS = [
  { label: "Jul 17", analysis: 34, tab: 0, panel: 8 },
  { label: "Jul 18", analysis: 22, tab: 10, panel: 6 },
  { label: "Jul 19", analysis: 45, tab: 18, panel: 14 },
  { label: "Jul 20", analysis: 18, tab: 22, panel: 4 },
  { label: "Jul 21", analysis: 30, tab: 14, panel: 18 },
  { label: "Jul 22", analysis: 52, tab: 20, panel: 12 },
  { label: "Jul 23", analysis: 26, tab: 28, panel: 10 },
] as const;

const USAGE_COLORS = {
  analysis: "#2563EB",
  tab: "#16A34A",
  panel: "#DB2777",
} as const;

export function UsageDemo() {
  const [active, setActive] = useState(0);
  const tooltipDay = USAGE_DAYS[active];
  const tooltipRows = [
    { label: "Analysis", value: tooltipDay.analysis, color: USAGE_COLORS.analysis },
    { label: "Tab", value: tooltipDay.tab, color: USAGE_COLORS.tab },
    { label: "Panel", value: tooltipDay.panel, color: USAGE_COLORS.panel },
  ] as const;

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setActive((index) => (index + 1) % USAGE_DAYS.length),
      900,
    );
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="w-full">
      <div className="rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4 shadow-[0_8px_24px_rgba(28,28,26,0.04)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[13px] font-medium text-[var(--creed-text-secondary)]">
              Credits spend
            </div>
            <div className="mt-1 text-[26px] font-medium tracking-[-0.04em] text-[var(--creed-text-primary)]">
              $3.24
            </div>
          </div>
          <span className="rounded-md border border-[var(--creed-border)] px-2 py-1 text-[12px] text-[var(--creed-text-secondary)]">
            30d
          </span>
        </div>

        <div className="relative mt-5 flex h-[116px] items-end gap-2 border-b border-dashed border-[var(--creed-border)] pb-1">
          {USAGE_DAYS.map((day, index) => {
            const total = day.analysis + day.tab + day.panel;
            const height = 34 + total * 0.72;
            const selected = index === active;
            return (
              <div
                key={index}
                className="flex min-w-0 flex-1 flex-col justify-end"
                style={{ height }}
              >
                <motion.div
                  animate={{ opacity: selected ? 1 : 0.62, scaleY: selected ? 1 : 0.94 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  className="flex w-full origin-bottom flex-col justify-end overflow-hidden rounded-t-[8px]"
                >
                  <div
                    className="w-full"
                    style={{
                      height: `${(day.panel / total) * height}px`,
                      backgroundColor: USAGE_COLORS.panel,
                    }}
                  />
                  <div
                    className="w-full"
                    style={{
                      height: `${(day.tab / total) * height}px`,
                      backgroundColor: USAGE_COLORS.tab,
                    }}
                  />
                  <div
                    className="w-full"
                    style={{
                      height: `${(day.analysis / total) * height}px`,
                      backgroundColor: USAGE_COLORS.analysis,
                    }}
                  />
                </motion.div>
              </div>
            );
          })}

          <motion.div
            key={active}
            initial={{ opacity: 0, scale: 0.95, y: 3 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.15, ease: EASE }}
            className={[
              "pointer-events-none absolute bottom-4 z-10 grid min-w-[8rem] items-start gap-1.5 rounded-sm border border-[var(--creed-border)] bg-[var(--creed-surface)] px-2.5 py-2 text-[12px] shadow-[0_12px_32px_rgba(28,28,26,0.12)]",
              active <= 3 ? "origin-bottom-left" : "origin-bottom-right",
            ].join(" ")}
            style={{
              left:
                active <= 3
                  ? `clamp(0px, calc(${((active + 0.5) / USAGE_DAYS.length) * 100}% + 1.375rem), calc(100% - 8rem))`
                  : `clamp(0px, calc(${((active + 0.5) / USAGE_DAYS.length) * 100}% - 9.375rem), calc(100% - 8rem))`,
            }}
          >
            <div className="font-medium text-[var(--creed-text-primary)]">
              {tooltipDay.label}
            </div>
            <div className="grid gap-1.5">
              {tooltipRows.map(({ label, value, color }) => (
                <div
                  key={label}
                  className="flex w-full items-center justify-between gap-3"
                >
                  <span className="flex items-center gap-1.5 text-[var(--creed-text-secondary)]">
                    <span
                      className="h-2.5 w-2.5 rounded-[2px]"
                      style={{ backgroundColor: color }}
                    />
                    {label}
                  </span>
                  <span className="font-mono text-[var(--creed-text-primary)]">
                    ${(value / 100).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-[var(--creed-text-secondary)]">
          {[
            ["Analysis", USAGE_COLORS.analysis],
            ["Tab", USAGE_COLORS.tab],
            ["Panel", USAGE_COLORS.panel],
          ].map(([label, color]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-[3px]"
                style={{ backgroundColor: color }}
              />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
