"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, X } from "lucide-react";
import { ChevronDownIcon as AnimatedChevronDown } from "@/components/ui/chevron-down";
import type { Proposal } from "@/lib/creed-data";
import { getProposalPreviewText } from "@/lib/creed-data";
import { DiffBadge, computeDiffParts, summarizeDiff } from "@/components/creed/inline-proposal-diff";
import { AgentIconStack } from "@/components/creed/agent-icon-stack";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export type ReviewPillProposal = {
  proposal: Proposal;
  existingContent: string;
  sectionName?: string;
};

export function ReviewPill({
  proposals,
  onAcceptAll,
  onRejectAll,
  onAcceptOne,
  onRejectOne,
  onJumpToProposal,
}: {
  proposals: ReviewPillProposal[];
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onAcceptOne: (proposalId: string) => void;
  onRejectOne: (proposalId: string) => void;
  onJumpToProposal: (proposal: Proposal) => void;
}) {
  const perProposalStats = useMemo(() => {
    return proposals.map((item) => {
      const proposed = getProposalPreviewText(item.proposal.draft);
      const parts = computeDiffParts(item.existingContent, proposed);
      const summary = summarizeDiff(parts);
      // Override the +N/−N counts for structural proposals. The raw diff
      // between section content and the meta preview ("Delete section",
      // "Rename to Foo") produces misleading numbers — for a delete the
      // existing content gets counted as removed AND the literal "Delete
      // section" string gets counted as added, which inverts the signal.
      // Force the badges to read as: delete → +0 −1, new-section → +1 −0.
      if (item.proposal.draft.kind === "delete-section") {
        return { id: item.proposal.id, added: 0, removed: 1, parts };
      }
      if (item.proposal.draft.kind === "new-section") {
        return { id: item.proposal.id, added: 1, removed: 0, parts };
      }
      return { id: item.proposal.id, ...summary, parts };
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

  // Hover-driven open/close. A single shared close timer means moving the
  // cursor between the trigger, the content, or any sub-panel cancels the
  // pending close — but lingering away from all of them closes after
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
    <div className="inline-flex items-center gap-1 rounded-[16px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1.5 shadow-[0_8px_24px_rgba(28,28,26,0.04)]">
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
            className="group/trigger inline-flex h-7 items-center gap-2 rounded-md px-2.5 text-[12px] font-medium text-[var(--creed-text-secondary)] outline-none transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] focus:outline-none focus-visible:outline-none"
          >
            <span className="inline-flex items-center gap-1">
              <DiffBadge tone="added" count={totals.added} />
              <DiffBadge tone="removed" count={totals.removed} />
            </span>
            <span className="text-[var(--creed-text-tertiary)]">·</span>
            <span>
              <span className="sm:hidden">{proposals.length}</span>
              <span className="hidden sm:inline">
                {proposals.length === 1 ? "1 proposal" : `${proposals.length} proposals`}
              </span>
            </span>
            <AnimatedChevronDown
              size={14}
              // Tertiary by default, flips to primary text colour when the
              // trigger row is hovered or the dropdown is open — matches
              // the chevron behaviour on the profile and colour dropdowns.
              className="-rotate-90 text-[var(--creed-text-tertiary)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/trigger:text-[var(--creed-text-primary)] group-data-[state=open]/trigger:rotate-0 group-data-[state=open]/trigger:text-[var(--creed-text-primary)]"
            />
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
            // Don't return focus to the trigger button on close — the
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
                  onJumpToProposal={onJumpToProposal}
                  onAcceptOne={onAcceptOne}
                  onRejectOne={onRejectOne}
                />
              );
            }
            const isDeleteProposal = item.proposal.draft.kind === "delete-section";
            const isNewSectionProposal = item.proposal.draft.kind === "new-section";
            return (
              <DropdownMenuSub key={item.proposal.id}>
                <DropdownMenuSubTrigger className="group/sub rounded-[var(--radius-md)] px-2 py-1.5 text-[12px] hover:bg-[var(--creed-surface-raised)] [&>svg:last-of-type]:hidden">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <AgentIconStack
                      agents={[item.proposal.agentName]}
                      variant="inline"
                      itemClassName="h-4 w-4"
                      maxVisible={1}
                    />
                    <span className="min-w-0 flex-1 truncate text-[var(--creed-text-primary)]">
                      {item.sectionName ?? item.proposal.sectionName}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <DiffBadge tone="added" count={stats.added} size="xs" />
                      <DiffBadge tone="removed" count={stats.removed} size="xs" />
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
                  <div className="flex items-center justify-between gap-2 border-b border-[var(--creed-border)] px-3 py-2 text-[12px] text-[var(--creed-text-secondary)]">
                    <div className="flex min-w-0 items-center gap-2">
                      <AgentIconStack
                        agents={[item.proposal.agentName]}
                        variant="inline"
                        itemClassName="h-4 w-4"
                        maxVisible={1}
                      />
                      <span className="truncate font-medium text-[var(--creed-text-primary)]">
                        {item.proposal.agentName}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1">
                      <DiffBadge tone="added" count={stats.added} />
                      <DiffBadge tone="removed" count={stats.removed} />
                    </span>
                  </div>
                  <div className="creed-diff-block max-h-[200px] overflow-y-auto px-3 py-2 text-[12px] leading-5">
                    {isDeleteProposal ? (
                      // Style the Delete line as a removal — same red
                      // background + strikethrough as the diff machinery's
                      // `creed-diff-remove` so the affordance is consistent
                      // with how removed text is already shown elsewhere.
                      <span className="creed-diff-remove">
                        Delete {item.sectionName ?? item.proposal.sectionName}
                      </span>
                    ) : stats.parts.length === 0 ? (
                      <span className="text-[var(--creed-text-tertiary)]">No textual change</span>
                    ) : (
                      stats.parts.map((part, i) => {
                        if (part.added) {
                          return (
                            <span key={i} className="creed-diff-add">
                              {part.value}
                            </span>
                          );
                        }
                        if (part.removed) {
                          return (
                            <span key={i} className="creed-diff-remove">
                              {part.value}
                            </span>
                          );
                        }
                        return <span key={i}>{part.value}</span>;
                      })
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1 border-t border-[var(--creed-border)] px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        // Close immediately so the smooth scroll is the
                        // only thing the page is doing — and so the
                        // dropdown unmount can't fight the scroll.
                        cancelClose();
                        setOpen(false);
                        onJumpToProposal(item.proposal);
                      }}
                      className="inline-flex h-7 items-center rounded-md px-2 text-[12px] font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                    >
                      Jump to section
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onRejectOne(item.proposal.id)}
                        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => onAcceptOne(item.proposal.id)}
                        className={cn(
                          "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[12px] font-medium text-white transition-colors",
                          // Accept colour reflects intent for structural
                          // operations: red for delete-section, green for
                          // new-section, default blue for content updates.
                          isDeleteProposal
                            ? "bg-[#dc2626] hover:bg-[#b91c1c]"
                            : isNewSectionProposal
                              ? "bg-[#10b981] hover:bg-[#059669]"
                              : "bg-[#2563eb] hover:bg-[#1d4ed8]"
                        )}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Accept
                      </button>
                    </div>
                  </div>
                </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Reject/Accept all buttons follow the per-proposal expansion list */}
      <button
        type="button"
        onClick={onRejectAll}
        aria-label="Reject all"
        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
      >
        <X className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Reject all</span>
      </button>
      <button
        type="button"
        onClick={onAcceptAll}
        aria-label="Accept all"
        className="inline-flex h-7 items-center gap-1 rounded-md bg-[#2563eb] px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-[#1d4ed8]"
      >
        <Check className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Accept all</span>
      </button>
    </div>
  );
}

function ReviewPillItem({
  item,
  stats,
  onJumpToProposal,
  onAcceptOne,
  onRejectOne,
}: {
  item: ReviewPillProposal;
  stats: { added: number; removed: number; parts: ReturnType<typeof computeDiffParts> };
  onJumpToProposal: (proposal: Proposal) => void;
  onAcceptOne: (proposalId: string) => void;
  onRejectOne: (proposalId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isDeleteProposal = item.proposal.draft.kind === "delete-section";
  const isNewSectionProposal = item.proposal.draft.kind === "new-section";

  return (
    <div className="rounded-[var(--radius-md)] transition-colors hover:bg-[var(--creed-surface-raised)]">
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left text-[12px] outline-none focus:outline-none focus-visible:outline-none"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90"
          )}
        />
        <AgentIconStack
          agents={[item.proposal.agentName]}
          variant="inline"
          itemClassName="h-4 w-4"
          maxVisible={1}
        />
        <span className="min-w-0 flex-1 truncate text-[var(--creed-text-primary)]">
          {item.sectionName ?? item.proposal.sectionName}
        </span>
        <span className="inline-flex items-center gap-1">
          <DiffBadge tone="added" count={stats.added} size="xs" />
          <DiffBadge tone="removed" count={stats.removed} size="xs" />
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
            <div className="creed-scrollbar creed-diff-block max-h-[220px] overflow-y-auto px-3 py-2 text-[12px] leading-5">
              {isDeleteProposal ? (
                <span className="creed-diff-remove">
                  Delete {item.sectionName ?? item.proposal.sectionName}
                </span>
              ) : stats.parts.length === 0 ? (
                <span className="text-[var(--creed-text-tertiary)]">No textual change</span>
              ) : (
                stats.parts.map((part, i) => {
                  if (part.added) {
                    return (
                      <span key={i} className="creed-diff-add">
                        {part.value}
                      </span>
                    );
                  }
                  if (part.removed) {
                    return (
                      <span key={i} className="creed-diff-remove">
                        {part.value}
                      </span>
                    );
                  }
                  return <span key={i}>{part.value}</span>;
                })
              )}
            </div>
            <div className="flex items-center justify-between gap-1 border-t border-[var(--creed-border)] px-2 py-1.5">
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onJumpToProposal(item.proposal);
                }}
                className="inline-flex h-7 items-center rounded-md px-2 text-[12px] font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-black/[0.06] hover:text-[var(--creed-text-primary)] dark:hover:bg-white/[0.08]"
              >
                Jump to section
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onRejectOne(item.proposal.id);
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-black/[0.06] hover:text-[var(--creed-text-primary)] dark:hover:bg-white/[0.08]"
                >
                  <X className="h-3.5 w-3.5" />
                  Reject
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onAcceptOne(item.proposal.id);
                  }}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[12px] font-medium text-white transition-colors",
                    isDeleteProposal
                      ? "bg-[#dc2626] hover:bg-[#b91c1c]"
                      : isNewSectionProposal
                        ? "bg-[#10b981] hover:bg-[#059669]"
                        : "bg-[#2563eb] hover:bg-[#1d4ed8]"
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                  Accept
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
