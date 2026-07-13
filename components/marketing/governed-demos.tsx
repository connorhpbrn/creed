"use client";

// Two interactive mini-demos for the "Review everything or nothing" section,
// built from the real app diff helpers fed mock data:
//  - ProposalDemo: one big proposal card you accept / reject; doing so smoothly
//    transitions to the next of three (Claude Code -> Codex -> Grok), then an
//    "all caught up" state. The diff scrolls when it overflows.
//  - DirectEditDemo: the "require approval" toggle plus a direct-edit diff card;
//    flipping the toggle swaps the edit between Direct and Pending.
// The diff card is a demo-only variant of InlineProposalDiff (no agent name,
// reads "[agent] proposed") so the shared app component stays untouched.
// Client-only mock state, no backend.

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { DiffBadge, computeDiffParts, summarizeDiff } from "@/components/creed/inline-proposal-diff";
import { AgentIconStack } from "@/components/creed/agent-icon-stack";
import { type AccentKey, type Proposal, getProposalPreviewText } from "@/lib/creed-data";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

// The added/removed/unchanged span fan-out, shared by both demo cards.
function DiffParts({ parts }: { parts: ReturnType<typeof computeDiffParts> }) {
  return (
    <>
      {parts.map((part, i) => {
        if (part.added) return <span key={i} className="creed-diff-add">{part.value}</span>;
        if (part.removed) return <span key={i} className="creed-diff-remove">{part.value}</span>;
        return <span key={i}>{part.value}</span>;
      })}
    </>
  );
}

function makeProposal(
  id: string,
  sectionId: string,
  sectionName: string,
  accent: AccentKey,
  agentName: string,
  reason: string,
  contentMarkdown: string
): Proposal {
  return {
    id,
    sectionId,
    sectionName,
    accent,
    agentName,
    timeLabel: "just now",
    changeType: "refines-existing",
    reason,
    impact: "future-responses",
    confidence: "repeated",
    draft: { kind: "rich-text", contentMarkdown },
    status: "pending",
  };
}

const SEED: Array<{ proposal: Proposal; base: string }> = [
  {
    proposal: makeProposal(
      "cc-1",
      "preferences",
      "Preferences",
      "preferences",
      "Claude Code",
      "You keep choosing to ask rather than act.",
      "Prefer doing the work over asking for permission, unless the action is destructive or hard to undo. Lead with the answer, then the reasoning. Raise the single biggest risk, not every objection. Ship, then iterate."
    ),
    base: "For strategic advice, always include the uncomfortable constraint or the underlying root cause, even when it is not asked for, and walk through every assumption one at a time. For product feedback, take the time to explain what users will not care about, not just what sounds good in a demo, and caveat each point with the context it depends on. When reviewing a plan, list every possible objection before giving an opinion, rank them by likelihood, and never commit to a direction until all of them have been written down, debated, and addressed in full. Before shipping anything, restate the goal, summarise the alternatives you considered, and ask for sign-off in writing. Document the rationale for every decision in a shared doc, link the supporting data, and keep a running log of what changed and why so nothing is ever lost. When in doubt, gather more input, schedule a review, and wait for consensus before moving forward.",
  },
  {
    proposal: makeProposal(
      "codex-1",
      "routines",
      "Routines",
      "workflows",
      "Codex",
      "Your check-ins got shorter and moved to mornings only.",
      "Check in each morning with a short status note."
    ),
    base: "Check in every morning and every evening with a full written status report covering everything currently in flight.",
  },
  {
    proposal: makeProposal(
      "grok-1",
      "goals",
      "Goals",
      "projects",
      "Grok",
      "You paused three channels last week to focus on work.",
      "Double down on the two channels that already convert and pause the rest for now."
    ),
    base: "Chase growth on every channel at once and never turn any of them off.",
  },
];

// Demo-only proposal diff: same chrome as InlineProposalDiff, but the header
// reads "[agent] proposed" with no agent name, and the diff scrolls when long.
function DemoProposalDiff({
  proposal,
  existingContent,
  expanded,
}: {
  proposal: Proposal;
  existingContent: string;
  expanded: boolean;
}) {
  const proposed = useMemo(() => getProposalPreviewText(proposal.draft), [proposal.draft]);
  const parts = useMemo(() => computeDiffParts(existingContent, proposed), [existingContent, proposed]);
  const stats = useMemo(() => summarizeDiff(parts), [parts]);

  // Display only: the section auto-plays the review cycle, so nothing here is
  // clickable. The chevron and the Reject / Accept controls are presentational.
  return (
    <div className="rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[0_8px_24px_rgba(28,28,26,0.04)]">
      <div className="flex items-center justify-between gap-3 py-2 pl-3 pr-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-[var(--creed-text-secondary)]">
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              expanded ? "rotate-0" : "-rotate-90"
            )}
          />
          <AgentIconStack agents={[proposal.agentName]} variant="inline" itemClassName="h-5 w-5" maxVisible={1} />
          <span className="text-[var(--creed-text-tertiary)]">proposed</span>
          <span className="text-[var(--creed-text-tertiary)]">&middot;</span>
          <span className="inline-flex items-center gap-1">
            <DiffBadge tone="added" count={stats.added} size="md" />
            <DiffBadge tone="removed" count={stats.removed} size="md" />
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1" aria-hidden="true">
          <span className="inline-flex h-7 items-center rounded-md px-2 text-sm font-medium text-[var(--creed-text-secondary)]">
            Reject
          </span>
          <span className="inline-flex h-7 items-center rounded-md bg-[var(--creed-accent)] px-2.5 text-sm font-medium text-white">
            Accept
          </span>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--creed-border)]" />
            <div className="creed-diff-block creed-scrollbar max-h-[228px] overflow-y-auto px-4 py-3">
              <DiffParts parts={parts} />
            </div>
            {proposal.reason ? (
              <div className="border-t border-[var(--creed-border)] px-4 py-2.5 text-sm leading-5 text-[var(--creed-text-secondary)]">
                {proposal.reason}
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function ProposalDemo() {
  const [present, setPresent] = useState<string[]>(SEED.map((s) => s.proposal.id));
  // The card enters collapsed and expands mid-cycle; driven here (not inside
  // the card) so the whole loop is self-playing.
  const [expanded, setExpanded] = useState(false);

  const live = useMemo(() => SEED.filter((s) => present.includes(s.proposal.id)), [present]);
  const active = live[0];
  const activeId = active?.proposal.id ?? null;

  // Auto-play, no clicks: each proposal enters collapsed, expands after a
  // beat, then resolves and advances to the next. The caught-up state holds
  // briefly, then the whole loop replays on its own - no replay button.
  useEffect(() => {
    if (!activeId) {
      const replay = window.setTimeout(
        () => setPresent(SEED.map((s) => s.proposal.id)),
        2200,
      );
      return () => window.clearTimeout(replay);
    }
    setExpanded(false);
    const expand = window.setTimeout(() => setExpanded(true), 650);
    const advance = window.setTimeout(
      () => setPresent((prev) => prev.filter((p) => p !== activeId)),
      3600,
    );
    return () => {
      window.clearTimeout(expand);
      window.clearTimeout(advance);
    };
  }, [activeId]);

  return (
    <div className="w-full">
      <AnimatePresence mode="wait" initial={false}>
        {active ? (
          <motion.div
            key={active.proposal.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.26, ease: EASE }}
          >
            <DemoProposalDiff
              proposal={active.proposal}
              existingContent={active.base}
              expanded={expanded}
            />
          </motion.div>
        ) : (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="flex flex-col items-center justify-center gap-3 rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] px-6 py-12 text-center shadow-[0_8px_24px_rgba(28,28,26,0.04)]"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#ECFDF5] text-[#16A34A] dark:bg-[#052e1a]/55 dark:text-[#4ade80]">
              <Check className="h-4 w-4" />
            </span>
            <div className="text-[14px] font-medium text-[var(--creed-text-primary)]">You are all caught up</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Presentational only - the demo flips it on a timer, so it isn't clickable.
function ApprovalToggle({ on }: { on: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
        on ? "bg-[#16A34A]" : "bg-[#DC2626]"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-all duration-200",
          on ? "left-[22px]" : "left-0.5"
        )}
      />
    </div>
  );
}

// A richer diff (additions + removals, a few lines) so the card fills its space.
const DIRECT_BASE =
  "Creed's value depends on keeping the file large and exhaustive, capturing every passing preference so nothing is ever left out, even details that stopped mattering months ago.";
const DIRECT_NEXT =
  "Creed's value depends on keeping the file tight and high-signal, pruning stale detail so it stays sharp and self-improving as it grows, and trusting that less is more.";

export function DirectEditDemo() {
  const [approval, setApproval] = useState(false);
  const parts = useMemo(() => computeDiffParts(DIRECT_BASE, DIRECT_NEXT), []);
  const stats = useMemo(() => summarizeDiff(parts), [parts]);
  const pending = approval;

  // Auto-loop the approval toggle so the Direct / Pending swap plays on its
  // own; a manual click flips it early and the loop continues from there.
  useEffect(() => {
    const id = window.setTimeout(() => setApproval((v) => !v), 3200);
    return () => window.clearTimeout(id);
  }, [approval]);

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between gap-4 rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4 shadow-[0_8px_24px_rgba(28,28,26,0.04)]">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-[var(--creed-text-primary)]">Require approval for agent edits</div>
          <div className="mt-0.5 text-[13px] text-[var(--creed-text-secondary)]">Review proposed edits first.</div>
        </div>
        <ApprovalToggle on={approval} />
      </div>

      <div className="rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[0_8px_24px_rgba(28,28,26,0.04)]">
        <div className="px-3 pb-2 pt-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-medium text-[var(--creed-text-primary)]">Beliefs</span>
            <span
              className={cn(
                "ml-auto inline-flex items-center rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium",
                pending
                  ? "bg-[#EFF6FF] text-[#1D4ED8] dark:bg-[#172554]/55 dark:text-[#93c5fd]"
                  : "bg-[#FFF7ED] text-[#C2410C] dark:bg-[#431407]/55 dark:text-[#fdba74]"
              )}
            >
              {pending ? "Pending" : "Direct"}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[12px] text-[var(--creed-text-secondary)]">
            <AgentIconStack agents={["Codex"]} variant="inline" itemClassName="h-4 w-4 shrink-0" />
            <span>Codex</span>
            <span className="text-[var(--creed-text-tertiary)]">&middot;</span>
            <DiffBadge tone="added" count={stats.added} />
            <DiffBadge tone="removed" count={stats.removed} />
            <span className="ml-auto text-[var(--creed-text-tertiary)]">{pending ? "needs review" : "3w ago"}</span>
          </div>
        </div>
        <div className="border-t border-[var(--creed-border)]" />
        <div className="creed-diff-block px-4 py-3 text-[14px]">
          <DiffParts parts={parts} />
        </div>
      </div>
    </div>
  );
}
