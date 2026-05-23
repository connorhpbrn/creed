"use client";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RefreshCwIcon } from "@/components/ui/refresh-cw";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
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
  Generic: "amber",
  Thin: "amber",
  Surface: "amber",
  Wordy: "amber",
  Drifty: "amber",
  Short: "red",
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
  size = 18,
}: {
  score?: number;
  color: string;
  loading?: boolean;
  size?: number;
}) {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score ?? 0));
  const offset = circumference - (progress / 100) * circumference;

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--creed-ring-track)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={loading ? circumference : score === undefined ? circumference * 0.72 : offset}
          style={{ transition: "stroke-dashoffset 680ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </svg>
    </span>
  );
}

export function QualityRefreshButton({
  onClick,
  loading,
  title,
}: {
  onClick: () => void;
  loading?: boolean;
  title: string;
}) {
  const refreshIcon = useAnimatedIconControls(80);

  return (
    <button
      type="button"
      aria-label={title}
      onClick={onClick}
      disabled={loading}
      onMouseEnter={() => refreshIcon.start()}
      onMouseLeave={() => refreshIcon.settle()}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--creed-text-secondary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] disabled:opacity-60"
    >
      {/* While loading, keep the icon spinning continuously from wherever it
          was; once loading flips off, the wrapper smoothly settles back to
          rotation 0 instead of snapping. */}
      <motion.span
        className="inline-flex h-4 w-4 items-center justify-center"
        animate={loading ? { rotate: 360 } : { rotate: 0 }}
        transition={
          loading
            ? { repeat: Infinity, ease: "linear", duration: 0.9 }
            : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
        }
      >
        <RefreshCwIcon
          ref={refreshIcon.iconRef}
          className="h-4 w-4"
          size={16}
        />
      </motion.span>
    </button>
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
          className="min-w-0 truncate text-[15px] font-medium leading-tight tracking-[-0.01em] text-[var(--creed-text-primary)]"
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
          <span className="text-[11px] font-medium text-[var(--creed-text-primary)]">
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
    <div className="group/note overflow-hidden rounded-md transition-colors hover:bg-[var(--creed-surface-raised)]">
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
            // expanded — same affordance as the profile / colour / accept-
            // all dropdown chevrons.
            "h-3 w-3 shrink-0 transition-all duration-150",
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
}: {
  quality?: CreedQualityReport["sections"][number];
  color: string;
  loading?: boolean;
  sectionName?: string;
}) {
  const isMobile = useIsMobile();
  const { open, setOpen, cancelClose, scheduleClose } = useHoverPopover();

  if (!quality) {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full"
        aria-label="No section analysis"
      >
        <QualityRing score={0} color={color} loading={loading} size={17} />
      </span>
    );
  }

  // Prefer the new structured note; if the model is still on the old shape,
  // synthesize a plausible title/detail from the legacy arrays so the UI
  // never collapses to nothing.
  const strength: QualityNote | null =
    quality.strength ??
    (quality.strengths?.[0]
      ? { title: "Worth keeping", detail: quality.strengths[0] }
      : null);
  const gap: QualityNote | null =
    quality.gap ??
    (quality.gaps?.[0]
      ? { title: "Needs work", detail: quality.gaps[0] }
      : null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
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
          aria-label="Section score"
        >
          <QualityRing score={quality.score} color={color} loading={loading} size={17} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        onMouseEnter={isMobile ? undefined : cancelClose}
        onMouseLeave={isMobile ? undefined : scheduleClose}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="relative w-64 rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-3 shadow-[0_8px_24px_rgba(28,28,26,0.10)] before:pointer-events-auto before:absolute before:-top-2 before:left-0 before:right-0 before:h-2 before:content-['']"
      >
        <QualityCompactCard
          score={quality.score}
          label={sectionName ?? quality.sectionName ?? "Section"}
          labelColor={color}
          tags={quality.tags}
          strength={strength}
          gap={gap}
          loading={loading}
        />
      </PopoverContent>
    </Popover>
  );
}

export function OverallQualityPopover({
  report,
  loading,
  notice,
  onRefresh,
  canRefresh,
  children,
  align = "end",
}: {
  report: CreedQualityReport | null;
  loading?: boolean;
  notice?: string | null;
  onRefresh?: () => void;
  canRefresh?: boolean;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  const isMobile = useIsMobile();
  const { open, setOpen, cancelClose, scheduleClose } = useHoverPopover();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
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
        className="relative w-72 rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-3 shadow-[0_8px_24px_rgba(28,28,26,0.10)] before:pointer-events-auto before:absolute before:-top-2 before:left-0 before:right-0 before:h-2 before:content-['']"
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
          <div className="space-y-2.5 text-[13px] leading-6 text-[var(--creed-text-secondary)]">
            <div className="text-[12px] font-medium text-[var(--creed-text-secondary)]">
              Quality
            </div>
            <p>
              {loading
                ? "Analyzing your Creed for agent context…"
                : notice || "Run an analysis to score this Creed."}
            </p>
            {!loading && canRefresh && onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface)] px-2.5 text-[12px] font-medium text-[var(--creed-text-primary)] transition-colors hover:bg-[var(--creed-surface-raised)]"
              >
                <RefreshCwIcon className="h-3 w-3" size={12} />
                Run analysis
              </button>
            ) : null}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
