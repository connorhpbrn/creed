"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { diffWords } from "diff";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Pencil, Trash2, X } from "lucide-react";
import type { Proposal } from "@/lib/creed-data";
import { accentColorMap, getProposalPreviewText } from "@/lib/creed-data";
import { AgentIconStack } from "@/components/creed/agent-icon-stack";
import { cn } from "@/lib/utils";

const expandTransition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

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

export function htmlToText(value: string) {
  return value
    .replace(/<\s*(br|hr)\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/(p|h\d|li|ul|ol|blockquote|pre)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type DiffStats = { added: number; removed: number };

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
  return (
    <span
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

export function computeDiffParts(existing: string, proposed: string) {
  const existingText = htmlToText(existing);
  const proposedText = htmlToText(proposed);
  return diffWords(existingText, proposedText);
}

export function summarizeDiff(
  parts: ReturnType<typeof computeDiffParts>,
): DiffStats {
  let added = 0;
  let removed = 0;
  for (const part of parts) {
    const tokens = part.value.trim().split(/\s+/).filter(Boolean).length;
    if (part.added) added += tokens;
    else if (part.removed) removed += tokens;
  }
  return { added, removed };
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
  const [expanded, setExpanded] = useState(true);
  const proposedText = useMemo(
    () => getProposalPreviewText(proposal.draft),
    [proposal.draft],
  );
  const parts = useMemo(
    () => computeDiffParts(existingContent, proposedText),
    [existingContent, proposedText],
  );
  const stats = useMemo(() => summarizeDiff(parts), [parts]);

  return (
    <div className="rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[0_8px_24px_rgba(28,28,26,0.04)]">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="group/diff flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-[var(--creed-text-secondary)]"
        >
          <ChevronDown
            className={cn(
              // Match the other dropdown chevrons: muted tertiary by default,
              // flips to primary (white in dark) on hover, smooth rotate.
              "h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)] transition-all duration-200 group-hover/diff:text-[var(--creed-text-primary)]",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
          <ProposalAuthor
            authorType={proposal.authorType}
            avatarUrl={proposal.authorAvatarUrl}
            initials={proposal.authorInitials}
            agentName={agentName}
          />
          <span className="truncate font-medium text-[var(--creed-text-primary)]">
            {agentName}
          </span>
          <span className="text-[var(--creed-text-tertiary)]">
            proposed an update
          </span>
          <span className="text-[var(--creed-text-tertiary)]">·</span>
          <span className="inline-flex items-center gap-1">
            <DiffBadge tone="added" count={stats.added} size="md" />
            <DiffBadge tone="removed" count={stats.removed} size="md" />
          </span>
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
          <div className="flex items-center gap-1">
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
              className="inline-flex h-7 items-center gap-1 rounded-md bg-[#2563eb] px-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1d4ed8]"
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
        <div className="creed-diff-block px-4 py-3">
          {parts.length === 0 ? (
            <span className="text-[var(--creed-text-tertiary)]">
              No textual change
            </span>
          ) : (
            parts.map((part, index) => {
              if (part.added) {
                return (
                  <span key={index} className="creed-diff-add">
                    {part.value}
                  </span>
                );
              }
              if (part.removed) {
                return (
                  <span key={index} className="creed-diff-remove">
                    {part.value}
                  </span>
                );
              }
              return <span key={index}>{part.value}</span>;
            })
          )}
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
  const [expanded, setExpanded] = useState(true);
  const proposedText = useMemo(
    () => getProposalPreviewText(proposal.draft),
    [proposal.draft],
  );
  const sectionName =
    proposal.draft.kind === "new-section"
      ? proposal.draft.name
      : proposal.sectionName;

  return (
    // Mirror the delete-meta proposal card but tinted green so additions
    // and removals read as opposites with the same chrome. Border, surface,
    // dividers, and the Accept button all share a single green hue.
    <div className="rounded-[14px] border border-dashed border-[#10b981]/35 bg-[#ECFDF5]/40 shadow-[0_8px_24px_rgba(16,185,129,0.05)] dark:border-[#22c55e]/35 dark:bg-[#052e1a]/40 dark:shadow-none">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-[var(--creed-text-secondary)]"
        >
          <ChevronDown
            className={cn(
              // Chevron tinted green to match the proposal tone - same
              // affordance as the destructive (red) chevron on the delete
              // card so the colour also carries semantic information.
              "h-3.5 w-3.5 shrink-0 text-[#10b981] transition-transform duration-200 dark:text-[#4ade80]",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
          <AgentIconStack
            agents={[agentName]}
            variant="inline"
            itemClassName="h-5 w-5"
            maxVisible={1}
          />
          <span className="truncate font-medium text-[var(--creed-text-primary)]">
            {agentName}
          </span>
          {/* Tinted green to match the chevron / `+` glyph - the colour
              now also carries the meaning of the headline. */}
          <span className="text-[#10b981] dark:text-[#4ade80]">
            proposed a new section
          </span>
          <span className="text-[var(--creed-text-tertiary)]">·</span>
          <span className="inline-flex items-center gap-1 text-sm">
            <span className="font-medium text-[#10b981] dark:text-[#4ade80]">
              +
            </span>
            <span className="text-[var(--creed-text-primary)]">
              {sectionName}
            </span>
          </span>
        </button>
        {canReview ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onReject}
              aria-label="Reject proposal"
              // Weaker green tint by default, full green on hover. Hover
              // background is a soft green wash so the reject affordance
              // stays inside the proposal's colour family.
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium text-[#10b981]/65 transition-colors hover:bg-[#10b981]/10 hover:text-[#10b981] dark:text-[#4ade80]/65 dark:hover:bg-[#22c55e]/15 dark:hover:text-[#4ade80]"
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
          <span className="shrink-0 whitespace-nowrap text-[13px] text-[#10b981]/80 dark:text-[#4ade80]/80">
            Awaiting review
          </span>
        )}
      </div>
      <ExpandRegion open={expanded}>
        <div className="border-t border-[#10b981]/20" />
        {/* Clean padded text block - no inner green highlight bar. The
            card's outer green wash + colour signalling already conveys
            "this is an addition", and matching the delete card's plain
            content layout keeps the two cards visually consistent. */}
        <div className="creed-diff-block px-4 py-3 text-[14px] leading-7 text-[var(--creed-text-primary)]">
          {htmlToText(proposedText) || "(empty)"}
        </div>
        {proposal.reason ? (
          // Reason text tinted green to match the rest of the card's
          // colour signalling. Same hue as the chevron / `+` / headline.
          <div className="border-t border-[#10b981]/20 px-4 py-2.5 text-sm leading-5 text-[#10b981] dark:text-[#4ade80]">
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
  onAccept,
  onReject,
  agentName,
  canReview = true,
}: {
  proposal: Proposal;
  existingName: string;
  existingAccent: string;
  onAccept: () => void;
  onReject: () => void;
  agentName: string;
  canReview?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const draft = proposal.draft;

  const isDelete = draft.kind === "delete-section";
  const isRename = draft.kind === "rename-section";
  const isRecolor = draft.kind === "recolor-section";
  if (!isDelete && !isRename && !isRecolor) return null;

  const headline = isDelete
    ? "proposed to delete"
    : isRename
      ? "proposed to rename"
      : "proposed to recolour";

  const containerClass = isDelete
    ? "rounded-[14px] border border-dashed border-[#dc2626]/35 bg-[#FEF2F2]/40 shadow-[0_8px_24px_rgba(220,38,38,0.05)] dark:border-[#ef4444]/35 dark:bg-[#7f1d1d]/15 dark:shadow-none"
    : "rounded-[14px] border border-dashed border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[0_8px_24px_rgba(28,28,26,0.04)]";

  const dividerClass = isDelete
    ? "border-t border-[#dc2626]/20"
    : "border-t border-[var(--creed-border)]";

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-[var(--creed-text-secondary)]"
        >
          <ChevronDown
            className={cn(
              // Tint the chevron to the proposal tone so the colour also
              // signals what the card does - red for destructive, neutral
              // tertiary for the non-destructive meta kinds.
              "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
              isDelete
                ? "text-[#dc2626] dark:text-[#f87171]"
                : "text-[var(--creed-text-tertiary)]",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
          <AgentIconStack
            agents={[agentName]}
            variant="inline"
            itemClassName="h-5 w-5"
            maxVisible={1}
          />
          <span className="truncate font-medium text-[var(--creed-text-primary)]">
            {agentName}
          </span>
          {/* Tint the headline red on delete to match the rest of the
              card's colour signalling. Non-destructive meta kinds stay
              tertiary so they don't shout. */}
          <span
            className={cn(
              isDelete
                ? "text-[#dc2626] dark:text-[#f87171]"
                : "text-[var(--creed-text-tertiary)]",
            )}
          >
            {headline}
          </span>
          <span className="text-[var(--creed-text-tertiary)]">·</span>
          {/* Delete proposals get a red `−` prefix mirroring the green `+`
              on new-section cards. Non-destructive meta kinds (rename /
              recolor) stay neutral. */}
          {isDelete ? (
            <span className="inline-flex items-center gap-1 text-sm">
              <span className="font-medium text-[#dc2626] dark:text-[#f87171]">
                −
              </span>
              <span className="truncate text-[var(--creed-text-primary)]">
                {existingName}
              </span>
            </span>
          ) : (
            <span className="truncate text-[var(--creed-text-primary)]">
              {existingName}
            </span>
          )}
        </button>
        {canReview ? (
          <div className="flex items-center gap-1">
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
                  ? "text-[#dc2626]/65 hover:bg-[#dc2626]/10 hover:text-[#dc2626] dark:text-[#f87171]/65 dark:hover:bg-[#ef4444]/15 dark:hover:text-[#f87171]"
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
                  : "bg-[#2563eb] hover:bg-[#1d4ed8]",
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
        <div className="px-4 py-3 text-[14px] leading-7 text-[var(--creed-text-primary)]">
          {isDelete ? (
            <span>
              Removes the entire{" "}
              <span className="font-medium">{existingName}</span> section and
              any pending proposals targeting it.
            </span>
          ) : isRename ? (
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
        {proposal.reason ? (
          // Delete reason picks up the red tint to match the rest of the
          // card's colour signalling. Non-destructive meta kinds stay on
          // the neutral secondary text colour.
          <div
            className={cn(
              "px-4 py-2.5 text-sm leading-5",
              dividerClass,
              isDelete
                ? "text-[#dc2626] dark:text-[#f87171]"
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
