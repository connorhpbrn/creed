"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Pencil, Trash2, X } from "lucide-react";
import { ChevronDownIcon as AnimatedChevronDown } from "@creed/ui/chevron-down";
import type { Proposal } from "@creed/core/creed-data";
import {
  getMetaProposalDiffText,
  getProposalPreviewText,
} from "@creed/core/creed-data";
import {
  CreedDiffView,
  DiffBadge,
  ProposalAuthor,
} from "@/components/creed/inline-proposal-diff";
import { computeCreedDiff, type CreedDiff } from "@/lib/creed-diff";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@creed/ui/dropdown-menu";
import { cn } from "@creed/ui/utils";

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

export type ReviewPillProposal = {
  proposal: Proposal;
  existingContent: string;
  sectionName?: string;
  // Whether THIS viewer can review (accept/reject) this proposal's section.
  canReview?: boolean;
};

const proposalDiffCache = new Map<
  string,
  {
    existingContent: string;
    proposedContent: string;
    diff: CreedDiff;
  }
>();

function proposalDiffInputs(item: ReviewPillProposal) {
  const draft = item.proposal.draft;
  if (draft.kind === "delete-section") return [item.existingContent, ""] as const;
  if (draft.kind === "new-section") {
    return ["", getProposalPreviewText(draft)] as const;
  }
  const meta = getMetaProposalDiffText(draft, {
    name: item.sectionName ?? item.proposal.sectionName,
    accent: item.proposal.accent,
  });
  return meta
    ? ([meta.before, meta.after] as const)
    : ([item.existingContent, getProposalPreviewText(draft)] as const);
}

function ReviewAllActions({
  onAcceptAll,
  onRejectAll,
}: {
  onAcceptAll: () => void;
  onRejectAll: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onRejectAll}
        aria-label="Reject all"
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-medium whitespace-nowrap text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
      >
        Reject all
      </button>
      <button
        type="button"
        onClick={onAcceptAll}
        aria-label="Accept all"
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-[var(--creed-accent)] px-2.5 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-[var(--creed-accent-hover)]"
      >
        Accept all
      </button>
    </>
  );
}

export const ReviewPill = memo(function ReviewPill({
  proposals,
  onAcceptAll,
  onRejectAll,
  onAcceptOne,
  onRejectOne,
  onEditOne = () => {},
  onDeleteOne = () => {},
  onJumpToProposal,
}: {
  proposals: ReviewPillProposal[];
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onAcceptOne: (proposalId: string) => void;
  onRejectOne: (proposalId: string) => void;
  // The proposal's own author edits/deletes it instead of reviewing.
  onEditOne?: (proposal: Proposal) => void;
  onDeleteOne?: (proposalId: string) => void;
  onJumpToProposal: (proposal: Proposal) => void;
}) {
  // A member with only their own (unreviewable) proposals shouldn't see the
  // bulk Accept/Reject-all controls - those act on proposals you can review.
  const hasReviewable = proposals.some(
    (item) => item.canReview && !item.proposal.mine,
  );
  const perProposalStats = useMemo(() => {
    return proposals.map((item) => {
      const [existing, proposed] = proposalDiffInputs(item);
      const cached = proposalDiffCache.get(item.proposal.id);
      const diff =
        cached?.existingContent === existing &&
        cached.proposedContent === proposed
          ? cached.diff
          : computeCreedDiff(existing, proposed);
      if (diff !== cached?.diff) {
        proposalDiffCache.set(item.proposal.id, {
          existingContent: existing,
          proposedContent: proposed,
          diff,
        });
      }
      return { id: item.proposal.id, ...diff };
    });
  }, [proposals]);

  const totals = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const s of perProposalStats) {
      added += s.added;
      removed += s.removed;
    }
    return { added, removed };
  }, [perProposalStats]);

  const isMobile = useIsMobile();
  const [openMobileProposalId, setOpenMobileProposalId] = useState<
    string | null
  >(null);

  // Hover-driven open/close. A single shared close timer means moving the
  // cursor between the trigger, the content, or any sub-panel cancels the
  // pending close - but lingering away from all of them closes after
  // ~200ms, so the dropdown disappears as soon as the user clearly moves on.
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelClose() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }
  function scheduleClose() {
    cancelClose();
    // Generous grace window so moving the cursor through the gap between
    // the trigger, the content card, the per-section sub-panel, or out
    // of the menu briefly doesn't dismiss it. Notion-style.
    closeTimerRef.current = setTimeout(() => setOpen(false), 600);
  }
  useEffect(() => () => cancelClose(), []);

  if (proposals.length === 0) {
    return null;
  }

  return (
    <div className="inline-flex max-w-full items-center gap-1 rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] px-1.5 py-1">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            // Desktop: hover opens the dropdown via mouseenter, with a
            // grace timer so moving cursor between trigger / content / sub
            // panels doesn't dismiss it. Mobile has no hover, so the
            // built-in Radix click-to-toggle is allowed through instead.
            onMouseEnter={
              isMobile
                ? undefined
                : () => {
                    cancelClose();
                    setOpen(true);
                  }
            }
            onMouseLeave={isMobile ? undefined : scheduleClose}
            className="group/trigger -ml-0.5 inline-flex h-8 items-center rounded-md pr-2.5 pl-3 text-sm font-medium text-[var(--creed-text-secondary)] outline-none transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--creed-accent)]/45"
          >
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <DiffBadge tone="added" count={totals.added} size="md" />
                <DiffBadge tone="removed" count={totals.removed} size="md" />
              </span>
              <span className="text-[var(--creed-text-tertiary)]">·</span>
              <span>
                <span className="sm:hidden">{proposals.length}</span>
                <span className="hidden sm:inline">
                  {proposals.length === 1
                    ? "1 proposal"
                    : `${proposals.length} proposals`}
                </span>
              </span>
              <AnimatedChevronDown
                size={14}
                // Tertiary by default, flips to primary text colour when the
                // trigger row is hovered or the dropdown is open - matches
                // the chevron behaviour on the profile and colour dropdowns.
                className="-rotate-90 text-[var(--creed-text-tertiary)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/trigger:text-[var(--creed-text-primary)] group-data-[state=open]/trigger:rotate-0 group-data-[state=open]/trigger:text-[var(--creed-text-primary)]"
              />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          // Counteract the outer pill's p-1.5 so the dropdown's left edge
          // lines up with the outer card's left edge, not the trigger's.
          alignOffset={-6}
          // Vertical breathing room matches the horizontal gap to neighbouring
          // cards so the popover feels evenly spaced (`gap-4` / 16px).
          sideOffset={16}
          // Force Radix to shift the dropdown away from viewport edges by 16px
          // on every side, so on mobile it never touches the screen edge even
          // when the trigger sits in the corner.
          collisionPadding={16}
          avoidCollisions
          // Mobile uses a viewport-aware cap so the inline-expanded diff
          // never touches the screen edge. Desktop restores the original
          // 280px width that the side-popping submenu was tuned against.
          // The `before:` pseudo-element extends the hover region 20px
          // upward, bridging the visible gap to the trigger pill. Same idea
          // on the right side so the cursor can pass through to the
          // side-popping per-section submenu without triggering close.
          className="relative w-[min(100vw-48px,300px)] border-[var(--creed-border)] bg-[var(--creed-surface)] p-1 before:pointer-events-auto before:absolute before:-top-5 before:left-0 before:right-0 before:h-5 before:content-[''] md:w-[280px]"
          onMouseEnter={isMobile ? undefined : cancelClose}
          onMouseLeave={isMobile ? undefined : scheduleClose}
          onCloseAutoFocus={(event) => {
            // Don't return focus to the trigger button on close - the
            // browser's smooth `scrollIntoView` from a "Jump to section"
            // click was getting interrupted by Radix's auto-focus.
            event.preventDefault();
          }}
        >
          {proposals.map((item, index) => {
            const stats = perProposalStats[index];
            // Mobile: inline accordion (side-popping submenus get clipped on
            // narrow screens). Desktop: original side-popping submenu.
            if (isMobile) {
              return (
                <ReviewPillItem
                  key={item.proposal.id}
                  item={item}
                  stats={stats}
                  open={openMobileProposalId === item.proposal.id}
                  onOpenChange={(nextOpen) =>
                    setOpenMobileProposalId(
                      nextOpen ? item.proposal.id : null,
                    )
                  }
                  onJumpToProposal={onJumpToProposal}
                  onAcceptOne={onAcceptOne}
                  onRejectOne={onRejectOne}
                  onEditOne={onEditOne}
                  onDeleteOne={onDeleteOne}
                />
              );
            }
            const isDeleteProposal =
              item.proposal.draft.kind === "delete-section";
            const isNewSectionProposal =
              item.proposal.draft.kind === "new-section";
            return (
              <DropdownMenuSub key={item.proposal.id}>
                <DropdownMenuSubTrigger className="group/sub rounded-[var(--radius-md)] px-2 py-1.5 text-sm hover:bg-[var(--creed-surface-raised)] [&>svg:last-of-type]:hidden">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <ProposalAuthor
                      authorType={item.proposal.authorType}
                      avatarUrl={item.proposal.authorAvatarUrl}
                      initials={item.proposal.authorInitials}
                      agentName={item.proposal.agentName}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-[var(--creed-text-primary)]">
                      {item.sectionName ?? item.proposal.sectionName}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <DiffBadge tone="added" count={stats.added} size="md" />
                      <DiffBadge
                        tone="removed"
                        count={stats.removed}
                        size="md"
                      />
                    </span>
                    <AnimatedChevronDown
                      size={14}
                      // Sub-row chevron: muted tertiary by default, swaps
                      // to primary on row hover / open so the affordance
                      // matches the parent dropdown's trigger chevron.
                      className="rotate-90 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/sub:-rotate-90 group-data-[state=open]/sub:-rotate-90 [&_svg]:h-[14px]! [&_svg]:w-[14px]! [&_svg]:stroke-[var(--creed-text-tertiary)]! group-hover/sub:[&_svg]:stroke-[var(--creed-text-primary)]! group-data-[state=open]/sub:[&_svg]:stroke-[var(--creed-text-primary)]!"
                    />
                  </div>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent
                    sideOffset={12}
                    alignOffset={-4}
                    // Pseudo-element bridges the 12px sideOffset gap so the
                    // cursor can travel from the row in the parent dropdown
                    // into this side panel without triggering close.
                    className="relative w-[320px] border-[var(--creed-border)] bg-[var(--creed-surface)] p-0 before:pointer-events-auto before:absolute before:-left-4 before:top-0 before:bottom-0 before:w-4 before:content-['']"
                    onMouseEnter={isMobile ? undefined : cancelClose}
                    onMouseLeave={isMobile ? undefined : scheduleClose}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-[var(--creed-border)] px-3 py-2 text-sm text-[var(--creed-text-secondary)]">
                      <div className="flex min-w-0 items-center gap-2">
                        <ProposalAuthor
                          authorType={item.proposal.authorType}
                          avatarUrl={item.proposal.authorAvatarUrl}
                          initials={item.proposal.authorInitials}
                          agentName={item.proposal.agentName}
                        />
                        <span className="truncate font-medium text-[var(--creed-text-primary)]">
                          {item.proposal.agentName}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1">
                        <DiffBadge tone="added" count={stats.added} size="md" />
                        <DiffBadge
                          tone="removed"
                          count={stats.removed}
                          size="md"
                        />
                      </span>
                    </div>
                    <div className="creed-diff-block max-h-[200px] overflow-y-auto py-2 text-[12px] leading-5">
                      <CreedDiffView diff={stats} />
                    </div>
                    <div className="flex items-center justify-between gap-1 border-t border-[var(--creed-border)] px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          // Close immediately so the smooth scroll is the
                          // only thing the page is doing - and so the
                          // dropdown unmount can't fight the scroll.
                          cancelClose();
                          setOpen(false);
                          onJumpToProposal(item.proposal);
                        }}
                        className="inline-flex h-7 items-center rounded-md px-2 text-sm font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                      >
                        Jump to section
                      </button>
                      {item.proposal.mine ? (
                        // Author's own proposal: edit (jump back to continue) or
                        // delete it - they never approve their own.
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="Edit proposal"
                            onClick={() => {
                              cancelClose();
                              setOpen(false);
                              onEditOne(item.proposal);
                            }}
                            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                          >
                            <Pencil className="h-3.5 w-3.5 sm:hidden" />
                            <span className="hidden sm:inline">Edit</span>
                          </button>
                          <button
                            type="button"
                            aria-label="Delete proposal"
                            onClick={() => onDeleteOne(item.proposal.id)}
                            className="inline-flex h-7 items-center gap-1 rounded-md bg-[#DC2626] px-2.5 text-sm font-medium text-white transition-colors hover:bg-[#B91C1C]"
                          >
                            <Trash2 className="h-3.5 w-3.5 sm:hidden" />
                            <span className="hidden sm:inline">Delete</span>
                          </button>
                        </div>
                      ) : item.canReview ? (
                        <div className="-mr-1 flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="Reject proposal"
                            onClick={() => onRejectOne(item.proposal.id)}
                            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                          >
                            <X className="h-3.5 w-3.5 sm:hidden" />
                            <span className="hidden sm:inline">Reject</span>
                          </button>
                          <button
                            type="button"
                            aria-label="Accept proposal"
                            onClick={() => onAcceptOne(item.proposal.id)}
                            className={cn(
                              "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-white transition-colors",
                              // Accept colour reflects intent for structural
                              // operations: red for delete-section, green for
                              // new-section, default blue for content updates.
                              isDeleteProposal
                                ? "bg-[#dc2626] hover:bg-[#b91c1c]"
                                : isNewSectionProposal
                                  ? "bg-[#16A34A] hover:bg-[#15803d]"
                                  : "bg-[var(--creed-accent)] hover:bg-[var(--creed-accent-hover)]",
                            )}
                          >
                            <Check className="h-3.5 w-3.5 sm:hidden" />
                            <span className="hidden sm:inline">Accept</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Reject/Accept all only when the viewer has proposals they can review
          (a member seeing only their own proposals can't bulk-approve). */}
      {hasReviewable ? (
        <ReviewAllActions onAcceptAll={onAcceptAll} onRejectAll={onRejectAll} />
      ) : null}
    </div>
  );
});

function ReviewPillItem({
  item,
  stats,
  open,
  onOpenChange,
  onJumpToProposal,
  onAcceptOne,
  onRejectOne,
  onEditOne,
  onDeleteOne,
}: {
  item: ReviewPillProposal;
  stats: {
    added: number;
    removed: number;
    lines: CreedDiff["lines"];
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJumpToProposal: (proposal: Proposal) => void;
  onAcceptOne: (proposalId: string) => void;
  onRejectOne: (proposalId: string) => void;
  onEditOne: (proposal: Proposal) => void;
  onDeleteOne: (proposalId: string) => void;
}) {
  const isDeleteProposal = item.proposal.draft.kind === "delete-section";
  const isNewSectionProposal = item.proposal.draft.kind === "new-section";

  return (
    <div className="rounded-[var(--radius-md)] hover:bg-[var(--creed-surface-raised)]">
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenChange(!open);
        }}
        className="flex w-full min-w-0 items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--creed-accent)]/45"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-[color,transform] duration-200",
            open
              ? "rotate-0 text-[var(--creed-text-primary)]"
              : "-rotate-90 text-[var(--creed-text-tertiary)]",
          )}
        />
        <ProposalAuthor
          authorType={item.proposal.authorType}
          avatarUrl={item.proposal.authorAvatarUrl}
          initials={item.proposal.authorInitials}
          agentName={item.proposal.agentName}
        />
        <span className="min-w-0 flex-1 truncate font-medium text-[var(--creed-text-primary)]">
          {isDeleteProposal || isNewSectionProposal
            ? "proposed"
            : (item.sectionName ?? item.proposal.sectionName)}
        </span>
        <span className="inline-flex items-center gap-1">
          <DiffBadge tone="added" count={stats.added} size="md" />
          <DiffBadge tone="removed" count={stats.removed} size="md" />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--creed-border)]" />
            <div className="creed-scrollbar creed-diff-block max-h-[220px] overflow-y-auto py-2 text-[12px] leading-5">
              <CreedDiffView diff={stats} />
            </div>
            <div className="flex items-center justify-between gap-1 border-t border-[var(--creed-border)] px-2 py-1.5">
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onJumpToProposal(item.proposal);
                }}
                className="inline-flex h-7 items-center rounded-md px-2 text-sm font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-black/[0.06] hover:text-[var(--creed-text-primary)] dark:hover:bg-white/[0.08]"
              >
                Jump
              </button>
              {item.proposal.mine ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Edit proposal"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onEditOne(item.proposal);
                    }}
                    className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-black/[0.06] hover:text-[var(--creed-text-primary)] dark:hover:bg-white/[0.08]"
                  >
                    <Pencil className="h-3.5 w-3.5 sm:hidden" />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Delete proposal"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onDeleteOne(item.proposal.id);
                    }}
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-[#DC2626] px-2.5 text-sm font-medium text-white transition-colors hover:bg-[#B91C1C]"
                  >
                    <Trash2 className="h-3.5 w-3.5 sm:hidden" />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                </div>
              ) : item.canReview ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Reject proposal"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onRejectOne(item.proposal.id);
                    }}
                    className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-black/[0.06] hover:text-[var(--creed-text-primary)] dark:hover:bg-white/[0.08]"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    aria-label="Accept proposal"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onAcceptOne(item.proposal.id);
                    }}
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-white transition-colors",
                      isDeleteProposal
                        ? "bg-[#dc2626] hover:bg-[#b91c1c]"
                        : isNewSectionProposal
                          ? "bg-[#16A34A] hover:bg-[#15803d]"
                          : "bg-[var(--creed-accent)] hover:bg-[var(--creed-accent-hover)]",
                    )}
                  >
                    Accept
                  </button>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
