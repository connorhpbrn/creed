"use client";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

// Shared hover-driven open/close hook with a grace timer so moving the
// cursor between the trigger, the content card, or any nested expand
// doesn't dismiss the popover. Mirrors the pattern used by ReviewPill.
function useHoverPopover() {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), 600);
  };
  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);
  return { open, setOpen, cancelClose, scheduleClose };
}

export type QualityNote = { title: string; detail: string };

export type CreedQualityReport = {
  contentHash: string;
  overall: {
    score: number;
    summary: string;
    tags: string[];
    strength: QualityNote | null;
    gap: QualityNote | null;
    strengths: string[];
    gaps: string[];
    focus: string[];
  };
  sections: Array<{
    sectionId: string;
    sectionName: string;
    score: number;
    tags: string[];
    strength: QualityNote | null;
    gap: QualityNote | null;
    reasons: string[];
    strengths: string[];
    gaps: string[];
    missingContext: string[];
    focus: string;
  }>;
  generatedAt: string;
};

// Tone for each known tag. Mirrors the controlled vocabulary defined on the
// server (lib/ai/quality.ts QUALITY_TAG_VOCAB). Unknown tags fall back to
// neutral so future server-side additions don't break the UI.
const TAG_TONES: Record<string, "green" | "amber" | "red"> = {
  Specific: "green",
  Concrete: "green",
  Actionable: "green",
  Durable: "green",
  Examples: "green",
  Current: "green",
  Tight: "green",
  Generic: "amber",
  Thin: "amber",
  Surface: "amber",
  Wordy: "amber",
  Drifty: "amber",
  Bloated: "red",
  Vague: "red",
  Empty: "red",
  Context: "red",
  Stale: "red",
  "Off-topic": "red",
  "No examples": "red",
  Contradiction: "red",
};

const TAG_TONE_CLASS: Record<"green" | "amber" | "red" | "neutral", string> = {
  green:
    "bg-[#ECFDF5] text-[#047857] dark:bg-[#052e1a]/55 dark:text-[#4ade80]",
  amber:
    "bg-[#FFFBEB] text-[#92400E] dark:bg-[#451a03]/55 dark:text-[#fbbf24]",
  red:
    "bg-[#FEF2F2] text-[#B91C1C] dark:bg-[#3F1212]/55 dark:text-[#fca5a5]",
  neutral:
    "bg-[var(--creed-surface-raised)] text-[var(--creed-text-secondary)]",
};

function TagPill({ label }: { label: string }) {
  const tone = TAG_TONES[label] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-[1.2]",
        TAG_TONE_CLASS[tone]
      )}
    >
      {label}
    </span>
  );
}

export function qualityScoreColor(score?: number) {
  if (score === undefined) {
    return "var(--creed-text-tertiary)";
  }

  if (score < 25) {
    return "var(--creed-score-bad)";
  }

  if (score < 75) {
    return "var(--creed-score-mid)";
  }

  return "var(--creed-score-good)";
}

export function qualityToneColor(tone: "good" | "bad" | "neutral") {
  if (tone === "good") {
    return "var(--creed-success)";
  }

  if (tone === "bad") {
    return "var(--creed-danger)";
  }

  return "var(--creed-accent)";
}

export function QualityRing({
  score,
  color,
  loading,
  actionable = false,
  size = 18,
}: {
  score?: number;
  color: string;
  loading?: boolean;
  actionable?: boolean;
  size?: number;
}) {
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Derived from size (not a fixed px) so the actionable dot shrinks in step
  // with the thinner ring and stays proportional at every call site's size.
  const dotSize = Math.round(size * 0.28);
  const progress = Math.max(0, Math.min(100, score ?? 0));
  const target = score === undefined ? circumference * 0.72 : circumference - (progress / 100) * circumference;

  // Drive the dash offset through state so the fill always replays when an
  // analysis finishes. Deterministic scoring means a re-run usually returns the
  // same number, and a CSS transition between two equal values never fires - so
  // we paint the ring empty, then fill to the score on the next frame, giving a
  // smooth sweep on every completion regardless of whether the score moved.
  const [offset, setOffset] = useState(loading ? circumference : target);
  const wasLoading = useRef(Boolean(loading));

  useEffect(() => {
    const justFinished = wasLoading.current && !loading;
    wasLoading.current = Boolean(loading);

    if (loading) {
      setOffset(circumference);
      return;
    }
    if (!justFinished) {
      setOffset(target);
      return;
    }

    setOffset(circumference);
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setOffset(target));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [loading, target, circumference]);

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <motion.svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-full w-full -rotate-90"
        animate={loading ? { rotate: 270 } : { rotate: -90 }}
        transition={
          loading
            ? { repeat: Infinity, ease: "linear", duration: 0.85 }
            : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
        }
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--creed-ring-track)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={loading ? circumference * 0.72 : offset}
          style={{ transition: "stroke-dashoffset 680ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </motion.svg>
      <AnimatePresence initial={false}>
        {actionable && !loading ? (
          <motion.span
            key="quality-ring-action-dot"
            aria-hidden="true"
            initial={{ opacity: 0, scale: 0.45 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.45 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: color, width: dotSize, height: dotSize }}
          />
        ) : null}
      </AnimatePresence>
    </span>
  );
}

function QualityCompactCard({
  score,
  label,
  labelColor,
  tags,
  strength,
  gap,
  loading,
}: {
  score: number;
  label: string;
  labelColor?: string;
  tags?: string[];
  strength?: QualityNote | null;
  gap?: QualityNote | null;
  loading?: boolean;
}) {
  const scoreColor = qualityScoreColor(score);
  const visibleTags = (tags ?? []).slice(0, 3);
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <div
          className="min-w-0 truncate text-[17px] font-medium leading-tight tracking-[-0.01em] text-[var(--creed-text-primary)]"
          style={labelColor ? { color: labelColor } : undefined}
        >
          {label}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span
            className="font-mono text-[20px] font-medium leading-none tracking-[-0.02em] tabular-nums"
            style={{ color: scoreColor }}
          >
            {loading ? "…" : score}
          </span>
          <span className="text-[12px] font-medium text-[var(--creed-text-primary)]">
            / 100
          </span>
        </div>
      </div>
      {visibleTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {visibleTags.map((tag) => (
            <TagPill key={tag} label={tag} />
          ))}
        </div>
      ) : null}
      {strength || gap ? (
        <div className="space-y-1 border-t border-[var(--creed-border)] pt-2">
          {strength ? <QualityNoteRow tone="good" note={strength} /> : null}
          {gap ? <QualityNoteRow tone="bad" note={gap} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function QualityNoteRow({ tone, note }: { tone: "good" | "bad"; note: QualityNote }) {
  const [open, setOpen] = useState(false);
  const accent = tone === "good" ? "var(--creed-success)" : "var(--creed-danger)";
  const symbol = tone === "good" ? "+" : "−";
  return (
    <div className="group/note overflow-hidden rounded-md hover:bg-[var(--creed-surface-raised)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-1.5 py-1 text-left"
      >
        <span
          className="shrink-0 font-mono text-[12px] font-medium leading-[1.2]"
          style={{ color: accent }}
        >
          {symbol}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--creed-text-primary)]">
          {note.title}
        </span>
        <ChevronDown
          className={cn(
            // Tertiary by default, flips to primary on row hover or when
            // expanded - same affordance as the profile / colour / accept-
            // all dropdown chevrons.
            "h-3 w-3 shrink-0 transition-[transform,colors] duration-150",
            open
              ? "rotate-180 text-[var(--creed-text-primary)]"
              : "rotate-0 text-[var(--creed-text-tertiary)] group-hover/note:text-[var(--creed-text-primary)]"
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-1.5 pb-1.5 pl-[18px] text-[12px] leading-[1.5] text-[var(--creed-text-secondary)]">
              {note.detail}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function SectionQualityPopover({
  quality,
  color,
  loading,
  sectionName,
  actionAvailable = false,
  onAction,
}: {
  quality?: CreedQualityReport["sections"][number];
  color: string;
  loading?: boolean;
  sectionName?: string;
  actionAvailable?: boolean;
  onAction?: () => void;
}) {
  const isMobile = useIsMobile();
  const { open, setOpen, cancelClose, scheduleClose } = useHoverPopover();

  function handleTriggerClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (!actionAvailable || loading || !onAction) {
      return;
    }
    if (isMobile && !open) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onAction();
  }

  // Prefer the new structured note; if the model is still on the old shape,
  // synthesize a plausible title/detail from the legacy arrays so the UI
  // never collapses to nothing.
  const strength: QualityNote | null =
    quality?.strength ??
    (quality?.strengths?.[0]
      ? { title: "Worth keeping", detail: quality.strengths[0] }
      : null);
  const gap: QualityNote | null =
    quality?.gap ??
    (quality?.gaps?.[0]
      ? { title: "Needs work", detail: quality.gaps[0] }
      : null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={handleTriggerClick}
          onMouseEnter={
            isMobile
              ? undefined
              : () => {
                  cancelClose();
                  setOpen(true);
                }
          }
          onMouseLeave={isMobile ? undefined : scheduleClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-150 hover:bg-[var(--creed-surface-raised)]"
          aria-label={actionAvailable ? "Run section analysis" : "Section score"}
        >
          <QualityRing
            score={quality?.score ?? 0}
            color={color}
            loading={loading}
            actionable={actionAvailable}
            size={17}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        onMouseEnter={isMobile ? undefined : cancelClose}
        onMouseLeave={isMobile ? undefined : scheduleClose}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="relative w-64 rounded-lg bg-[var(--creed-surface)] p-3 shadow-[0_8px_24px_rgba(28,28,26,0.10)] before:pointer-events-auto before:absolute before:-top-2 before:left-0 before:right-0 before:h-2 before:content-['']"
      >
        {quality ? (
          <QualityCompactCard
            score={quality.score}
            label={sectionName ?? quality.sectionName ?? "Section"}
            labelColor={color}
            tags={quality.tags}
            strength={strength}
            gap={gap}
            loading={loading}
          />
        ) : (
          <div className="text-[15px] font-medium leading-none text-[var(--creed-text-secondary)] md:text-[16px]">
            {loading
              ? "Analyzing this section for agent context..."
              : "No section analysis yet."}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function OverallQualityPopover({
  report,
  loading,
  children,
  align = "end",
  actionAvailable = false,
  onAction,
}: {
  report: CreedQualityReport | null;
  loading?: boolean;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  actionAvailable?: boolean;
  onAction?: () => void;
}) {
  const isMobile = useIsMobile();
  const { open, setOpen, cancelClose, scheduleClose } = useHoverPopover();

  function handleTriggerClick(event: React.MouseEvent<HTMLSpanElement>) {
    if (!actionAvailable || loading || !onAction) {
      return;
    }
    if (isMobile && !open) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onAction();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          onClick={handleTriggerClick}
          onMouseEnter={
            isMobile
              ? undefined
              : () => {
                  cancelClose();
                  setOpen(true);
                }
          }
          onMouseLeave={isMobile ? undefined : scheduleClose}
          className="inline-flex"
        >
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={6}
        onMouseEnter={isMobile ? undefined : cancelClose}
        onMouseLeave={isMobile ? undefined : scheduleClose}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="relative w-72 rounded-lg bg-[var(--creed-surface)] p-3 shadow-[0_8px_24px_rgba(28,28,26,0.10)] before:pointer-events-auto before:absolute before:-top-2 before:left-0 before:right-0 before:h-2 before:content-['']"
      >
        {report ? (
          <QualityCompactCard
            score={report.overall.score}
            label="Overall"
            labelColor="#2563EB"
            tags={report.overall.tags}
            strength={
              report.overall.strength ??
              (report.overall.strengths?.[0]
                ? { title: "Working well", detail: report.overall.strengths[0] }
                : null)
            }
            gap={
              report.overall.gap ??
              (report.overall.gaps?.[0]
                ? { title: "Biggest gap", detail: report.overall.gaps[0] }
                : null)
            }
            loading={loading}
          />
        ) : (
          <div className="text-[15px] font-medium leading-none text-[var(--creed-text-secondary)] md:text-[16px]">
            {loading
              ? "Analyzing your Creed for agent context…"
              : "No analysis yet."}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
