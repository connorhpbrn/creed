"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, History, LoaderCircle, MessageSquare, RotateCcw, Send, X } from "@/components/ui/phosphor-icons";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DiffBadge,
  computeDiffParts,
  summarizeDiff,
} from "@/components/creed/inline-proposal-diff";
import {
  diffMarkdownSections,
  sectionChangeLabel,
  type SectionChange,
  type SectionChangeStatus,
} from "@/lib/document-section-diff";
import type { WorkspaceUser } from "@/lib/document-collaboration";
import type { SharedDocument } from "@/lib/shared-documents";
import { cn } from "@/lib/utils";

// Supabase-only review surface for a shared document: workspace-shared pending
// proposals (accept/reject) and the append-only version history (diff/revert).
// Diffs are grouped by the document's dynamic Markdown sections (a summary plus
// per-section expandable diffs) and every proposal/version is attributed to the
// person behind it (avatar + name), not the model/MCP label.

type ActorType = "human" | "agent";

type SectionStatus = "added" | "removed" | "modified" | "unchanged";

type DocumentProposal = {
  id: string;
  actorType: ActorType;
  authorUserId: string | null;
  authorAgentLabel: string | null;
  kind: "document-content" | "document-section";
  content: string;
  summary: string;
  baseRevision: number;
  status: string;
  createdAt: string;
  batchId: string | null;
  sectionKey: string | null;
  sectionHeading: string | null;
  sectionLevel: number | null;
  sectionStatus: SectionStatus | null;
  sectionBefore: string | null;
  sectionAfter: string | null;
};

type ProposalComment = {
  id: string;
  body: string;
  status: "open" | "resolved";
  createdBy: string | null;
  authorLabel: string;
  createdAt: string;
};

type DocumentVersion = {
  id: string;
  revision: number;
  content: string;
  actorType: ActorType;
  authorUserId: string | null;
  authorAgentLabel: string | null;
  summary: string;
  createdAt: string;
};

type EditOutcomeResponse = {
  outcome?: "applied" | "proposed";
  document?: SharedDocument;
  error?: string;
};

type Person = {
  label: string;
  avatarUrl: string | null;
};

function relativeTime(iso: string) {
  const deltaMs = Math.max(Date.now() - new Date(iso).getTime(), 0);
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function initialsFor(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

// Person attribution: avatar + name. We monitor the workspace from a people
// perspective, so even an agent-authored change is credited to the person whose
// connection made it (agent edits carry that user id); the model/MCP label is
// only a last-resort fallback when no person is known.
function PersonBadge({ person }: { person: Person }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Avatar size="sm" className="h-5 w-5 shrink-0">
        {person.avatarUrl ? <AvatarImage src={person.avatarUrl} alt={person.label} /> : null}
        <AvatarFallback className="text-[10px]">{initialsFor(person.label)}</AvatarFallback>
      </Avatar>
      <span className="truncate font-medium text-[var(--creed-text-primary)]">{person.label}</span>
    </span>
  );
}

function DiffText({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => computeDiffParts(before, after), [before, after]);
  return (
    <div className="creed-diff-block max-h-[240px] overflow-y-auto rounded-[10px] bg-[var(--creed-surface)] px-3.5 py-3 text-[13px] leading-6">
      {parts.length === 0 ? (
        <span className="text-[var(--creed-text-tertiary)]">No textual change</span>
      ) : (
        parts.map((part, index) => {
          if (part.added) return <span key={index} className="creed-diff-add">{part.value}</span>;
          if (part.removed) return <span key={index} className="creed-diff-remove">{part.value}</span>;
          return <span key={index}>{part.value}</span>;
        })
      )}
    </div>
  );
}

const STATUS_DOT: Record<SectionChangeStatus, string> = {
  added: "bg-[var(--creed-success)]",
  removed: "bg-[var(--creed-danger)]",
  modified: "bg-[var(--creed-accent)]",
  unchanged: "bg-[var(--creed-text-tertiary)]",
};

function SectionChangeRow({
  change,
  open,
  onToggle,
}: {
  change: SectionChange;
  open: boolean;
  onToggle: () => void;
}) {
  const parts = useMemo(() => computeDiffParts(change.before, change.after), [change.before, change.after]);
  const stats = useMemo(() => summarizeDiff(parts), [parts]);
  const label = sectionChangeLabel(change);

  return (
    <div className="rounded-[10px] border border-[var(--creed-border)] bg-[var(--creed-surface)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90"
          )}
        />
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[change.status])} />
        <span className="truncate text-[13px] text-[var(--creed-text-primary)]">{label}</span>
        {change.status === "added" ? (
          <span className="shrink-0 text-[11px] text-[var(--creed-text-tertiary)]">new section</span>
        ) : change.status === "removed" ? (
          <span className="shrink-0 text-[11px] text-[var(--creed-text-tertiary)]">removed</span>
        ) : null}
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
          <DiffBadge tone="added" count={stats.added} />
          <DiffBadge tone="removed" count={stats.removed} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-2.5 pb-2.5">
              <DiffText before={change.before} after={change.after} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// Groups a whole-content diff by the document's Markdown sections: a per-section
// list where only changed sections are shown, each expandable to its own diff.
function SectionGroupedDiff({ before, after }: { before: string; after: string }) {
  const changes = useMemo(() => diffMarkdownSections(before, after), [before, after]);
  const changed = useMemo(() => changes.filter((change) => change.status !== "unchanged"), [changes]);
  const [openKey, setOpenKey] = useState<string | null>(null);

  // Auto-open when a single section changed; otherwise keep them collapsed so
  // the section list reads as a summary the reviewer can drill into.
  useEffect(() => {
    setOpenKey(changed.length === 1 ? changed[0].key : null);
  }, [changed]);

  if (changed.length === 0) {
    // Fall back to a plain whole-content diff when the change does not map onto
    // any heading (e.g. a document with no headings at all).
    return <DiffText before={before} after={after} />;
  }

  return (
    <div className="space-y-1.5">
      {changed.map((change) => (
        <SectionChangeRow
          key={change.key}
          change={change}
          open={openKey === change.key}
          onToggle={() => setOpenKey((current) => (current === change.key ? null : change.key))}
        />
      ))}
    </div>
  );
}

type ProposalBatch = {
  key: string;
  proposals: DocumentProposal[];
};

// Group the pending proposals into review items: the per-section proposals from
// one edit share a `batchId` and review together under one summary; a legacy
// whole-content proposal (no batch) is its own group of one. Insertion order is
// preserved so the newest edits keep their server ordering.
function groupProposalBatches(proposals: DocumentProposal[]): ProposalBatch[] {
  const order: string[] = [];
  const byKey = new Map<string, DocumentProposal[]>();
  for (const proposal of proposals) {
    const key = proposal.batchId ?? proposal.id;
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(proposal);
  }
  return order.map((key) => ({ key, proposals: byKey.get(key)! }));
}

// The before/after a proposal represents: a section proposal carries its own
// before/after; a legacy whole-content proposal diffs against the live document.
function proposalDiffPair(proposal: DocumentProposal, currentContent: string) {
  if (proposal.kind === "document-section") {
    return { before: proposal.sectionBefore ?? "", after: proposal.sectionAfter ?? "" };
  }
  return { before: currentContent, after: proposal.content };
}

function sectionRowLabel(proposal: DocumentProposal) {
  if (proposal.kind !== "document-section") return "Whole document";
  if ((proposal.sectionLevel ?? 0) === 0 || !proposal.sectionHeading) return "Intro";
  return proposal.sectionHeading;
}

export function DocumentReviewPanel({
  documentId,
  revision,
  currentContent,
  users,
  refreshSignal,
  onDocumentUpdated,
}: {
  documentId: string;
  revision: number;
  currentContent: string;
  users: WorkspaceUser[];
  refreshSignal?: number;
  onDocumentUpdated: (document: SharedDocument) => void;
}) {
  const [proposals, setProposals] = useState<DocumentProposal[]>([]);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [busyProposal, setBusyProposal] = useState<string | null>(null);
  const [revertingVersion, setRevertingVersion] = useState<string | null>(null);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const resolvePerson = useCallback(
    (authorUserId: string | null, agentLabel: string | null): Person => {
      if (authorUserId) {
        const user = usersById.get(authorUserId);
        if (user) return { label: user.label, avatarUrl: user.avatarUrl };
      }
      if (agentLabel) return { label: agentLabel, avatarUrl: null };
      return { label: "Someone", avatarUrl: null };
    },
    [usersById]
  );

  const refresh = useCallback(async () => {
    try {
      const [proposalsRes, versionsRes] = await Promise.all([
        fetch(`/api/app/documents/${encodeURIComponent(documentId)}/proposals`, { cache: "no-store" }),
        fetch(`/api/app/documents/${encodeURIComponent(documentId)}/versions`, { cache: "no-store" }),
      ]);
      if (proposalsRes.ok) {
        const payload = (await proposalsRes.json()) as { proposals?: DocumentProposal[] };
        setProposals(payload.proposals ?? []);
      }
      if (versionsRes.ok) {
        const payload = (await versionsRes.json()) as { versions?: DocumentVersion[] };
        setVersions(payload.versions ?? []);
      }
    } catch {
      // Non-fatal: leave the last known lists in place.
    }
  }, [documentId]);

  // Refetch when the document changes (id or applied revision) or when the
  // parent signals a new proposal was created (a proposal does not advance the
  // document revision, so revision alone would miss it).
  useEffect(() => {
    void refresh();
  }, [refresh, revision, refreshSignal]);

  // Keep proposals/versions live for the whole workspace: another member (or an
  // agent over MCP) can create or resolve a proposal without changing anything
  // this client knows about. Mirror the app's existing polling pattern
  // (creed-provider / notification-menu): poll on an interval, pause when the
  // tab is hidden, and refetch immediately on focus.
  useEffect(() => {
    let interval: number | null = null;

    function start() {
      stop();
      interval = window.setInterval(() => void refresh(), 30_000);
    }
    function stop() {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
    }
    function onFocus() {
      void refresh();
      start();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else {
        stop();
      }
    }

    if (document.visibilityState === "visible") start();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  async function resolveProposal(id: string, action: "accept" | "reject") {
    setBusyProposal(id);
    try {
      const response = await fetch(
        `/api/app/documents/${encodeURIComponent(documentId)}/proposals/${encodeURIComponent(id)}/${action}`,
        { method: "POST" }
      );
      const payload = (await response.json()) as EditOutcomeResponse & { proposal?: unknown };
      if (!response.ok) {
        throw new Error(payload.error || `Could not ${action} the proposal.`);
      }
      if (action === "accept" && payload.document) {
        onDocumentUpdated(payload.document);
      }
      toast.success(action === "accept" ? "Proposal accepted" : "Proposal rejected");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action} the proposal.`);
    } finally {
      setBusyProposal(null);
    }
  }

  async function revertTo(versionId: string) {
    setRevertingVersion(versionId);
    try {
      const response = await fetch(
        `/api/app/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/revert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedRevision: revision }),
        }
      );
      const payload = (await response.json()) as EditOutcomeResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Could not revert.");
      }
      if (payload.outcome === "applied" && payload.document) {
        onDocumentUpdated(payload.document);
        toast.success("Reverted to the selected version");
      } else {
        toast.success("Revert proposed for review");
      }
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revert.");
    } finally {
      setRevertingVersion(null);
    }
  }

  const batches = useMemo(() => groupProposalBatches(proposals), [proposals]);
  const hasProposals = proposals.length > 0;

  if (!hasProposals && versions.length === 0) {
    return null;
  }

  return (
    <div className="mt-5 space-y-3">
      {hasProposals ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--creed-border)] px-4 py-2.5">
            <span className="text-[13px] font-medium text-[var(--creed-text-primary)]">
              {batches.length} pending {batches.length === 1 ? "proposal" : "proposals"}
            </span>
          </div>
          <div className="divide-y divide-[var(--creed-border)]">
            {batches.map((batch) => (
              <ProposalBatchCard
                key={batch.key}
                batch={batch}
                documentId={documentId}
                currentContent={currentContent}
                users={users}
                person={resolvePerson(
                  batch.proposals[0].authorUserId,
                  batch.proposals[0].authorAgentLabel
                )}
                busyProposal={busyProposal}
                onResolve={resolveProposal}
              />
            ))}
          </div>
        </div>
      ) : null}

      {versions.length > 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <button
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            className="flex w-full items-center justify-between px-4 py-2.5"
            aria-expanded={historyOpen}
          >
            <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--creed-text-primary)]">
              <History className="h-3.5 w-3.5" />
              Version history
              <span className="text-[var(--creed-text-tertiary)]">({versions.length})</span>
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-[var(--creed-text-tertiary)] transition-transform duration-200",
                historyOpen ? "rotate-180" : "rotate-0"
              )}
            />
          </button>
          <AnimatePresence initial={false}>
            {historyOpen ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="divide-y divide-[var(--creed-border)] border-t border-[var(--creed-border)]">
                  {versions.map((version, index) => (
                    <VersionRow
                      key={version.id}
                      version={version}
                      // The change a version introduced is the diff against the
                      // version immediately before it (the next, older entry in
                      // this newest-first list). The oldest version diffs against
                      // an empty document, so it reads as all-added.
                      previousContent={versions[index + 1]?.content ?? ""}
                      person={resolvePerson(version.authorUserId, version.authorAgentLabel)}
                      isCurrent={index === 0}
                      expanded={expandedVersion === version.id}
                      reverting={revertingVersion === version.id}
                      onToggle={() =>
                        setExpandedVersion((current) => (current === version.id ? null : version.id))
                      }
                      onRevert={() => void revertTo(version.id)}
                    />
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  );
}

// One review item: the group of per-section proposals from a single edit (or a
// single legacy whole-content proposal). Shows a summary line the reviewer can
// expand into per-section rows, each accept/reject-able on its own, each with
// its own comment thread. Accept/reject-all are conveniences over the per-row
// controls.
function ProposalBatchCard({
  batch,
  documentId,
  currentContent,
  users,
  person,
  busyProposal,
  onResolve,
}: {
  batch: ProposalBatch;
  documentId: string;
  currentContent: string;
  users: WorkspaceUser[];
  person: Person;
  busyProposal: string | null;
  onResolve: (id: string, action: "accept" | "reject") => Promise<void>;
}) {
  const [open, setOpen] = useState(true);

  const summary = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const proposal of batch.proposals) {
      const { before, after } = proposalDiffPair(proposal, currentContent);
      const stats = summarizeDiff(computeDiffParts(before, after));
      added += stats.added;
      removed += stats.removed;
    }
    return { added, removed };
  }, [batch.proposals, currentContent]);

  const sectionCount = batch.proposals.length;
  const head = batch.proposals[0];
  const anyBusy = batch.proposals.some((proposal) => busyProposal === proposal.id);

  async function resolveAll(action: "accept" | "reject") {
    // Sequentially, so each section applies against the revision the previous
    // acceptance produced (the per-section merge guard handles ordering).
    for (const proposal of batch.proposals) {
      await onResolve(proposal.id, action);
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-200",
              open ? "rotate-0" : "-rotate-90"
            )}
          />
          <PersonBadge person={person} />
          <span className="truncate text-[13px] text-[var(--creed-text-secondary)]">
            {" "}
            {head.actorType === "agent" ? "proposed an edit" : "proposed a change"} ·{" "}
            {sectionCount} {sectionCount === 1 ? "section" : "sections"} · {relativeTime(head.createdAt)}
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
            <DiffBadge tone="added" count={summary.added} />
            <DiffBadge tone="removed" count={summary.removed} />
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 rounded-md px-2 text-[12px] text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
            disabled={anyBusy}
            onClick={() => void resolveAll("reject")}
          >
            <X className="h-3.5 w-3.5" />
            {sectionCount === 1 ? "Reject" : "Reject all"}
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1 rounded-md bg-[var(--creed-accent)] px-2.5 text-[12px] text-white hover:bg-[var(--creed-accent-hover)]"
            disabled={anyBusy}
            onClick={() => void resolveAll("accept")}
          >
            <Check className="h-3.5 w-3.5" />
            {sectionCount === 1 ? "Accept" : "Accept all"}
          </Button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-1.5">
              {batch.proposals.map((proposal) => (
                <ProposalSectionRow
                  key={proposal.id}
                  proposal={proposal}
                  currentContent={currentContent}
                  documentId={documentId}
                  users={users}
                  busy={busyProposal === proposal.id}
                  onAccept={() => void onResolve(proposal.id, "accept")}
                  onReject={() => void onResolve(proposal.id, "reject")}
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ProposalSectionRow({
  proposal,
  currentContent,
  documentId,
  users,
  busy,
  onAccept,
  onReject,
}: {
  proposal: DocumentProposal;
  currentContent: string;
  documentId: string;
  users: WorkspaceUser[];
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const { before, after } = proposalDiffPair(proposal, currentContent);
  const stats = useMemo(() => summarizeDiff(computeDiffParts(before, after)), [before, after]);
  const label = sectionRowLabel(proposal);
  const status = proposal.sectionStatus ?? "modified";

  return (
    <div className="rounded-[10px] border border-[var(--creed-border)] bg-[var(--creed-surface)]">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setShowDiff((value) => !value)}
          aria-expanded={showDiff}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              "h-3 w-3 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-200",
              showDiff ? "rotate-0" : "-rotate-90"
            )}
          />
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[status])} />
          <span className="truncate text-[13px] text-[var(--creed-text-primary)]">{label}</span>
          {status === "added" ? (
            <span className="shrink-0 text-[11px] text-[var(--creed-text-tertiary)]">new section</span>
          ) : status === "removed" ? (
            <span className="shrink-0 text-[11px] text-[var(--creed-text-tertiary)]">removed</span>
          ) : null}
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
            <DiffBadge tone="added" count={stats.added} />
            <DiffBadge tone="removed" count={stats.removed} />
          </span>
        </button>
        <button
          type="button"
          onClick={() => setShowComments((value) => !value)}
          aria-expanded={showComments}
          title="Comment on this section"
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--creed-text-tertiary)] hover:text-[var(--creed-text-primary)]",
            showComments ? "text-[var(--creed-text-primary)]" : ""
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 rounded-md px-1.5 text-[11px] text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
          disabled={busy}
          onClick={onReject}
        >
          <X className="h-3 w-3" />
          Reject
        </Button>
        <Button
          size="sm"
          className="h-6 gap-1 rounded-md bg-[var(--creed-accent)] px-2 text-[11px] text-white hover:bg-[var(--creed-accent-hover)]"
          disabled={busy}
          onClick={onAccept}
        >
          <Check className="h-3 w-3" />
          Accept
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {showDiff ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-2.5 pb-2.5">
              {proposal.kind === "document-section" ? (
                <DiffText before={before} after={after} />
              ) : (
                <SectionGroupedDiff before={before} after={after} />
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {showComments ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <ProposalCommentThread documentId={documentId} proposalId={proposal.id} users={users} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// The comment thread anchored to a single proposal. Comments are loaded lazily
// when the thread is first opened; open comments here are auto-resolved server
// side when the proposal is accepted or rejected.
function ProposalCommentThread({
  documentId,
  proposalId,
  users,
}: {
  documentId: string;
  proposalId: string;
  users: WorkspaceUser[];
}) {
  const [comments, setComments] = useState<ProposalComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/app/documents/${encodeURIComponent(documentId)}/comments?proposalId=${encodeURIComponent(proposalId)}`,
        { cache: "no-store" }
      );
      if (response.ok) {
        const payload = (await response.json()) as { comments?: ProposalComment[] };
        setComments(payload.comments ?? []);
      }
    } catch {
      // Non-fatal: leave the last known thread in place.
    } finally {
      setLoading(false);
    }
  }, [documentId, proposalId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    const text = body.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      const response = await fetch(
        `/api/app/documents/${encodeURIComponent(documentId)}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text, proposalId }),
        }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Could not add comment.");
      }
      setBody("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add comment.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-[var(--creed-border)] px-3 py-2.5">
      {loading ? (
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--creed-text-tertiary)]">
          <LoaderCircle className="h-3 w-3 animate-spin" />
          Loading comments…
        </div>
      ) : comments.length === 0 ? (
        <div className="text-[12px] text-[var(--creed-text-tertiary)]">
          No comments yet. Ask a question or leave a review note.
        </div>
      ) : (
        comments.map((comment) => {
          const author = comment.createdBy ? usersById.get(comment.createdBy) : undefined;
          const label = author?.label ?? comment.authorLabel;
          return (
            <div key={comment.id} className="flex gap-2">
              <Avatar size="sm" className="mt-0.5 h-5 w-5 shrink-0">
                {author?.avatarUrl ? <AvatarImage src={author.avatarUrl} alt={label} /> : null}
                <AvatarFallback className="text-[10px]">{initialsFor(label)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-[var(--creed-text-secondary)]">
                  <span className="font-medium text-[var(--creed-text-primary)]">{label}</span>
                  <span className="text-[var(--creed-text-tertiary)]">
                    {" · "}
                    {relativeTime(comment.createdAt)}
                    {comment.status === "resolved" ? " · resolved" : ""}
                  </span>
                </div>
                <div className="whitespace-pre-wrap break-words text-[13px] text-[var(--creed-text-primary)]">
                  {comment.body}
                </div>
              </div>
            </div>
          );
        })
      )}
      <div className="flex items-center gap-2 pt-1">
        <input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="Comment on this proposal"
          className="min-w-0 flex-1 rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] px-2.5 py-1.5 text-[13px] text-[var(--creed-text-primary)] outline-none placeholder:text-[var(--creed-text-tertiary)] focus:border-[var(--creed-accent)]"
        />
        <Button
          size="sm"
          className="h-8 shrink-0 gap-1 rounded-md bg-[var(--creed-accent)] px-2.5 text-[12px] text-white hover:bg-[var(--creed-accent-hover)]"
          disabled={posting || !body.trim()}
          onClick={() => void submit()}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function VersionRow({
  version,
  previousContent,
  person,
  isCurrent,
  expanded,
  reverting,
  onToggle,
  onRevert,
}: {
  version: DocumentVersion;
  previousContent: string;
  person: Person;
  isCurrent: boolean;
  expanded: boolean;
  reverting: boolean;
  onToggle: () => void;
  onRevert: () => void;
}) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-200",
              expanded ? "rotate-0" : "-rotate-90"
            )}
          />
          <div className="min-w-0">
            <div className="truncate text-[13px] text-[var(--creed-text-primary)]">
              {version.summary || `Revision ${version.revision}`}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--creed-text-secondary)]">
              <PersonBadge person={person} />
              <span className="text-[var(--creed-text-tertiary)]">· {relativeTime(version.createdAt)}</span>
            </div>
          </div>
        </button>
        {isCurrent ? (
          <span className="shrink-0 rounded-full bg-[var(--creed-surface-raised)] px-2 py-0.5 text-[11px] text-[var(--creed-text-secondary)]">
            Current
          </span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 rounded-md px-2 text-[12px] text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
            disabled={reverting}
            onClick={onRevert}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Revert
          </Button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-3">
              <SectionGroupedDiff before={previousContent} after={version.content} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
