"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, History, RotateCcw, X } from "@/components/ui/phosphor-icons";
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

type DocumentProposal = {
  id: string;
  actorType: ActorType;
  authorUserId: string | null;
  authorAgentLabel: string | null;
  content: string;
  summary: string;
  baseRevision: number;
  status: string;
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

function useSectionSummary(before: string, after: string) {
  return useMemo(() => {
    const parts = computeDiffParts(before, after);
    const stats = summarizeDiff(parts);
    const changedSections = diffMarkdownSections(before, after).filter(
      (change) => change.status !== "unchanged"
    ).length;
    return { stats, changedSections };
  }, [before, after]);
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
  const [expandedProposal, setExpandedProposal] = useState<string | null>(null);
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
              {proposals.length} pending {proposals.length === 1 ? "proposal" : "proposals"}
            </span>
          </div>
          <div className="divide-y divide-[var(--creed-border)]">
            {proposals.map((proposal) => (
              <ProposalRow
                key={proposal.id}
                proposal={proposal}
                currentContent={currentContent}
                person={resolvePerson(proposal.authorUserId, proposal.authorAgentLabel)}
                expanded={expandedProposal === proposal.id}
                busy={busyProposal === proposal.id}
                onToggle={() =>
                  setExpandedProposal((current) => (current === proposal.id ? null : proposal.id))
                }
                onAccept={() => void resolveProposal(proposal.id, "accept")}
                onReject={() => void resolveProposal(proposal.id, "reject")}
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

function ProposalRow({
  proposal,
  currentContent,
  person,
  expanded,
  busy,
  onToggle,
  onAccept,
  onReject,
}: {
  proposal: DocumentProposal;
  currentContent: string;
  person: Person;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const { stats, changedSections } = useSectionSummary(currentContent, proposal.content);

  return (
    <div className="px-4 py-3">
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
          <PersonBadge person={person} />
          <span className="truncate text-[13px] text-[var(--creed-text-secondary)]">
            {" "}
            {proposal.actorType === "agent" ? "proposed an edit" : "proposed a change"} ·{" "}
            {changedSections} {changedSections === 1 ? "section" : "sections"} ·{" "}
            {relativeTime(proposal.createdAt)}
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
            <DiffBadge tone="added" count={stats.added} />
            <DiffBadge tone="removed" count={stats.removed} />
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 rounded-md px-2 text-[12px] text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
            disabled={busy}
            onClick={onReject}
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1 rounded-md bg-[var(--creed-accent)] px-2.5 text-[12px] text-white hover:bg-[var(--creed-accent-hover)]"
            disabled={busy}
            onClick={onAccept}
          >
            <Check className="h-3.5 w-3.5" />
            Accept
          </Button>
        </div>
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
              <SectionGroupedDiff before={currentContent} after={proposal.content} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
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
