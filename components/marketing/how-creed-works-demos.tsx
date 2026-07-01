"use client";

// Three auto-playing mini-demos for the "How Creed works" section, telling the
// Creed loop in three beats, each looping while on screen:
//  - ReadDemo:   a generic chatbot. A prompt types into the input bar, sends,
//                the agent calls `read creed` (tool chip), then answers from the
//                profile.
//  - UpdateDemo: a proposal card (agent + "proposed" + diff stats + Reject /
//                Accept) starts collapsed, expands its diff, then is accepted.
//  - ScoreDemo:  a section is auto-scored; the ring fills, tags resolve, then the
//                quality notes open one at a time (accordion) like in the app.
// Built from the REAL app primitives (diff helpers, QualityRing, the .ProseMirror
// section styles) fed client-only mock data. Each demo pauses off-screen and
// parks on a resting frame under reduced motion. No backend.

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, Check, ChevronDown, X } from "lucide-react";
import { AgentIconStack } from "@/components/creed/agent-icon-stack";
import {
  DiffBadge,
  computeDiffParts,
  summarizeDiff,
} from "@/components/creed/inline-proposal-diff";
import {
  QualityRing,
  qualityScoreColor,
} from "@/components/creed/file-quality-ui";
import { accentColorMap, accentTintMap } from "@/lib/creed-data";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

// Editor bullet markup (li.creed-list-item > p) so the shared .ProseMirror
// styles paint a single squircle marker per item, matching the real file.
const bulletList = (items: string[]) =>
  `<ul class="creed-list creed-list-bullet">${items
    .map((item) => `<li class="creed-list-item"><p>${item}</p></li>`)
    .join("")}</ul>`;

// Optimistic in-view tracker: reports `true` immediately and lets an
// IntersectionObserver pause the loop only once the element is actually scrolled
// off-screen. Defaulting to visible means the demo still plays in environments
// where IO callbacks are delayed or unavailable, rather than freezing on frame 0.
function useInViewLoose(ref: React.RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => setInView(entries[0]?.isIntersecting ?? true),
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

// Drives a looping step machine while the demo is on screen. `durations[i]` is
// how long step `i` is held before advancing; the sequence wraps. Off-screen it
// rewinds to 0 (so it replays on scroll-in); under reduced motion it parks on
// `restStep` and never advances. Pass a module-stable `durations` array.
function useLoopSequence(durations: readonly number[], restStep: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInViewLoose(ref);
  const reduce = useReducedMotion();
  const playing = inView && !reduce;
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!playing) {
      setStep(reduce ? restStep : 0);
      return;
    }
    const timer = window.setTimeout(
      () => setStep((s) => (s + 1) % durations.length),
      durations[step],
    );
    return () => window.clearTimeout(timer);
  }, [playing, step, reduce, restStep, durations]);

  return { ref, step, setStep, playing };
}

// The Creed mark, masked so it picks up the current text colour (rather than the
// fixed black/white brand asset) and can be sized down to sit inline with text.
function CreedGlyph({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{
        WebkitMaskImage: "url(/assets/brand/logo.svg)",
        maskImage: "url(/assets/brand/logo.svg)",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}

// Shared demo card shell - the white surface card the UI floats on, matching
// the proposal / quality cards used across the app.
function DemoCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4 shadow-[0_8px_24px_rgba(28,28,26,0.06)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

// Renders a word-level diff's parts as add / remove / unchanged spans.
function DiffParts({ parts }: { parts: ReturnType<typeof computeDiffParts> }) {
  return (
    <>
      {parts.map((part, i) => {
        if (part.added)
          return (
            <span key={i} className="creed-diff-add">
              {part.value}
            </span>
          );
        if (part.removed)
          return (
            <span key={i} className="creed-diff-remove">
              {part.value}
            </span>
          );
        return <span key={i}>{part.value}</span>;
      })}
    </>
  );
}

// Reveals a string word by word in a smooth "waterfall" cascade. Each word holds
// its layout space (inline-block) so nothing reflows; re-runs whenever `play`
// flips back to true (each loop) and clears when it goes false.
function WaterfallText({ text, play }: { text: string; play: boolean }) {
  const words = useMemo(() => text.split(" "), [text]);
  return (
    <>
      {words.map((word, i) => (
        <motion.span
          key={i}
          className="mr-[0.28em] inline-block"
          initial={false}
          animate={
            play
              ? { opacity: 1, y: 0, filter: "blur(0px)" }
              : { opacity: 0, y: 4, filter: "blur(3px)" }
          }
          transition={{
            duration: 0.32,
            delay: play ? i * 0.045 : 0,
            ease: EASE,
          }}
        >
          {word}
        </motion.span>
      ))}
    </>
  );
}

// ----- beat 1: read --------------------------------------------------------

const READ_PROMPT = "Plan my week so I actually ship Helm v2.";
// 0 typing the prompt, 1 sent (bubble), 2 read-creed (loading), 3 thought, 4 answer.
const READ_STEPS = [2000, 600, 1100, 900, 3000] as const;

export function ReadDemo() {
  const { ref, step, playing } = useLoopSequence(
    READ_STEPS,
    READ_STEPS.length - 1,
  );
  const [typed, setTyped] = useState("");

  // Typewriter while on the first step; cleared otherwise (the bar shows its
  // placeholder once the prompt has been "sent").
  useEffect(() => {
    if (!playing || step !== 0) {
      setTyped("");
      return;
    }
    setTyped("");
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setTyped(READ_PROMPT.slice(0, i));
      if (i >= READ_PROMPT.length) window.clearInterval(id);
    }, 42);
    return () => window.clearInterval(id);
  }, [playing, step]);

  const reveal = (from: number) => ({
    opacity: step >= from ? 1 : 0,
    y: step >= from ? 0 : 6,
  });

  return (
    <div ref={ref} className="w-full">
      <DemoCard className="min-h-[352px]">
        <div className="space-y-2.5">
          <motion.div
            animate={reveal(1)}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex justify-end"
          >
            <div className="max-w-[84%] rounded-[14px] bg-[var(--creed-surface-raised)] px-3.5 py-2 text-[13px] leading-snug text-[var(--creed-text-primary)]">
              {READ_PROMPT}
            </div>
          </motion.div>

          <motion.div
            animate={reveal(2)}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex"
          >
            <div className="inline-flex items-center gap-2 rounded-[14px] bg-[var(--creed-surface-raised)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--creed-text-secondary)]">
              <CreedGlyph className="h-3 w-3" />
              <span>Read creed.md</span>
              {step >= 3 ? (
                <Check className="h-3 w-3 text-[var(--creed-success)]" />
              ) : (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-50" />
              )}
            </div>
          </motion.div>

          <motion.div
            animate={{ opacity: step >= 3 ? 1 : 0 }}
            transition={{ duration: 0.3 }}
            className="text-[12px] text-[var(--creed-text-tertiary)]"
          >
            Thought for 4s
          </motion.div>

          <div className="text-[13px] leading-6 text-[var(--creed-text-primary)]">
            <WaterfallText
              text="Blocking 7 to 11am for deep work, no meetings before noon, and Wednesdays stay call-free. I lined the week up around the Helm v2 beta. Want it day by day?"
              play={step >= 4}
            />
          </div>
        </div>

        {/* Mini prompt bar pinned to the bottom: the prompt types in here, then sends. */}
        <div className="mt-auto flex items-center gap-2 rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] py-1.5 pl-3.5 pr-1.5">
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--creed-text-primary)]">
            {step === 0 && typed ? (
              typed
            ) : (
              <span className="text-[var(--creed-text-tertiary)]">
                Ask anything…
              </span>
            )}
          </span>
          {/* Send button greys out when there's nothing to send (empty bar, or
              right after the prompt is "sent"), and turns blue while the typed
              prompt is sitting in the bar - so sending reads like a click. */}
          <span
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-200",
              step === 0 && typed
                ? "bg-[var(--creed-accent)] text-white"
                : "bg-[var(--creed-surface-raised)] text-[var(--creed-text-tertiary)]",
            )}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </span>
        </div>
      </DemoCard>
    </div>
  );
}

// ----- beat 2: update ------------------------------------------------------

const ROUTINES_BASE = [
  "Deep work 7 to 11am, no meetings before noon.",
  "Review the week every Friday at 4pm.",
  "Ship to production Monday through Thursday only.",
];
const ROUTINES_ADD = "Batch code review into a single block after standup.";
const ROUTINES_BASE_PLAIN = ROUTINES_BASE.join("\n");
const ROUTINES_APPLIED_PLAIN = [...ROUTINES_BASE, ROUTINES_ADD].join("\n");
const ROUTINES_BASE_HTML = bulletList(ROUTINES_BASE);
const ROUTINES_APPLIED_HTML = bulletList([...ROUTINES_BASE, ROUTINES_ADD]);

// 0 = collapsed (just the bar), 1 = expanded (diff dropped down), 2 = accepted.
// Parks on 1 under reduced motion so the edit stays visible.
const UPDATE_STEPS = [1400, 3000, 2600] as const;

// Compact proposal card: the agent logo, "proposed", and the diff stats with
// Reject / Accept on one line. The word-level diff drops down below when
// `expanded`, with a smooth height animation.
function MiniProposalDiff({
  base,
  proposed,
  agentName,
  expanded,
  onAccept,
  onReject,
}: {
  base: string;
  proposed: string;
  agentName: string;
  expanded: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const parts = useMemo(
    () => computeDiffParts(base, proposed),
    [base, proposed],
  );
  const stats = useMemo(() => summarizeDiff(parts), [parts]);
  return (
    <div className="rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[0_8px_24px_rgba(28,28,26,0.04)]">
      <div className="flex items-center gap-2 py-2 pl-3 pr-2 text-sm text-[var(--creed-text-secondary)]">
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-300",
            expanded ? "rotate-0" : "-rotate-90",
          )}
        />
        <AgentIconStack
          agents={[agentName]}
          variant="inline"
          itemClassName="h-5 w-5"
          maxVisible={1}
        />
        <span className="text-[var(--creed-text-tertiary)]">proposed</span>
        <span className="text-[var(--creed-text-tertiary)]">·</span>
        <span className="inline-flex items-center gap-1">
          <DiffBadge tone="added" count={stats.added} size="md" />
          <DiffBadge tone="removed" count={stats.removed} size="md" />
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onReject}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
          >
            <X className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reject</span>
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-[var(--creed-accent)] px-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--creed-accent-hover)]"
          >
            <Check className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Accept</span>
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--creed-border)]" />
            <div className="creed-diff-block px-4 py-3">
              <DiffParts parts={parts} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function UpdateDemo() {
  const { ref, step, setStep } = useLoopSequence(UPDATE_STEPS, 1);
  const accent = accentColorMap.workflows;
  const accepted = step >= 2;
  const expanded = step === 1;

  return (
    <div ref={ref} className="w-full">
      <DemoCard>
        <div className="flex items-center gap-2.5">
          <span
            className="h-7 w-[3px] shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
          />
          <span className="text-[15px] font-medium" style={{ color: accent }}>
            Routines
          </span>
          <AnimatePresence>
            {accepted ? (
              <motion.span
                key="accepted"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="ml-auto inline-flex items-center gap-1 rounded-[6px] bg-[#ECFDF5] px-1.5 py-0.5 text-[10px] font-medium text-[#047857] dark:bg-[#052e1a]/55 dark:text-[#4ade80]"
              >
                Accepted
                <Check className="h-3 w-3" />
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>

        <div
          className="ProseMirror mt-3"
          style={
            {
              "--section-accent-bar": accent,
              "--section-accent-tint": accentTintMap.workflows,
            } as React.CSSProperties
          }
          dangerouslySetInnerHTML={{
            __html: accepted ? ROUTINES_APPLIED_HTML : ROUTINES_BASE_HTML,
          }}
        />

        <AnimatePresence initial={false}>
          {!accepted ? (
            <motion.div
              key="diff"
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 14 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="overflow-hidden"
            >
              <MiniProposalDiff
                base={ROUTINES_BASE_PLAIN}
                proposed={ROUTINES_APPLIED_PLAIN}
                agentName="Codex"
                expanded={expanded}
                onAccept={() => setStep(2)}
                onReject={() => setStep(0)}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </DemoCard>
    </div>
  );
}

// ----- beat 3: refine ------------------------------------------------------

// 0 loading, 1 resolved (tags in, no note open), 2-4 open each note in turn.
const SCORE_STEPS = [1300, 1500, 1900, 1900, 2400] as const;
const SCORE_TARGET = 64;

type ScoreTag = { label: string; tone: "green" | "amber" | "red" };
const SCORE_TAGS: ScoreTag[] = [
  { label: "Specific", tone: "green" },
  { label: "Concrete", tone: "green" },
  { label: "Thin", tone: "amber" },
  { label: "Vague", tone: "red" },
];
const TAG_TONE_CLASS: Record<ScoreTag["tone"], string> = {
  green: "bg-[#ECFDF5] text-[#047857] dark:bg-[#052e1a]/55 dark:text-[#4ade80]",
  amber: "bg-[#FFFBEB] text-[#92400E] dark:bg-[#451a03]/55 dark:text-[#fbbf24]",
  red: "bg-[#FEF2F2] text-[#B91C1C] dark:bg-[#3F1212]/55 dark:text-[#fca5a5]",
};

type ScoreNote = {
  tone: "good" | "mid" | "bad";
  title: string;
  detail: string;
};
const SCORE_NOTES: ScoreNote[] = [
  {
    tone: "good",
    title: "Reads like a real person",
    detail: "Names the company, the role, and where you are.",
  },
  {
    tone: "mid",
    title: "One line stays generic",
    detail: "Tighten the opener so it could only describe you.",
  },
  {
    tone: "bad",
    title: "Contains a stray line",
    detail: "A leftover scratch note near the end reads like noise.",
  },
];

// Eases a displayed integer from 0 -> target whenever `run` flips true. Skips the
// tween (snaps to target) when `animate` is false, e.g. reduced motion.
function useCountUp(target: number, run: boolean, animate: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) {
      setValue(0);
      return;
    }
    if (!animate) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const duration = 760;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, animate, target]);
  return value;
}

// One quality note: a row that opens to reveal its detail. `open` is controlled
// by the demo loop so the notes play as an accordion (one open at a time).
function ScoreNoteRow({
  tone,
  title,
  detail,
  open,
}: ScoreNote & { open: boolean }) {
  const color =
    tone === "good"
      ? "var(--creed-success)"
      : tone === "mid"
        ? "var(--creed-score-mid)"
        : "var(--creed-danger)";
  const symbol = tone === "good" ? "+" : tone === "mid" ? "/" : "−";
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md transition-colors",
        open && "bg-[var(--creed-surface-raised)]",
      )}
    >
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        <span
          aria-hidden
          className="shrink-0 font-mono text-[12px] font-medium leading-[1.2]"
          style={{ color }}
        >
          {symbol}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--creed-text-primary)]">
          {title}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 transition-all duration-200",
            open
              ? "rotate-180 text-[var(--creed-text-primary)]"
              : "rotate-0 text-[var(--creed-text-tertiary)]",
          )}
        />
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="px-1.5 pb-1.5 pl-[18px] text-[12px] leading-[1.45] text-[var(--creed-text-secondary)]">
              {detail}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function ScoreDemo() {
  const { ref, step, playing } = useLoopSequence(SCORE_STEPS, 1);
  const accent = accentColorMap.identity;
  const loading = step === 0;
  const resolved = step >= 1;
  // Steps 2,3,4 open notes 0,1,2 respectively; only one is ever open.
  const openNote = step >= 2 ? step - 2 : -1;
  const shown = useCountUp(SCORE_TARGET, resolved, playing);

  return (
    <div ref={ref} className="w-full">
      <DemoCard>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="h-7 w-[3px] shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
            />
            <span className="text-[15px] font-medium" style={{ color: accent }}>
              Identity
            </span>
            <QualityRing
              score={SCORE_TARGET}
              color={accent}
              loading={loading}
              size={18}
            />
          </div>
          <span className="flex items-baseline gap-1.5">
            <span
              className="font-mono text-[20px] font-medium leading-none tabular-nums"
              style={{
                color: loading
                  ? "var(--creed-text-tertiary)"
                  : qualityScoreColor(SCORE_TARGET),
              }}
            >
              {loading ? "…" : shown}
            </span>
            <span className="text-[12px] font-medium text-[var(--creed-text-primary)]">
              / 100
            </span>
          </span>
        </div>

        <div className="mt-3 flex min-h-[22px] flex-wrap gap-1">
          {SCORE_TAGS.map((tag, index) => (
            <motion.span
              key={tag.label}
              animate={{ opacity: resolved ? 1 : 0, y: resolved ? 0 : 4 }}
              transition={{
                duration: 0.26,
                delay: resolved ? index * 0.06 : 0,
                ease: EASE,
              }}
              className={cn(
                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-[1.2]",
                TAG_TONE_CLASS[tag.tone],
              )}
            >
              {tag.label}
            </motion.span>
          ))}
        </div>

        <div className="relative mt-3 border-t border-[var(--creed-border)] pt-2">
          <motion.div
            animate={{ opacity: loading ? 1 : 0 }}
            transition={{ duration: 0.2 }}
            className="absolute left-1.5 top-3 text-[12px] text-[var(--creed-text-tertiary)]"
          >
            Scoring this section…
          </motion.div>
          <div className="space-y-0.5">
            {SCORE_NOTES.map((note, index) => (
              <motion.div
                key={note.title}
                animate={{ opacity: resolved ? 1 : 0, y: resolved ? 0 : 4 }}
                transition={{
                  duration: 0.26,
                  delay: resolved ? 0.08 + index * 0.06 : 0,
                  ease: EASE,
                }}
              >
                <ScoreNoteRow {...note} open={openNote === index} />
              </motion.div>
            ))}
          </div>
        </div>
      </DemoCard>
    </div>
  );
}
