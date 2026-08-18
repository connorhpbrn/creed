"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import type { Proposal } from "@creed/core/creed-data";
import { accentColorMap, getProposalPreviewText } from "@creed/core/creed-data";
import { AgentIconStack } from "@/components/creed/agent-icon-stack";
import { ChevronDownIcon as AnimatedChevronDown } from "@creed/ui/chevron-down";
import { cn } from "@creed/ui/utils";
import {
  computeCreedDiff,
  hasDiffChanges,
  type CreedDiff,
  type DiffLine,
} from "@/lib/creed-diff";

const expandTransition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

const DIFF_BODY_CLASS =
  "creed-scrollbar creed-diff-block max-h-[min(40vh,20rem)] overflow-y-auto py-3";

// The 20px attribution glyph on a proposal card: a member's real profile
// picture (squircle, same footprint as the agent glyph) when they typed the
// edit by hand, or the connected agent's glyph when an agent proposed it.
export function ProposalAuthor({
  authorType,
  avatarUrl,
  initials,
  agentName,
}: {
  authorType?: "user" | "agent";
  avatarUrl?: string;
  initials?: string;
  agentName: string;
}) {
  const [failed, setFailed] = useState(false);
  if (authorType === "user") {
    if (avatarUrl && !failed) {
      return (
        <Image
          src={avatarUrl}
          alt=""
          width={20}
          height={20}
          unoptimized
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-5 w-5 shrink-0 rounded-[6px] object-cover"
        />
      );
    }
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] text-[10px] font-medium text-[var(--creed-text-secondary)]">
        {initials || agentName.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <AgentIconStack
      agents={[agentName]}
      variant="inline"
      itemClassName="h-5 w-5"
      maxVisible={1}
    />
  );
}

function ExpandRegion({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={expandTransition}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// Plain `+N` / `−N` numbers in the bright success/danger tokens. Centralised
// here so every diff-stat surface across the app uses the exact same colour.
export function DiffBadge({
  tone,
  count,
  size = "sm",
}: {
  tone: "added" | "removed";
  count: number;
  size?: "xs" | "sm" | "md";
}) {
  const symbol = tone === "added" ? "+" : "−";
  // `!important` so the dropdown-menu primitive's `**:text-accent-foreground`
  // focus rule doesn't bleach the +N / −N numbers when the row is hovered.
  const colour =
    tone === "added"
      ? "!text-[var(--creed-success)]"
      : "!text-[var(--creed-danger)]";
  const sizeClass =
    size === "xs" ? "text-[10px]" : size === "md" ? "text-sm" : "text-[11px]";
  const label = `${count} ${count === 1 ? "line" : "lines"} ${tone}`;
  return (
    <span
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center font-mono font-medium tabular-nums leading-[1.2]",
        sizeClass,
        colour,
      )}
    >
      {symbol}
      {count}
    </span>
  );
}

function DiffLineContent({ line }: { line: DiffLine }) {
  if (!line.inlineParts) {
    if (line.kind === "added") {
      return <span className="creed-diff-add">{line.value || " "}</span>;
    }
    if (line.kind === "removed") {
      return <span className="creed-diff-remove">{line.value || " "}</span>;
    }
    return line.value || " ";
  }

  return line.inlineParts.map((part, index) => {
    if (line.kind === "removed" && part.added) return null;
    if (line.kind === "added" && part.removed) return null;
    const changed = line.kind === "removed" ? part.removed : part.added;
    return (
      <span
        key={index}
        className={
          changed
            ? line.kind === "removed"
              ? "creed-diff-remove"
              : "creed-diff-add"
            : undefined
        }
      >
        {part.value}
      </span>
    );
  });
}

export function CreedDiffView({ diff }: { diff: CreedDiff }) {
  if (!hasDiffChanges(diff)) {
    return (
      <span className="text-[var(--creed-text-tertiary)]">
        No textual change
      </span>
    );
  }

  return (
    <div className="creed-diff-lines">
      {diff.lines.map((line, index) => (
        <div key={`${line.kind}-${index}`} className="creed-diff-line">
          <DiffLineContent line={line} />
        </div>
      ))}
    </div>
  );
}

export function InlineProposalDiff({
  proposal,
  existingContent,
  onAccept,
  onReject,
  onEdit,
  onDelete,
  agentName,
  canReview = true,
  mine = false,
}: {
  proposal: Proposal;
  existingContent: string;
  onAccept: () => void;
  onReject: () => void;
  // The proposal's own author (a Proposal-only member) can continue editing it
  // or delete it, but not approve it.
  onEdit?: () => void;
  onDelete?: () => void;
  agentName: string;
  // When false, the viewer can't review this section. If it's their own
  // proposal (mine), they get Edit / Delete; otherwise the card is preview-only.
  canReview?: boolean;
  mine?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const proposedText = useMemo(
    () => getProposalPreviewText(proposal.draft),
    [proposal.draft],
  );
  const diff = useMemo(
    () => computeCreedDiff(existingContent, proposedText),
    [existingContent, proposedText],
  );

  return (
    <div className="rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)]">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="group/diff flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-[var(--creed-text-secondary)]"
        >
          <ProposalAuthor
            authorType={proposal.authorType}
            avatarUrl={proposal.authorAvatarUrl}
            initials={proposal.authorInitials}
            agentName={agentName}
          />
          <span className="hidden truncate font-medium text-[var(--creed-text-primary)] sm:inline">
            {agentName}
          </span>
          <span className="text-[var(--creed-text-tertiary)]">
            <span className="sm:hidden">proposed</span>
            <span className="hidden sm:inline">proposed an update</span>
          </span>
          <span className="text-[var(--creed-text-tertiary)]">·</span>
          <span className="inline-flex items-center gap-1">
            <DiffBadge tone="added" count={diff.added} size="md" />
            <DiffBadge tone="removed" count={diff.removed} size="md" />
          </span>
          <AnimatedChevronDown
            size={14}
            className={cn(
              "shrink-0 -rotate-90 text-[var(--creed-text-tertiary)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/diff:text-[var(--creed-text-primary)]",
              expanded && "rotate-0 text-[var(--creed-text-primary)]",
            )}
          />
        </button>
        {mine ? (
          // Your OWN proposal takes precedence over any review power: you edit
          // (reject-styled, left) or delete it (accept-styled but red, right) -
          // you never approve your own.
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
              aria-label="Edit proposal"
            >
              <Pencil className="h-3.5 w-3.5 sm:hidden" />
              <span className="hidden sm:inline">Edit</span>
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-[#DC2626] px-2.5 text-sm font-medium text-white transition-colors hover:bg-[#B91C1C]"
              aria-label="Delete proposal"
            >
              <Trash2 className="h-3.5 w-3.5 sm:hidden" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
        ) : canReview ? (
          <div className="-mr-1 flex items-center gap-1">
            <button
              type="button"
              onClick={onReject}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
              aria-label="Reject proposal"
            >
              <X className="h-3.5 w-3.5 sm:hidden" />
              <span className="hidden sm:inline">Reject</span>
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-[var(--creed-accent)] px-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--creed-accent-hover)]"
              aria-label="Accept proposal"
            >
              <Check className="h-3.5 w-3.5 sm:hidden" />
              <span className="hidden sm:inline">Accept</span>
            </button>
          </div>
        ) : (
          <span className="shrink-0 whitespace-nowrap text-[13px] text-[var(--creed-text-tertiary)]">
            Awaiting review
          </span>
        )}
      </div>

      <ExpandRegion open={expanded}>
        <div className="border-t border-[var(--creed-border)]" />
        <div className={DIFF_BODY_CLASS}>
          <CreedDiffView diff={diff} />
        </div>
        {proposal.reason ? (
          <div className="border-t border-[var(--creed-border)] px-4 py-2.5 text-sm leading-5 text-[var(--creed-text-secondary)]">
            {proposal.reason}
          </div>
        ) : null}
      </ExpandRegion>
    </div>
  );
}

export function InlineNewSectionProposal({
  proposal,
  onAccept,
  onReject,
  agentName,
  canReview = true,
}: {
  proposal: Proposal;
  onAccept: () => void;
  onReject: () => void;
  agentName: string;
  canReview?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const proposedText = useMemo(
    () => getProposalPreviewText(proposal.draft),
    [proposal.draft],
  );
  const diff = useMemo(() => computeCreedDiff("", proposedText), [proposedText]);
  const sectionName =
    proposal.draft.kind === "new-section"
      ? proposal.draft.name
      : proposal.sectionName;

  return (
    // Mirror the delete-meta proposal card but tinted green so additions
    // and removals read as opposites with the same chrome. Border, surface,
    // dividers, and the Accept button all share a single green hue.
    <div className="rounded-xl border border-dashed border-[var(--creed-success)]/35 bg-[var(--creed-success)]/10 dark:border-[#22c55e]/35 dark:bg-[#052e1a]/40">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="group/diff flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-[var(--creed-text-secondary)]"
        >
          <AgentIconStack
            agents={[agentName]}
            variant="inline"
            itemClassName="h-5 w-5"
            maxVisible={1}
          />
          <span className="hidden truncate font-medium text-[var(--creed-text-primary)] sm:inline">
            {agentName}
          </span>
          <span className="text-[var(--creed-success)]">
            proposed
          </span>
          <span className="inline-flex items-center gap-1 text-sm">
            <DiffBadge tone="added" count={diff.added} size="md" />
          </span>
          <span className="hidden text-[var(--creed-text-tertiary)] sm:inline">
            ·
          </span>
          <span className="hidden truncate text-[var(--creed-text-primary)] sm:inline">
            {sectionName}
          </span>
          <AnimatedChevronDown
            size={14}
            className={cn(
              "shrink-0 -rotate-90 text-[var(--creed-success)]/70 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/diff:text-[var(--creed-success)]",
              expanded && "rotate-0 text-[var(--creed-success)]",
            )}
          />
        </button>
        {canReview ? (
          <div className="-mr-1 flex items-center gap-1">
            <button
              type="button"
              onClick={onReject}
              aria-label="Reject proposal"
              // Weaker green tint by default, full green on hover. Hover
              // background is a soft green wash so the reject affordance
              // stays inside the proposal's colour family.
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium text-[var(--creed-success)]/65 transition-colors hover:bg-[var(--creed-success)]/10 hover:text-[var(--creed-success)] dark:hover:bg-[#22c55e]/15"
            >
              <X className="h-3.5 w-3.5 sm:hidden" />
              <span className="hidden sm:inline">Reject</span>
            </button>
            <button
              type="button"
              onClick={onAccept}
              aria-label="Accept proposal"
              className="inline-flex h-7 items-center gap-1 rounded-md bg-[#16A34A] px-2.5 text-sm font-medium text-white transition-colors hover:bg-[#15803d]"
            >
              <Check className="h-3.5 w-3.5 sm:hidden" />
              <span className="hidden sm:inline">Accept</span>
            </button>
          </div>
        ) : (
          <span className="shrink-0 whitespace-nowrap text-[13px] text-[var(--creed-success)]/80">
            Awaiting review
          </span>
        )}
      </div>
      <ExpandRegion open={expanded}>
        <div className="border-t border-[var(--creed-success)]/20 dark:border-[#22c55e]/20" />
        <div className={cn(DIFF_BODY_CLASS, "text-[14px] leading-7 text-[var(--creed-text-primary)]")}>
          <CreedDiffView diff={diff} />
        </div>
        {proposal.reason ? (
          // Reason text tinted green to match the rest of the card's
          // colour signalling. Same hue as the chevron / `+` / headline.
          <div className="border-t border-[var(--creed-success)]/20 px-4 py-2.5 text-sm leading-5 text-[var(--creed-success)] dark:border-[#22c55e]/20">
            {proposal.reason}
          </div>
        ) : null}
      </ExpandRegion>
    </div>
  );
}

// Generic renderer for the section-meta proposal kinds: delete-section,
// rename-section, recolor-section. They share a common chrome - agent
// attribution row + a single concise summary line - but differ in tone.
// Delete proposals lean red (destructive) so the user reads twice; rename
// and recolor lean neutral.
export function InlineMetaProposal({
  proposal,
  existingName,
  existingAccent,
  existingContent,
  onAccept,
  onReject,
  agentName,
  canReview = true,
}: {
  proposal: Proposal;
  existingName: string;
  existingAccent: string;
  existingContent: string;
  onAccept: () => void;
  onReject: () => void;
  agentName: string;
  canReview?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const draft = proposal.draft;

  const isDelete = draft.kind === "delete-section";
  const isRename = draft.kind === "rename-section";
  const isRecolor = draft.kind === "recolor-section";
  if (!isDelete && !isRename && !isRecolor) return null;
  const deleteDiff = isDelete
    ? computeCreedDiff(existingContent, "")
    : null;

  const headline = isDelete
    ? "proposed"
    : isRename
      ? "proposed to rename"
      : "proposed to recolour";

  const containerClass = isDelete
    ? "rounded-xl border border-dashed border-[var(--creed-danger)]/35 bg-[var(--creed-danger)]/10 dark:border-[#ef4444]/35 dark:bg-[#7f1d1d]/15"
    : "rounded-xl border border-dashed border-[var(--creed-border)] bg-[var(--creed-surface)]";

  const dividerClass = isDelete
    ? "border-t border-[var(--creed-danger)]/20 dark:border-[#ef4444]/20"
    : "border-t border-[var(--creed-border)]";

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="group/diff flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-[var(--creed-text-secondary)]"
        >
          <AgentIconStack
            agents={[agentName]}
            variant="inline"
            itemClassName="h-5 w-5"
            maxVisible={1}
          />
          <span className="hidden truncate font-medium text-[var(--creed-text-primary)] sm:inline">
            {agentName}
          </span>
          <span
            className={cn(
              isDelete
                ? "text-[var(--creed-danger)]"
                : "text-[var(--creed-text-tertiary)]",
            )}
          >
            <span className="sm:hidden">proposed</span>
            <span className="hidden sm:inline">{headline}</span>
          </span>
          {isDelete ? (
            <>
              <span className="inline-flex items-center gap-1 text-sm">
                <DiffBadge tone="removed" count={deleteDiff?.removed ?? 0} size="md" />
              </span>
              <span className="hidden text-[var(--creed-text-tertiary)] sm:inline">
                ·
              </span>
              <span className="hidden truncate text-[var(--creed-text-primary)] sm:inline">
                {existingName}
              </span>
            </>
          ) : (
            <>
              <span className="text-[var(--creed-text-tertiary)]">·</span>
              <span className="truncate text-[var(--creed-text-primary)]">
                {existingName}
              </span>
            </>
          )}
          <AnimatedChevronDown
            size={14}
            className={cn(
              "shrink-0 -rotate-90 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
              isDelete
                ? "text-[var(--creed-danger)]/70 group-hover/diff:text-[var(--creed-danger)]"
                : "text-[var(--creed-text-tertiary)] group-hover/diff:text-[var(--creed-text-primary)]",
              expanded && "rotate-0",
              expanded &&
                (isDelete
                  ? "text-[var(--creed-danger)]"
                  : "text-[var(--creed-text-primary)]"),
            )}
          />
        </button>
        {canReview ? (
          <div className="-mr-1 flex items-center gap-1">
            <button
              type="button"
              onClick={onReject}
              aria-label="Reject proposal"
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium transition-colors",
                // Delete reject: weaker red default → full red on hover,
                // with a soft red wash backdrop. Rename / recolor keep the
                // neutral secondary→primary text behaviour.
                isDelete
                  ? "text-[var(--creed-danger)]/65 hover:bg-[var(--creed-danger)]/10 hover:text-[var(--creed-danger)] dark:hover:bg-[#ef4444]/15"
                  : "text-[var(--creed-text-secondary)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]",
              )}
            >
              <X className="h-3.5 w-3.5 sm:hidden" />
              <span className="hidden sm:inline">Reject</span>
            </button>
            <button
              type="button"
              onClick={onAccept}
              aria-label="Accept proposal"
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-white transition-colors",
                isDelete
                  ? "bg-[#dc2626] hover:bg-[#b91c1c]"
                  : "bg-[var(--creed-accent)] hover:bg-[var(--creed-accent-hover)]",
              )}
            >
              <Check className="h-3.5 w-3.5 sm:hidden" />
              <span className="hidden sm:inline">Accept</span>
            </button>
          </div>
        ) : (
          <span className="shrink-0 whitespace-nowrap text-[13px] text-[var(--creed-text-tertiary)]">
            Awaiting review
          </span>
        )}
      </div>
      <ExpandRegion open={expanded}>
        <div className={dividerClass} />
        {/* Typography matched to the new-section card: 14px / leading-7
            so the two card bodies read at the same visual weight. */}
        {isDelete ? (
          <div className={cn(DIFF_BODY_CLASS, "text-[14px] leading-7 text-[var(--creed-text-primary)]")}>
            <CreedDiffView diff={deleteDiff!} />
          </div>
        ) : (
          <div className="px-4 py-3 text-[14px] leading-7 text-[var(--creed-text-primary)]">
          {isRename ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-[var(--creed-text-secondary)] line-through">
                {existingName}
              </span>
              <span className="text-[var(--creed-text-tertiary)]">→</span>
              <span className="font-medium">
                {(draft as { name: string }).name}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[var(--creed-text-secondary)] line-through">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: existingAccent }}
                />
                {proposal.sectionName}
              </span>
              <span className="text-[var(--creed-text-tertiary)]">→</span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    background:
                      accentColorMap[
                        (draft as { accent: keyof typeof accentColorMap })
                          .accent
                      ] ?? existingAccent,
                  }}
                />
                {(draft as { accent: string }).accent}
              </span>
            </span>
          )}
          </div>
        )}
        {proposal.reason ? (
          // Delete reason picks up the red tint to match the rest of the
          // card's colour signalling. Non-destructive meta kinds stay on
          // the neutral secondary text colour.
          <div
            className={cn(
              "px-4 py-2.5 text-sm leading-5",
              dividerClass,
              isDelete
                ? "text-[var(--creed-danger)]"
                : "text-[var(--creed-text-secondary)]",
            )}
          >
            {proposal.reason}
          </div>
        ) : null}
      </ExpandRegion>
    </div>
  );
}
