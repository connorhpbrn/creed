"use client";

// Mutator functions in this provider are intentionally declared as plain
// inline `function` declarations rather than `useCallback`s. Every mutator
// goes through `commitState`, which uses `setState`'s function-update
// form — so the "stale closure" risk that `react-hooks/exhaustive-deps`
// is meant to catch can't actually occur here. Wrapping each of 30+
// mutators in `useCallback` (with manually-curated deps for each) would
// be a large surface for subtle bugs without changing observable
// behaviour. Consumers that need fine-grained re-render control should
// use a selector pattern over the context value, not rely on referential
// stability of every action.
/* eslint-disable react-hooks/exhaustive-deps */

import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildVisibleCreedMarkdown,
  createStarterContent,
  applyReorderDraft,
  getMetaProposalDiffText,
  getProposalPreviewText,
  inferAgentSectionAccent,
  initialOnboardingState,
  initialCreedState,
  normalizeLegacyProposalDraft,
  normalizeProposalForSection,
  type AccentKey,
  type ActivityEntry,
  type ConnectionItem,
  type CreedSection,
  type CreedSettings,
  type CreedState,
  type Proposal,
  type ProposalDraft,
} from "@/lib/creed-data";
import { normalizeRichTextInput } from "@/lib/rich-text";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type CreedContextValue = {
  state: CreedState;
  toggleLock: () => void;
  toggleSectionLock: (sectionId: string) => void;
  updateRichTextSection: (sectionId: string, content: string) => void;
  reorderSections: (sectionIds: string[]) => void;
  addSection: (name: string, starter?: string) => CreedSection;
  addSectionAfter: (afterSectionId: string, name: string, starter?: string) => void;
  renameSection: (sectionId: string, name: string) => void;
  setSectionAccent: (sectionId: string, accent: AccentKey) => void;
  duplicateSection: (sectionId: string) => void;
  deleteSection: (sectionId: string) => void;
  clearSections: () => void;
  acceptProposal: (proposalId: string) => Promise<void>;
  acceptProposals: (proposalIds: string[]) => void;
  rejectProposal: (proposalId: string) => void;
  editProposalDraft: (proposalId: string, draft: ProposalDraft) => void;
  toggleConnectionWriteAccess: (connectionId: string) => void;
  connectIntegration: (connectionId: string) => void;
  disconnectIntegration: (connectionId: string) => void;
  setRequireApproval: (value: boolean) => void;
  setVersionControlConfig: (patch: Partial<CreedSettings["versionControl"]>) => void;
  setDisplayName: (name: string) => void;
  refreshState: () => Promise<void>;
  importSections: (sections: CreedSection[]) => Promise<void>;
  rotateTokens: () => Promise<void>;
  rotateMcpCredential: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  updateOnboarding: (patch: Partial<CreedState["onboarding"]>) => void;
  resetOnboarding: () => void;
  claimOnboardingPreview: (sections: CreedSection[]) => Promise<void>;
  signOut: () => Promise<void>;
  exportMarkdown: () => string;
  exportActivityJson: () => string;
  exportAllDataJson: () => string;
};

const CreedContext = createContext<CreedContextValue | null>(null);
const AUTOSAVE_DELAY_MS = 500;
const EXTERNAL_SYNC_INTERVAL_MS = 30_000;

function nextMutationTick(state: CreedState) {
  return {
    ...state,
    mutationTick: state.mutationTick + 1,
  };
}

function updateSectionMeta(section: CreedSection, actor: string, type: "user" | "agent") {
  return {
    ...section,
    lastEditedBy: actor,
    lastEditedType: type,
    lastEditedLabel: "just now",
  } as CreedSection;
}

function getInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "CR";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function mergeExternalState(current: CreedState, incoming: CreedState, canReplaceSections: boolean) {
  return {
    ...current,
    user: incoming.user,
    readUrl: incoming.readUrl,
    readToken: incoming.readToken,
    writeToken: incoming.writeToken,
    directEditToken: incoming.directEditToken,
    mcpUrl: incoming.mcpUrl,
    mcpToken: incoming.mcpToken,
    mcpConfig: incoming.mcpConfig,
    mcpStatus: incoming.mcpStatus,
    mcpLastUsed: incoming.mcpLastUsed,
    mcpLastClientName: incoming.mcpLastClientName,
    mcpClients: incoming.mcpClients,
    universalConnectionPrompt: incoming.universalConnectionPrompt,
    sections: canReplaceSections ? incoming.sections : current.sections,
    proposals: incoming.proposals,
    activity: incoming.activity,
    settings: canReplaceSections ? incoming.settings : current.settings,
    connections: incoming.connections,
    sectionRevisions: canReplaceSections ? incoming.sectionRevisions : current.sectionRevisions,
  };
}

function cloneSection(section: CreedSection): CreedSection {
  const copyId = `${section.id}-copy-${Math.random().toString(36).slice(2, 7)}`;

  return { ...section, id: copyId, name: `${section.name} Copy` };
}

function getProposalBeforeText(section: CreedSection | undefined, _proposal: Proposal) {
  return section?.content;
}

// Monotonic suffix so two IDs generated in the same millisecond don't
// collide. The previous `Date.now()`-only IDs were colliding when
// `acceptProposals` batch-applied several proposals in one tick (multiple
// new sections + multiple activity rows landing in the same ms).
let idCounter = 0;
function uniqueLocalId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter.toString(36)}`;
}

function buildActivityEntry(
  proposal: Proposal,
  state: CreedState,
  status: "accepted" | "rejected" | "stale"
): ActivityEntry {
  const createdAt = new Date().toISOString();
  const section = state.sections.find((item) => item.id === proposal.sectionId);
  const normalizedProposal = normalizeProposalForSection(proposal, section);
  const metaDiff = getMetaProposalDiffText(normalizedProposal.draft, section);
  const beforeText = metaDiff?.before ?? getProposalBeforeText(section, normalizedProposal);
  const afterText = metaDiff?.after ?? getProposalPreviewText(normalizedProposal.draft);

  return {
    id: uniqueLocalId("activity"),
    proposalId: normalizedProposal.id,
    createdAt,
    dayLabel: "Today",
    sectionId: normalizedProposal.sectionId,
    sectionName: normalizedProposal.sectionName,
    accent: normalizedProposal.accent,
    actor: normalizedProposal.agentName,
    actorType: "agent",
    summary:
      status === "accepted"
        ? `Accepted ${normalizedProposal.sectionName.toLowerCase()} proposal`
        : status === "stale"
          ? `${normalizedProposal.sectionName} proposal became stale`
          : `Rejected ${normalizedProposal.sectionName.toLowerCase()} proposal`,
    timeLabel: "just now",
    status,
    changeType: normalizedProposal.changeType,
    reason: normalizedProposal.reason,
    impact: normalizedProposal.impact,
    confidence: normalizedProposal.confidence,
    beforeText,
    afterText,
  };
}

function applyProposalToSection(section: CreedSection, proposal: Proposal) {
  // Under the unified model every section is rich-text. normalizeLegacyProposalDraft
  // collapses any legacy draft shape (operating-principles, decisions, focus,
  // rules, chips) to a rich-text payload before we apply it.
  const draft = normalizeLegacyProposalDraft(proposal.draft);

  if (draft.kind === "rename-section") {
    const nextName = draft.name.trim();
    if (!nextName) return section;
    return updateSectionMeta({ ...section, name: nextName }, proposal.agentName, "agent");
  }

  if (draft.kind === "recolor-section") {
    return updateSectionMeta({ ...section, accent: draft.accent }, proposal.agentName, "agent");
  }

  if (draft.kind !== "rich-text") {
    return section;
  }

  const content = normalizeRichTextInput(draft);
  return updateSectionMeta({ ...section, content }, proposal.agentName, "agent");
}

function createSectionFromProposalDraft(proposal: Proposal): CreedSection | null {
  const draft = normalizeLegacyProposalDraft(proposal.draft);

  if (draft.kind !== "new-section") {
    return null;
  }

  const content = normalizeRichTextInput(draft);

  return {
    id: uniqueLocalId("section"),
    kind: "rich-text",
    template: draft.template ?? "freeform",
    name: draft.name.trim() || "New section",
    accent:
      draft.accent ??
      inferAgentSectionAccent({
        name: draft.name,
        content: draft.contentMarkdown ?? draft.contentHtml,
        insertAfterSectionId: draft.insertAfterSectionId,
      }),
    content,
    agentWritable: true,
    lastEditedBy: proposal.agentName,
    lastEditedType: "agent",
    lastEditedLabel: "just now",
  };
}

function bumpSectionRevisionMap(
  revisions: CreedState["sectionRevisions"],
  sectionId: string
) {
  return {
    ...revisions,
    [sectionId]: (revisions[sectionId] ?? 0) + 1,
  };
}

export function CreedProvider({
  children,
  initialState = initialCreedState,
  persistenceEnabled = false,
}: {
  children: ReactNode;
  initialState?: CreedState;
  persistenceEnabled?: boolean;
}) {
  const [state, setState] = useState(initialState);
  const latestStateRef = useRef(initialState);
  const saveTimerRef = useRef<number | null>(null);
  const lastPersistedTickRef = useRef(initialState.mutationTick);

  const persistState = useCallback(async (nextState: CreedState, keepalive = false) => {
    if (!persistenceEnabled) {
      return;
    }

    const response = await fetch("/api/app/state", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      keepalive,
      body: JSON.stringify({ state: nextState }),
    });

    if (!response.ok) {
      throw new Error("Could not save Creed.");
    }
  }, [persistenceEnabled]);

  const flushPendingState = useCallback(async (snapshot: CreedState, keepalive = false) => {
    try {
      await persistState(snapshot, keepalive);
      lastPersistedTickRef.current = snapshot.mutationTick;
      setState((current) =>
        current.mutationTick === snapshot.mutationTick
          ? { ...current, syncLabel: "Saved just now" }
          : current
      );
    } catch {
      setState((current) =>
        current.mutationTick === snapshot.mutationTick
          ? { ...current, syncLabel: "Save failed" }
          : current
      );
    }
  }, [persistState]);

  function schedulePersist(snapshot: CreedState) {
    latestStateRef.current = snapshot;

    if (!persistenceEnabled) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void flushPendingState(latestStateRef.current);
    }, AUTOSAVE_DELAY_MS);
  }

  function commitState(updater: (current: CreedState) => CreedState) {
    setState((current) => {
      const nextState = updater(current);
      const shouldPersist = persistenceEnabled && nextState.mutationTick !== current.mutationTick;
      const finalState = shouldPersist
        ? {
            ...nextState,
            syncLabel: "Saving...",
          }
        : nextState;

      latestStateRef.current = finalState;

      if (shouldPersist) {
        schedulePersist(finalState);
      }

      return finalState;
    });
  }

  useEffect(() => {
    if (!persistenceEnabled) {
      return;
    }

    function flushCurrentState() {
      const snapshot = latestStateRef.current;
      if (snapshot.mutationTick === lastPersistedTickRef.current) {
        return;
      }

      void flushPendingState(snapshot, true);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flushCurrentState();
      }
    }

    window.addEventListener("beforeunload", flushCurrentState);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", flushCurrentState);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [flushPendingState, persistenceEnabled]);

  const syncFromServer = useCallback(async () => {
    if (!persistenceEnabled) {
      return;
    }

    const response = await fetch("/api/app/state", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { state?: CreedState };
    if (!payload.state) {
      return;
    }

    setState((current) => {
      const canReplaceSections = current.mutationTick === lastPersistedTickRef.current;
      const nextState = mergeExternalState(current, payload.state!, canReplaceSections);
      latestStateRef.current = nextState;
      return nextState;
    });
  }, [persistenceEnabled]);

  const fetchServerState = useCallback(async () => {
    if (!persistenceEnabled) {
      return null;
    }

    const response = await fetch("/api/app/state", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { state?: CreedState };
    return payload.state ?? null;
  }, [persistenceEnabled]);

  useEffect(() => {
    if (!persistenceEnabled) {
      return;
    }

    let interval: number | null = null;

    function startInterval() {
      stopInterval();
      interval = window.setInterval(() => {
        void syncFromServer();
      }, EXTERNAL_SYNC_INTERVAL_MS);
    }

    function stopInterval() {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
    }

    function onWindowFocus() {
      void syncFromServer();
      startInterval();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void syncFromServer();
        startInterval();
      } else {
        stopInterval();
      }
    }

    void syncFromServer();
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      startInterval();
    }

    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopInterval();
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [persistenceEnabled, syncFromServer]);

  function toggleLock() {
    commitState((current) =>
      nextMutationTick({
        ...current,
        locked: !current.locked,
        // Toggling the master lock always clears per-section overrides — the
        // header is the authority again.
        sectionLockOverrides: [],
      })
    );
  }

  function toggleSectionLock(sectionId: string) {
    commitState((current) => {
      // Per-section overrides only matter while the master lock is on. With
      // the file unlocked there's nothing to override; ignore.
      if (!current.locked) return current;

      const overrides = new Set(current.sectionLockOverrides);
      if (overrides.has(sectionId)) {
        overrides.delete(sectionId);
      } else {
        overrides.add(sectionId);
      }

      return nextMutationTick({
        ...current,
        sectionLockOverrides: Array.from(overrides),
      });
    });
  }

  function updateRichTextSection(sectionId: string, content: string) {
    commitState((current) =>
      nextMutationTick({
        ...current,
        syncLabel: "Saved just now",
        sections: current.sections.map((section) =>
          section.id === sectionId && section.kind === "rich-text"
            ? updateSectionMeta({ ...section, content }, "You", "user")
            : section
        ),
      })
    );
  }

  function reorderSections(sectionIds: string[]) {
    commitState((current) => {
      const map = new Map(current.sections.map((section) => [section.id, section]));
      const nextSections = sectionIds
        .map((id) => map.get(id))
        .filter((section): section is CreedSection => Boolean(section));

      return nextMutationTick({
        ...current,
        sections: nextSections,
      });
    });
  }

  function addSection(name: string, starter?: string) {
    const trimmedName = name.trim() || "New section";
    const newSection: CreedSection = {
      id: uniqueLocalId("section"),
      kind: "rich-text",
      template: "freeform",
      name: trimmedName,
      accent: "custom",
      content: starter ?? createStarterContent(trimmedName),
      agentWritable: true,
      lastEditedBy: "You",
      lastEditedType: "user",
      lastEditedLabel: "just now",
    };

    commitState((current) =>
      nextMutationTick({
        ...current,
        syncLabel: "Saved just now",
        sections: [...current.sections, newSection],
      })
    );

    return newSection;
  }

  function addSectionAfter(afterSectionId: string, name: string, starter?: string) {
    const trimmedName = name.trim() || "New section";
    const newSection: CreedSection = {
      id: uniqueLocalId("section"),
      kind: "rich-text",
      template: "freeform",
      name: trimmedName,
      accent: "custom",
      content: starter ?? createStarterContent(trimmedName),
      agentWritable: true,
      lastEditedBy: "You",
      lastEditedType: "user",
      lastEditedLabel: "just now",
    };

    commitState((current) => {
      const index = current.sections.findIndex((section) => section.id === afterSectionId);
      const nextSections = [...current.sections];
      nextSections.splice(index + 1, 0, newSection);

      return nextMutationTick({
        ...current,
        syncLabel: "Saved just now",
        sections: nextSections,
      });
    });
  }

  function renameSection(sectionId: string, name: string) {
    commitState((current) =>
      nextMutationTick({
        ...current,
        syncLabel: "Saved just now",
        sections: current.sections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                name: name.trim() || section.name,
                lastEditedBy: "You",
                lastEditedType: "user",
                lastEditedLabel: "just now",
              }
            : section
        ),
      })
    );
  }

  function setSectionAccent(sectionId: string, accent: AccentKey) {
    commitState((current) =>
      nextMutationTick({
        ...current,
        syncLabel: "Saved just now",
        sections: current.sections.map((section) =>
          section.id === sectionId ? updateSectionMeta({ ...section, accent }, "You", "user") : section
        ),
        proposals: current.proposals.map((proposal) =>
          proposal.sectionId === sectionId ? { ...proposal, accent } : proposal
        ),
        activity: current.activity.map((entry) =>
          entry.sectionId === sectionId ? { ...entry, accent } : entry
        ),
      })
    );
  }

  function duplicateSection(sectionId: string) {
    commitState((current) => {
      const section = current.sections.find((item) => item.id === sectionId);

      if (!section) {
        return current;
      }

      const index = current.sections.findIndex((item) => item.id === sectionId);
      const nextSections = [...current.sections];
      nextSections.splice(index + 1, 0, cloneSection(section));

      return nextMutationTick({
        ...current,
        syncLabel: "Saved just now",
        sections: nextSections,
      });
    });
  }

  function deleteSection(sectionId: string) {
    commitState((current) =>
      nextMutationTick({
        ...current,
        syncLabel: "Saved just now",
        sections: current.sections.filter((section) => section.id !== sectionId),
        proposals: current.proposals.filter((proposal) => proposal.sectionId !== sectionId),
        activity: current.activity.filter((entry) => entry.sectionId !== sectionId),
      })
    );
  }

  function clearSections() {
    // Reset back to the recommended default starter sections instead of
    // leaving the file empty — gives the user something to write into and
    // every connected agent a sane scaffold to read from straight away.
    const defaultSections = initialCreedState.sections.map((section) => ({
      ...section,
      lastEditedBy: "You",
      lastEditedType: "user" as const,
      lastEditedLabel: "just now",
    }));
    commitState((current) =>
      nextMutationTick({
        ...current,
        syncLabel: "Saved just now",
        sections: defaultSections,
        proposals: [],
        activity: [],
      })
    );
  }

  async function acceptProposal(proposalId: string) {
    const serverState = await fetchServerState();

    if (serverState) {
      setState((current) => {
        const canReplaceSections = current.mutationTick === lastPersistedTickRef.current;
        const merged = mergeExternalState(current, serverState, canReplaceSections);
        latestStateRef.current = merged;
        return merged;
      });
    }

    commitState((current) => {
      const rawProposal = current.proposals.find((item) => item.id === proposalId);

      if (!rawProposal) {
        return current;
      }

      const targetSection = current.sections.find((section) => section.id === rawProposal.sectionId);
      const proposal = normalizeProposalForSection(rawProposal, targetSection);

      const currentRevision = current.sectionRevisions[proposal.sectionId] ?? null;
      if (
        proposal.baseRevision != null &&
        currentRevision != null &&
        proposal.baseRevision !== currentRevision
      ) {
        return nextMutationTick({
          ...current,
          proposals: current.proposals.map((item) =>
            item.id === proposalId ? { ...item, status: "stale" } : item
          ),
          activity: [
            buildActivityEntry({ ...proposal, status: "stale" }, current, "stale"),
            ...current.activity.filter((entry) => entry.proposalId !== proposal.id),
          ],
        });
      }

      if (proposal.draft.kind === "new-section") {
        const newSectionDraft = proposal.draft;
        const newSection = createSectionFromProposalDraft(proposal);
        if (!newSection) {
          return current;
        }

        const insertAfterIndex = newSectionDraft.insertAfterSectionId
          ? current.sections.findIndex((section) => section.id === newSectionDraft.insertAfterSectionId)
          : -1;
        const nextSections = [...current.sections];
        if (insertAfterIndex === -1) {
          nextSections.push(newSection);
        } else {
          nextSections.splice(insertAfterIndex + 1, 0, newSection);
        }

        return nextMutationTick({
          ...current,
          syncLabel: "Saved just now",
          sectionRevisions: bumpSectionRevisionMap(current.sectionRevisions, newSection.id),
          sections: nextSections,
          proposals: current.proposals.filter((item) => item.id !== proposalId),
          activity: [
            buildActivityEntry(proposal, current, "accepted"),
            ...current.activity.filter((entry) => entry.proposalId !== proposal.id),
          ],
        });
      }

      if (proposal.draft.kind === "delete-section") {
        // Delete the targeted section and drop any other pending proposals
        // that targeted it — they're meaningless once the section is gone.
        const targetId = proposal.sectionId;
        return nextMutationTick({
          ...current,
          syncLabel: "Saved just now",
          sections: current.sections.filter((section) => section.id !== targetId),
          proposals: current.proposals.filter(
            (item) => item.id !== proposalId && item.sectionId !== targetId
          ),
          activity: [
            buildActivityEntry(proposal, current, "accepted"),
            ...current.activity.filter((entry) => entry.proposalId !== proposal.id),
          ],
        });
      }

      if (proposal.draft.kind === "reorder-section") {
        // Reorder is a sections-array mutation, not a per-section field
        // change, so it can't flow through applyProposalToSection.
        return nextMutationTick({
          ...current,
          syncLabel: "Saved just now",
          sections: applyReorderDraft(current.sections, proposal.sectionId, proposal.draft),
          proposals: current.proposals.filter((item) => item.id !== proposalId),
          activity: [
            buildActivityEntry(proposal, current, "accepted"),
            ...current.activity.filter((entry) => entry.proposalId !== proposal.id),
          ],
        });
      }

      return nextMutationTick({
        ...current,
        syncLabel: "Saved just now",
        sectionRevisions: bumpSectionRevisionMap(current.sectionRevisions, proposal.sectionId),
        sections: current.sections.map((section) =>
          section.id === proposal.sectionId ? applyProposalToSection(section, proposal) : section
        ),
        proposals: current.proposals.filter((item) => item.id !== proposalId),
        activity: [
          buildActivityEntry(proposal, current, "accepted"),
          ...current.activity.filter((entry) => entry.proposalId !== proposal.id),
        ],
      });
    });
  }

  // Accept many proposals in a single state commit. Bypasses the
  // per-proposal `fetchServerState` round-trip on purpose: that server
  // fetch was re-introducing already-accepted proposals because the
  // local persist hadn't synced yet, which is why "Accept all" used to
  // only land one accept per click. Trust the local state, drain
  // everything, let the persist effect push to the server in one pass.
  function acceptProposals(proposalIds: string[]) {
    if (proposalIds.length === 0) return;
    const idsToAccept = new Set(proposalIds);

    commitState((current) => {
      let nextSections = [...current.sections];
      let nextRevisions = current.sectionRevisions;
      const newActivityEntries: ActivityEntry[] = [];
      const remainingProposals = current.proposals.filter(
        (item) => !idsToAccept.has(item.id)
      );

      for (const id of proposalIds) {
        const rawProposal = current.proposals.find((item) => item.id === id);
        if (!rawProposal) continue;

        const targetSection = nextSections.find(
          (section) => section.id === rawProposal.sectionId
        );
        const proposal = normalizeProposalForSection(rawProposal, targetSection);

        const currentRevision = nextRevisions[proposal.sectionId] ?? null;
        const isStale =
          proposal.baseRevision != null &&
          currentRevision != null &&
          proposal.baseRevision !== currentRevision;

        if (isStale) {
          newActivityEntries.push(
            buildActivityEntry(
              { ...proposal, status: "stale" },
              { ...current, sections: nextSections },
              "stale"
            )
          );
          continue;
        }

        if (proposal.draft.kind === "new-section") {
          const newSectionDraft = proposal.draft;
          const newSection = createSectionFromProposalDraft(proposal);
          if (!newSection) continue;
          const insertAfterId = newSectionDraft.insertAfterSectionId;
          const insertAfterIndex = insertAfterId
            ? nextSections.findIndex((section) => section.id === insertAfterId)
            : -1;
          if (insertAfterIndex === -1) {
            nextSections.push(newSection);
          } else {
            nextSections.splice(insertAfterIndex + 1, 0, newSection);
          }
          nextRevisions = bumpSectionRevisionMap(nextRevisions, newSection.id);
        } else if (proposal.draft.kind === "delete-section") {
          // Drop the section and any other pending proposals targeting it
          // from the in-flight remainingProposals set so they don't hang
          // around after the batch lands.
          const targetId = proposal.sectionId;
          nextSections = nextSections.filter((section) => section.id !== targetId);
          for (let i = remainingProposals.length - 1; i >= 0; i -= 1) {
            if (remainingProposals[i].sectionId === targetId) {
              remainingProposals.splice(i, 1);
            }
          }
        } else if (proposal.draft.kind === "reorder-section") {
          nextSections = applyReorderDraft(
            nextSections,
            proposal.sectionId,
            proposal.draft
          );
        } else {
          nextSections = nextSections.map((section) =>
            section.id === proposal.sectionId
              ? applyProposalToSection(section, proposal)
              : section
          );
          nextRevisions = bumpSectionRevisionMap(nextRevisions, proposal.sectionId);
        }

        newActivityEntries.push(
          buildActivityEntry(
            proposal,
            { ...current, sections: nextSections },
            "accepted"
          )
        );
      }

      // Drop the old pending activity rows for everything we just acted
      // on, then prepend the new accepted/stale rows.
      const remainingActivity = current.activity.filter(
        (entry) => !entry.proposalId || !idsToAccept.has(entry.proposalId)
      );

      return nextMutationTick({
        ...current,
        syncLabel: "Saved just now",
        sections: nextSections,
        sectionRevisions: nextRevisions,
        proposals: remainingProposals,
        activity: [...newActivityEntries, ...remainingActivity],
      });
    });
  }

  function rejectProposal(proposalId: string) {
    commitState((current) => {
      const proposal = current.proposals.find((item) => item.id === proposalId);

      if (!proposal) {
        return current;
      }

      return nextMutationTick({
        ...current,
        proposals: current.proposals.filter((item) => item.id !== proposalId),
        activity: [
          buildActivityEntry(proposal, current, "rejected"),
          ...current.activity.filter((entry) => entry.proposalId !== proposal.id),
        ],
      });
    });
  }

  function editProposalDraft(proposalId: string, draft: ProposalDraft) {
    commitState((current) =>
      nextMutationTick({
        ...current,
        proposals: current.proposals.map((proposal) =>
          proposal.id === proposalId ? { ...proposal, draft } : proposal
        ),
      })
    );
  }

  function updateConnection(
    current: CreedState,
    connectionId: string,
    patch: Partial<ConnectionItem>
  ) {
    return current.connections.map((connection) =>
      connection.id === connectionId ? { ...connection, ...patch } : connection
    );
  }

  function toggleConnectionWriteAccess(connectionId: string) {
    commitState((current) =>
      nextMutationTick({
        ...current,
        connections: updateConnection(current, connectionId, {
          writeAccess: !current.connections.find((item) => item.id === connectionId)?.writeAccess,
        }),
      })
    );
  }

  function connectIntegration(connectionId: string) {
    commitState((current) =>
      nextMutationTick({
        ...current,
        connections: updateConnection(current, connectionId, {
          status: "connected",
          lastUsed: "just now",
          writeAccess: true,
        }),
      })
    );
  }

  function disconnectIntegration(connectionId: string) {
    commitState((current) =>
      nextMutationTick({
        ...current,
        connections: updateConnection(current, connectionId, {
          status: "not-connected",
          lastUsed: undefined,
          writeAccess: false,
        }),
      })
    );
  }

  function setRequireApproval(value: boolean) {
    commitState((current) =>
      nextMutationTick({
        ...current,
        settings: {
          ...current.settings,
          requireApproval: value,
        },
      })
    );
  }

  function setVersionControlConfig(patch: Partial<CreedSettings["versionControl"]>) {
    commitState((current) =>
      nextMutationTick({
        ...current,
        settings: {
          ...current.settings,
          versionControl: {
            ...current.settings.versionControl,
            ...patch,
          },
        },
      })
    );
  }

  function setDisplayName(name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    commitState((current) =>
      nextMutationTick({
        ...current,
        user: {
          ...current.user,
          name: trimmedName,
          avatarInitials: getInitials(trimmedName),
        },
      })
    );

    if (persistenceEnabled) {
      void fetch("/api/app/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: trimmedName }),
      });
    }
  }

  async function rotateTokens() {
    if (!persistenceEnabled) {
      return;
    }

    const response = await fetch("/api/app/tokens/rotate", {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Could not rotate Creed tokens.");
    }

    const payload = (await response.json()) as Pick<
      CreedState,
      "readToken" | "writeToken" | "directEditToken" | "readUrl" | "universalConnectionPrompt" | "connections"
    > & { proposalToken?: string };

    setState((current) => ({
      ...current,
      readToken: payload.readToken,
      writeToken: payload.proposalToken ?? payload.writeToken,
      directEditToken: payload.directEditToken,
      readUrl: payload.readUrl,
      universalConnectionPrompt: payload.universalConnectionPrompt,
      connections: payload.connections,
      syncLabel: "Saved just now",
    }));
  }

  async function rotateMcpCredential() {
    if (!persistenceEnabled) {
      return;
    }

    const response = await fetch("/api/app/mcp/rotate", {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Could not rotate MCP credential.");
    }

    const payload = (await response.json()) as Pick<
      CreedState,
      "mcpToken" | "mcpUrl" | "mcpConfig" | "mcpStatus" | "mcpLastUsed" | "mcpLastClientName" | "mcpClients"
    >;

    setState((current) => ({
      ...current,
      mcpToken: payload.mcpToken,
      mcpUrl: payload.mcpUrl,
      mcpConfig: payload.mcpConfig,
      mcpStatus: payload.mcpStatus,
      mcpLastUsed: payload.mcpLastUsed,
      mcpLastClientName: payload.mcpLastClientName,
      mcpClients: payload.mcpClients,
      syncLabel: "Saved just now",
    }));
  }

  async function deleteAccount() {
    if (!persistenceEnabled) {
      return;
    }

    const response = await fetch("/api/app/account", {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Could not delete account.");
    }

    window.location.href = "/";
  }

  function updateOnboarding(patch: Partial<CreedState["onboarding"]>) {
    setState((current) => ({
      ...current,
      onboarding: {
        ...current.onboarding,
        ...patch,
      },
    }));
  }

  function resetOnboarding() {
    setState((current) => ({
      ...current,
      onboarding: initialOnboardingState,
    }));
  }

  async function claimOnboardingPreview(sections: CreedSection[]) {
    const nextState = nextMutationTick({
      ...state,
      syncLabel: "Saved just now",
      sections,
      proposals: [],
      activity: [],
    });

    setState(nextState);

    if (!persistenceEnabled) {
      const response = await fetch("/api/app/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sections }),
      });

      if (!response.ok) {
        throw new Error("Could not create your Creed.");
      }
      return;
    }

    await persistState(nextState);
  }

  async function importSections(sections: CreedSection[]) {
    const hasVersionControlTarget =
      Boolean(state.settings.versionControl.repoOwner) &&
      Boolean(state.settings.versionControl.repoName) &&
      Boolean(state.settings.versionControl.branch);

    const nextState = nextMutationTick({
      ...state,
      syncLabel: "Saved just now",
      sections,
      proposals: [],
      settings: {
        ...state.settings,
        versionControl: {
          ...state.settings.versionControl,
          lastSyncedContentHash: undefined,
          syncStatus: hasVersionControlTarget ? "unknown" : "not-configured",
        },
      },
      sectionRevisions: Object.fromEntries(sections.map((section) => [section.id, 1])),
    });

    setState(nextState);

    if (!persistenceEnabled) {
      return;
    }

    await persistState(nextState);
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  function exportMarkdown() {
    return buildVisibleCreedMarkdown(state.sections);
  }

  function exportActivityJson() {
    return JSON.stringify(state.activity, null, 2);
  }

  function exportAllDataJson() {
    return JSON.stringify(state, null, 2);
  }

  const contextValue = useMemo<CreedContextValue>(
    () => ({
      state,
      toggleLock,
      toggleSectionLock,
      updateRichTextSection,
      reorderSections,
      addSection,
      addSectionAfter,
      renameSection,
      setSectionAccent,
      duplicateSection,
      deleteSection,
      clearSections,
      acceptProposal,
      acceptProposals,
      rejectProposal,
      editProposalDraft,
      toggleConnectionWriteAccess,
      connectIntegration,
      disconnectIntegration,
      setRequireApproval,
      setVersionControlConfig,
      setDisplayName,
      refreshState: syncFromServer,
      importSections,
      rotateTokens,
      rotateMcpCredential,
      deleteAccount,
      updateOnboarding,
      resetOnboarding,
      claimOnboardingPreview,
      signOut,
      exportMarkdown,
      exportActivityJson,
      exportAllDataJson,
    }),
    [
      state,
      toggleLock,
      toggleSectionLock,
      updateRichTextSection,
      reorderSections,
      addSection,
      addSectionAfter,
      renameSection,
      setSectionAccent,
      duplicateSection,
      deleteSection,
      clearSections,
      acceptProposal,
      acceptProposals,
      rejectProposal,
      editProposalDraft,
      toggleConnectionWriteAccess,
      connectIntegration,
      disconnectIntegration,
      setRequireApproval,
      setVersionControlConfig,
      setDisplayName,
      syncFromServer,
      importSections,
      rotateTokens,
      rotateMcpCredential,
      deleteAccount,
      updateOnboarding,
      resetOnboarding,
      claimOnboardingPreview,
      signOut,
      exportMarkdown,
      exportActivityJson,
      exportAllDataJson,
    ]
  );

  return (
    <CreedContext.Provider value={contextValue}>
      {children}
    </CreedContext.Provider>
  );
}

export function useCreed() {
  const context = useContext(CreedContext);

  if (!context) {
    throw new Error("useCreed must be used inside a CreedProvider");
  }

  return context;
}
