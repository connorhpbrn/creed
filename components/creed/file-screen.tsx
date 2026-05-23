"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, Reorder, motion, useDragControls } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  Clock3,
  Ellipsis,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AnimatedCheckmark } from "@/components/ui/animated-checkmark";
import { Button } from "@/components/ui/button";
import { CloudDownloadIcon } from "@/components/ui/cloud-download";
import { CloudUploadIcon } from "@/components/ui/cloud-upload";
import { CopyIcon } from "@/components/ui/copy";
import { DeleteIcon } from "@/components/ui/delete";
import { DownloadIcon } from "@/components/ui/download";
import { FolderUpIcon } from "@/components/ui/folder-up";
import { GripVerticalIcon } from "@/components/ui/grip-vertical";
import { HistoryIcon } from "@/components/ui/history";
import { LockIcon, type LockIconHandle } from "@/components/ui/lock";
import { LockOpenIcon, type LockOpenIconHandle } from "@/components/ui/lock-open";
import { SquarePenIcon } from "@/components/ui/square-pen";
import { StampIcon, type StampIconHandle } from "@/components/ui/stamp";
import { FileStackIcon } from "@/components/ui/file-stack";
import { AnimatedMenuIconItem } from "@/components/creed/animated-icon-action";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AgentIconStack } from "@/components/creed/agent-icon-stack";
import {
  OverallQualityPopover,
  QualityRefreshButton,
  QualityRing,
  SectionQualityPopover,
  type CreedQualityReport,
} from "@/components/creed/file-quality-ui";
import {
  getInFlightFull,
  getQualityRunnerServerSnapshot,
  getQualityRunnerSnapshot,
  runFullQuality,
  runSectionQuality,
  setBaselineReport,
  subscribeQualityRunner,
} from "@/lib/ai/quality-runner";
import { RichTextEditor } from "@/components/creed/rich-text-editor";
import {
  DiffBadge,
  InlineMetaProposal,
  InlineNewSectionProposal,
  InlineProposalDiff,
  computeDiffParts,
  summarizeDiff,
} from "@/components/creed/inline-proposal-diff";
import { ReviewPill } from "@/components/creed/review-pill";
import { useCreedShellFileActions, useCreedShellActiveSection } from "@/components/creed/shell";
import { useCreed } from "@/components/creed/creed-provider";
import { parseCreedMarkdown } from "@/lib/creed-markdown";
import {
  accentColorMap,
  accentLabelMap,
  accentTintMap,
  VISIBLE_ACCENT_KEYS,
  getProposalPreviewText,
  normalizeLegacyProposalDraft,
  normalizeProposalForSection,
  sectionSuggestions,
  type AccentKey,
  type ActivityEntry,
  type ActivityStatus,
  type CreedSection,
  type Proposal,
} from "@/lib/creed-data";
import { cn } from "@/lib/utils";

const activityStatuses: Array<{ label: string; value: "all" | ActivityStatus }> = [
  { label: "All", value: "all" },
  { label: "Direct", value: "direct" },
  { label: "Accepted", value: "accepted" },
  { label: "Rejected", value: "rejected" },
];

const activityStatusLabelMap: Record<ActivityStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  direct: "Direct",
  rejected: "Rejected",
  stale: "Stale",
};

const FILE_NAV_INTENT_KEY = "creed:file-nav-intent";
const QUALITY_FINGERPRINT_IGNORED_KEYS = new Set([
  "lastEditedAt",
  "lastEditedBy",
  "lastEditedLabel",
  "lastEditedType",
  "revision",
]);

function qualityFingerprint(value: unknown) {
  return JSON.stringify(value, (key, nestedValue) =>
    QUALITY_FINGERPRINT_IGNORED_KEYS.has(key) ? undefined : nestedValue
  );
}

function getProposalStatusStyles(status: ActivityStatus) {
  if (status === "pending") {
    return "bg-[#EFF6FF] text-[#1D4ED8] dark:bg-[#1e3a8a]/25 dark:text-[#93c5fd]";
  }

  if (status === "direct") {
    return "bg-[#FFF6E8] text-[#C26A00] dark:bg-[#451a03]/40 dark:text-[#fbbf24]";
  }

  if (status === "accepted") {
    return "bg-[#F0FDF4] text-[#15803D] dark:bg-[#052e1a]/50 dark:text-[#4ade80]";
  }

  if (status === "stale") {
    return "bg-[#F5F3FF] text-[#7C3AED] dark:bg-[#2e1065]/40 dark:text-[#c4b5fd]";
  }

  return "bg-[#FEF2F2] text-[#B91C1C] dark:bg-[#3F1212]/40 dark:text-[#fca5a5]";
}

function formatRelativeTime(timestamp?: string, fallbackLabel?: string) {
  if (!timestamp) {
    return fallbackLabel ?? "just now";
  }

  const deltaMs = Math.max(Date.now() - new Date(timestamp).getTime(), 0);
  const minutes = Math.round(deltaMs / 60000);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  if (days === 1) {
    return "1d ago";
  }

  if (days < 7) {
    return `${days}d ago`;
  }

  const weeks = Math.round(days / 7);
  if (weeks === 1) {
    return "1w ago";
  }

  return `${weeks}w ago`;
}

function ActivityFilterPill({
  active,
  tone = "blue",
  onClick,
  children,
}: {
  active: boolean;
  tone?: "blue" | "green" | "red" | "orange" | "purple";
  onClick: () => void;
  children: ReactNode;
}) {
  const activeClass =
    tone === "green"
      ? "border-[#22C55E]/45 bg-[#F0FDF4] text-[#15803D] dark:border-[#4ade80]/45 dark:bg-[#052e1a]/50 dark:text-[#4ade80]"
      : tone === "red"
        ? "border-[#EF4444]/45 bg-[#FEF2F2] text-[#B91C1C] dark:border-[#F87171]/45 dark:bg-[#3F1212]/40 dark:text-[#fca5a5]"
        : tone === "orange"
          ? "border-[#F59E0B]/45 bg-[#FFF7ED] text-[#C26A00] dark:border-[#fbbf24]/45 dark:bg-[#451a03]/40 dark:text-[#fbbf24]"
          : tone === "purple"
            ? "border-[#8B5CF6]/45 bg-[#F5F3FF] text-[#7C3AED] dark:border-[#c4b5fd]/45 dark:bg-[#2e1065]/40 dark:text-[#c4b5fd]"
            : "border-[#2563EB]/45 bg-[#EFF6FF] text-[#1447E6] dark:border-[#93c5fd]/45 dark:bg-[#1e3a8a]/30 dark:text-[#93c5fd]";

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-1.5 text-[12px] font-medium outline-none transition-colors focus:outline-none focus-visible:outline-none",
        active
          ? activeClass
          : "border-[var(--creed-border)] bg-[var(--creed-surface)] text-[var(--creed-text-secondary)] hover:border-[var(--creed-border-strong)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
      )}
    >
      {children}
    </motion.button>
  );
}

function formatDayLabel(timestamp?: string, fallbackLabel?: string) {
  if (!timestamp) {
    return fallbackLabel ?? "Today";
  }

  const deltaMs = Math.max(Date.now() - new Date(timestamp).getTime(), 0);
  const days = Math.floor(deltaMs / 86_400_000);

  if (days <= 0) {
    return "Today";
  }

  if (days === 1) {
    return "Yesterday";
  }

  return "Earlier";
}

function uniqueAgentNames(names: Array<string | undefined | null>) {
  const seen = new Set<string>();

  return names.filter((name): name is string => {
    const normalized = name?.trim();
    if (!normalized || normalized.toLowerCase() === "you") {
      return false;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}


function resolveSectionAccent(
  summarySection: { id: string; name: string; accent: AccentKey },
  sections: CreedSection[]
) {
  const byId = sections.find((section) => section.id === summarySection.id);
  if (byId) {
    return byId.accent;
  }

  const normalizedName = summarySection.name.trim().toLowerCase();
  const byName = sections.find((section) => section.name.trim().toLowerCase() === normalizedName);
  if (byName) {
    return byName.accent;
  }

  return summarySection.accent;
}

type GitHubVersionStatus = {
  connected: boolean;
  configured: boolean;
  syncStatus:
    | "not-configured"
    | "unknown"
    | "up-to-date"
    | "local-ahead"
    | "remote-ahead"
    | "diverged";
  remoteSha?: string | null;
  remoteMessage?: string | null;
  remoteCommittedAt?: string | null;
  remoteContentHash?: string | null;
};

type GitHubPullPreview = {
  syncStatus:
    | "not-configured"
    | "unknown"
    | "up-to-date"
    | "local-ahead"
    | "remote-ahead"
    | "diverged";
  remoteSha?: string | null;
  remoteMessage?: string | null;
  remoteCommittedAt?: string | null;
  remoteContentHash?: string | null;
  warnings: string[];
  summary: Array<{ id: string; name: string; kind: string; accent: AccentKey }>;
  sections: CreedSection[];
};

export function FileScreen() {
  const router = useRouter();
  const {
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
    importSections,
    exportMarkdown,
    refreshState,
  } = useCreed();
  const pendingProposals = useMemo(
    () => state.proposals.filter((proposal) => proposal.status === "pending"),
    [state.proposals]
  );
  const normalizedPendingProposals = useMemo(
    () =>
      pendingProposals.map((proposal) =>
        normalizeProposalForSection(
          {
            ...proposal,
            draft: normalizeLegacyProposalDraft(proposal.draft),
          },
          state.sections.find((section) => section.id === proposal.sectionId)
        )
      ),
    [pendingProposals, state.sections]
  );
  const [activityOpen, setActivityOpen] = useState(false);

  // Global ⌘A / Ctrl+A → toggle the activity sidebar instead of select-all.
  // We skip when the user is typing inside an input / textarea / contenteditable
  // so basic editing still works.
  useEffect(() => {
    function isEditable(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (target.isContentEditable) return true;
      return false;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "a" && event.key !== "A") return;
      const isModifier = event.metaKey || event.ctrlKey;
      if (!isModifier) return;
      if (event.shiftKey || event.altKey) return;
      if (isEditable(event.target)) return;
      event.preventDefault();
      setActivityOpen((current) => !current);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  const qualitySnapshot = useSyncExternalStore(
    subscribeQualityRunner,
    getQualityRunnerSnapshot,
    getQualityRunnerServerSnapshot
  );
  const qualityReport = qualitySnapshot.report;
  const qualityLoading = qualitySnapshot.fullRunning;
  const qualitySectionLoading = useMemo(() => {
    const first = qualitySnapshot.sectionRunning.values().next();
    return first.done ? null : first.value;
  }, [qualitySnapshot.sectionRunning]);
  const [qualityNotice, setQualityNotice] = useState<string | null>(qualitySnapshot.error);
  const [qualityEnabled, setQualityEnabled] = useState(false);
  useEffect(() => {
    if (qualitySnapshot.error) setQualityNotice(qualitySnapshot.error);
  }, [qualitySnapshot.error]);
  const [analyzedFullFingerprint, setAnalyzedFullFingerprint] = useState<string | null>(null);
  const [analyzedSectionFingerprints, setAnalyzedSectionFingerprints] = useState<Record<string, string>>({});
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerName, setComposerName] = useState("");
  const [composerStarter, setComposerStarter] = useState<string | undefined>();
  const [insertAfterId, setInsertAfterId] = useState<string | null>(null);
  const [copiedAction, setCopiedAction] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [pullDialogOpen, setPullDialogOpen] = useState(false);
  const [pushMessage, setPushMessage] = useState("Update Creed");
  const [pushBusy, setPushBusy] = useState(false);
  const [pullBusy, setPullBusy] = useState(false);
  const [versionStatusBusy, setVersionStatusBusy] = useState(false);
  const [versionStatus, setVersionStatus] = useState<GitHubVersionStatus | null>(null);
  const [pullPreview, setPullPreview] = useState<GitHubPullPreview | null>(null);
  const [pullPreviewRenderKey, setPullPreviewRenderKey] = useState(0);
  const [showPullPreview, setShowPullPreview] = useState(false);
  const [selectedVersionAction, setSelectedVersionAction] = useState<"push" | "pull">("push");
  const [renameSectionState, setRenameSectionState] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteSectionState, setDeleteSectionState] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteFileOpen, setDeleteFileOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const composerAreaRef = useRef<HTMLDivElement | null>(null);
  const qualityBaselineLoadedRef = useRef(false);
  const currentFullFingerprintRef = useRef<string | null>(null);
  const sectionFingerprintByIdRef = useRef<Map<string, string>>(new Map());
  const versionIcon = useAnimatedIconControls();
  const activityIcon = useAnimatedIconControls();
  // `exportMarkdown` is re-created by the provider whenever state changes,
  // so depending on it alone is sufficient — listing `state.sections`
  // separately would be redundant.
  const localMarkdown = useMemo(() => exportMarkdown(), [exportMarkdown]);
  const sectionQualityById = useMemo(
    () => new Map((qualityReport?.sections ?? []).map((section) => [section.sectionId, section])),
    [qualityReport]
  );
  const currentFullFingerprint = useMemo(
    () => qualityFingerprint(state.sections),
    [state.sections]
  );
  const sectionFingerprintById = useMemo(
    () =>
      new Map(
        state.sections.map((section) => [section.id, qualityFingerprint(section)] as const)
      ),
    [state.sections]
  );
  const qualityHasReport = Boolean(qualityReport);
  const fullQualityDirty =
    qualityEnabled &&
    state.sections.length > 0 &&
    qualityHasReport &&
    (!analyzedFullFingerprint || analyzedFullFingerprint !== currentFullFingerprint);
  const qualityCanRunInitialAnalysis = qualityEnabled && state.sections.length > 0 && !qualityHasReport;

  useEffect(() => {
    currentFullFingerprintRef.current = currentFullFingerprint;
    sectionFingerprintByIdRef.current = sectionFingerprintById;
  }, [currentFullFingerprint, sectionFingerprintById]);
  const githubConfigured =
    state.settings.integrations.github.status === "connected" &&
    Boolean(state.settings.versionControl.repoOwner) &&
    Boolean(state.settings.versionControl.repoName) &&
    Boolean(state.settings.versionControl.branch);

  const pushDisabled =
    !githubConfigured ||
    versionStatusBusy ||
    versionStatus?.syncStatus === "up-to-date" ||
    versionStatus?.syncStatus === "remote-ahead";
  // Pull is allowed any time GitHub is configured — including when the
  // local file is "local-ahead." That way, as soon as you make a local
  // edit, you can still click Pull to refresh against the latest remote
  // commit. The pull-preview API always fetches fresh from the GitHub
  // contents endpoint (no caching — see `githubRequest` in lib/github.ts)
  // so the dialog shows the true current state of the remote.
  const pullDisabled = !githubConfigured || versionStatusBusy;
  const primaryVersionAction =
    versionStatus?.syncStatus === "remote-ahead" || versionStatus?.syncStatus === "diverged"
      ? "pull"
      : "push";

  useEffect(() => {
    if (pushDisabled && pullDisabled) {
      setSelectedVersionAction(primaryVersionAction);
    }
  }, [primaryVersionAction, pullDisabled, pushDisabled]);

  useEffect(() => {
    if (composerOpen) {
      inputRef.current?.focus();
    }
  }, [composerOpen]);

  useEffect(() => {
    let cancelled = false;

    async function loadVersionStatus() {
      if (state.settings.integrations.github.status !== "connected") {
        setVersionStatus({
          connected: false,
          configured: false,
          syncStatus: "not-configured",
        });
        return;
      }

      try {
        setVersionStatusBusy(true);
        const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(localMarkdown));
        const localHash = Array.from(new Uint8Array(buffer))
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
        const response = await fetch(`/api/app/github/status?localHash=${localHash}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json()) as GitHubVersionStatus & { error?: string };

        if (!response.ok) {
          throw new Error(payload?.error || "Could not load GitHub version status.");
        }

        if (!cancelled) {
          setVersionStatus(payload);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "Could not load GitHub version status."
          );
        }
      } finally {
        if (!cancelled) {
          setVersionStatusBusy(false);
        }
      }
    }

    void loadVersionStatus();

    return () => {
      cancelled = true;
    };
  }, [
    localMarkdown,
    state.settings.integrations.github.status,
    state.settings.versionControl.repoOwner,
    state.settings.versionControl.repoName,
    state.settings.versionControl.branch,
    state.settings.versionControl.lastSyncedContentHash,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadAiReadiness() {
      try {
        const response = await fetch("/api/app/ai/settings", {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          settings?: { keyStatus?: "missing" | "valid" | "invalid" };
        };
        if (!cancelled) {
          const enabled = payload.settings?.keyStatus === "valid";
          setQualityEnabled(enabled);
          setQualityNotice(enabled ? null : "Add an API key in Settings to enable quality analysis.");
        }
      } catch {
        if (!cancelled) {
          setQualityEnabled(false);
        }
      }
    }

    void loadAiReadiness();

    function onWindowFocus() {
      void loadAiReadiness();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void loadAiReadiness();
      }
    }

    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!qualityEnabled || state.sections.length === 0 || qualityBaselineLoadedRef.current) {
      return;
    }

    // Re-mount after navigation: if the runner already has a report cached,
    // skip the baseline read entirely. Likewise skip if a force refresh for
    // the same fingerprint is still in flight — we'll see its result via the
    // runner snapshot when it lands.
    if (qualityReport) {
      qualityBaselineLoadedRef.current = true;
      return;
    }
    if (getInFlightFull(`full:${currentFullFingerprint}`)) {
      qualityBaselineLoadedRef.current = true;
      return;
    }

    let cancelled = false;
    const sectionsSnapshot = state.sections;
    const fingerprintSnapshot = currentFullFingerprint;

    async function loadQualityBaseline() {
      try {
        qualityBaselineLoadedRef.current = true;
        // Reuse the runner so a navigate-away + return reattaches to any
        // in-flight baseline read instead of issuing a duplicate request.
        const payload = await runFullQuality({
          sections: sectionsSnapshot,
          fingerprint: `baseline:${fingerprintSnapshot}`,
          readOnly: true,
        });

        if (cancelled || !payload.report) {
          return;
        }

        setBaselineReport(payload.report);
        setAnalyzedFullFingerprint(
          payload.current
            ? fingerprintSnapshot
            : `stored:${payload.storedContentHash ?? payload.report.contentHash}`
        );
        setAnalyzedSectionFingerprints(
          Object.fromEntries(
            sectionsSnapshot.flatMap((section) => {
              const currentSectionFingerprint = qualityFingerprint(section);
              const storedSectionHash = payload.storedSectionHashes?.[section.id];
              const currentSectionHash = payload.sectionHashes?.[section.id];
              const hasLegacySectionReport = payload.report?.sections.some(
                (sectionReport) => sectionReport.sectionId === section.id
              );

              if (payload.current || (storedSectionHash && storedSectionHash === currentSectionHash)) {
                return [[section.id, currentSectionFingerprint] as const];
              }

              if (storedSectionHash) {
                return [[section.id, `stored:${storedSectionHash}`] as const];
              }

              if (hasLegacySectionReport) {
                return [
                  [
                    section.id,
                    `stored:legacy:${payload.storedContentHash ?? payload.report?.contentHash ?? "unknown"}:${section.id}`,
                  ] as const,
                ];
              }

              return [];
            })
          )
        );
      } catch (error) {
        if (!cancelled) {
          qualityBaselineLoadedRef.current = false;
          setQualityNotice(
            error instanceof Error ? error.message : "Could not load the latest quality analysis."
          );
        }
      }
    }

    void loadQualityBaseline();

    return () => {
      cancelled = true;
    };
  }, [currentFullFingerprint, qualityEnabled, qualityReport, state.sections]);

  async function refreshFullQuality() {
    if (!qualityEnabled || qualityLoading || state.sections.length === 0) {
      return;
    }

    setQualityNotice(null);
    const sectionFingerprints = Object.fromEntries(
      state.sections.map((section) => [section.id, qualityFingerprint(section)])
    );

    try {
      // Refresh any sections whose body has drifted since their last
      // analysis — the runner dedups, so concurrent re-mounts share work.
      const staleSections = state.sections.filter((section) => {
        const analyzedFingerprint = analyzedSectionFingerprints[section.id];
        return Boolean(analyzedFingerprint) && analyzedFingerprint !== sectionFingerprints[section.id];
      });
      const refreshedSectionResults = await Promise.all(
        staleSections.map(async (section) => {
          try {
            const result = await runSectionQuality({
              section,
              fingerprint: sectionFingerprints[section.id]!,
            });
            return result ? ([section.id, result] as const) : null;
          } catch {
            return null;
          }
        })
      );
      const refreshedById = new Map(
        refreshedSectionResults.filter(
          (entry): entry is readonly [string, CreedQualityReport["sections"][number]] => Boolean(entry)
        )
      );

      const fingerprint = currentFullFingerprintRef.current ?? currentFullFingerprint;
      const payload = await runFullQuality({
        sections: state.sections,
        fingerprint: `full:${fingerprint}`,
        force: true,
      });

      if (payload.report) {
        // Overlay sharper per-section results onto the fresh full report so
        // forced single-section refreshes win over the bulk pass.
        if (refreshedById.size > 0) {
          setBaselineReport({
            ...payload.report,
            sections: payload.report.sections.map(
              (sectionReport) => refreshedById.get(sectionReport.sectionId) ?? sectionReport
            ),
          });
        }
        setAnalyzedFullFingerprint(fingerprint);
        setAnalyzedSectionFingerprints(
          Object.fromEntries(
            state.sections.map((section) => [
              section.id,
              sectionFingerprintByIdRef.current.get(section.id) ?? sectionFingerprints[section.id],
            ])
          )
        );
      }
    } catch (error) {
      setQualityNotice(
        error instanceof Error ? error.message : "Add an API key in Settings to enable quality analysis."
      );
    }
  }

  async function refreshSectionQuality(section: CreedSection) {
    if (!qualityEnabled || qualitySectionLoading === section.id) {
      return;
    }

    setQualityNotice(null);
    try {
      const sectionFingerprint =
        sectionFingerprintByIdRef.current.get(section.id) ?? qualityFingerprint(section);
      const nextSectionReport = await runSectionQuality({ section, fingerprint: sectionFingerprint });
      if (nextSectionReport) {
        setAnalyzedSectionFingerprints((current) => ({
          ...current,
          [section.id]: sectionFingerprint,
        }));
      }
    } catch (error) {
      setQualityNotice(error instanceof Error ? error.message : "Could not analyze this section.");
    }
  }

  const openComposer = useCallback((afterSectionId?: string) => {
    setInsertAfterId(afterSectionId ?? null);
    setComposerOpen(true);
    setComposerName("");
    setComposerStarter(undefined);
  }, []);

  const scrollComposerIntoView = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = editorScrollRef.current;
    const composerArea = composerAreaRef.current;

    if (!container || !composerArea) {
      return false;
    }

    container.scrollTo({
      top: Math.max(composerArea.offsetTop - 24, 0),
      behavior,
    });

    return true;
  }, []);

  const openComposerAndReveal = useCallback(
    (afterSectionId?: string) => {
      openComposer(afterSectionId);

      window.setTimeout(() => {
        scrollComposerIntoView("smooth");
      }, 60);
    },
    [openComposer, scrollComposerIntoView]
  );

  function submitComposer() {
    if (!composerName.trim()) {
      return;
    }

    if (insertAfterId) {
      addSectionAfter(insertAfterId, composerName, composerStarter);
    } else {
      addSection(composerName, composerStarter);
    }

    setComposerOpen(false);
    setComposerName("");
    setComposerStarter(undefined);
    setInsertAfterId(null);
  }

  async function copyValue(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedAction(key);
    window.setTimeout(() => setCopiedAction(null), 1400);
  }

  function markActionComplete(key: string) {
    setCopiedAction(key);
    window.setTimeout(() => setCopiedAction(null), 1400);
  }

  function downloadFile(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    markActionComplete("download");
  }

  async function handleImportFile(file: File) {
    try {
      setImportBusy(true);
      setCopiedAction(null);

      const markdown = await file.text();
      const parsed = parseCreedMarkdown(markdown);

      if (parsed.sections.length === 0) {
        throw new Error(parsed.warnings[0] ?? "Could not import this markdown file.");
      }

      await importSections(parsed.sections);
      if (parsed.warnings.length > 0) {
        toast.warning(`Imported ${file.name} with warnings.`);
      } else {
        toast.success(`Imported ${file.name}.`);
      }
      markActionComplete("import");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not import this markdown file."
      );
    } finally {
      setImportBusy(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }

  async function handlePushCreed() {
    try {
      setSelectedVersionAction("push");
      setPushBusy(true);
      const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(localMarkdown));
      const localHash = Array.from(new Uint8Array(buffer))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const response = await fetch("/api/app/github/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          markdown: localMarkdown,
          localHash,
          message: pushMessage.trim() || "Update Creed",
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Could not push Creed to GitHub.");
      }

      await refreshState();
      toast.success("Pushed Creed to GitHub.");
      setPushDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not push Creed.");
    } finally {
      setPushBusy(false);
    }
  }

  async function handleOpenPullReview() {
    try {
      setSelectedVersionAction("pull");
      setPullBusy(true);
      setPullDialogOpen(true);
      setPullPreview(null);

      const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(localMarkdown));
      const localHash = Array.from(new Uint8Array(buffer))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");

      const response = await fetch("/api/app/github/pull/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ localHash }),
      });
      const payload = (await response.json()) as GitHubPullPreview & { error?: string };

      if (!response.ok) {
        throw new Error(payload?.error || "Could not preview GitHub import.");
      }

      setPullPreview(payload);
      setPullPreviewRenderKey((current) => current + 1);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not preview GitHub import."
      );
      setPullDialogOpen(false);
    } finally {
      setPullBusy(false);
    }
  }

  async function handleApplyPull() {
    if (!pullPreview) {
      return;
    }

    try {
      setPullBusy(true);
      const response = await fetch("/api/app/github/pull/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sections: pullPreview.sections,
          remoteSha: pullPreview.remoteSha,
          remoteMessage: pullPreview.remoteMessage,
          remoteCommittedAt: pullPreview.remoteCommittedAt,
          remoteContentHash: pullPreview.remoteContentHash,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Could not import Creed from GitHub.");
      }

      await refreshState();
      toast.success("Pulled Creed from GitHub.");
      setPullDialogOpen(false);
      setPullPreview(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not import Creed from GitHub."
      );
    } finally {
      setPullBusy(false);
    }
  }

  const setActiveShellSection = useCreedShellActiveSection();
  const scrollLockRef = useRef<{ sectionId: string; until: number } | null>(null);

  const handleSectionSelect = useCallback(
    (sectionId: string) => {
      const container = editorScrollRef.current;

      if (!container) {
        return;
      }

      const element = container.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);

      if (!element) {
        return;
      }

      const stickyHeader = container.querySelector<HTMLElement>("[data-file-sticky-header]");
      const stickyOffset = stickyHeader?.getBoundingClientRect().height ?? 96;

      scrollLockRef.current = { sectionId, until: Date.now() + 1200 };
      setActiveShellSection(sectionId);

      container.scrollTo({
        top: Math.max(element.offsetTop - stickyOffset - 16, 0),
        behavior: "smooth",
      });
    },
    [setActiveShellSection]
  );

  const handleProposalSelect = useCallback((proposalId: string) => {
    const container = editorScrollRef.current;
    if (!container) return;
    const element = container.querySelector<HTMLElement>(
      `[data-proposal-id="${proposalId}"]`
    );
    if (!element) return;
    const stickyHeader = container.querySelector<HTMLElement>("[data-file-sticky-header]");
    const stickyOffset = stickyHeader?.getBoundingClientRect().height ?? 96;
    container.scrollTo({
      top: Math.max(element.offsetTop - stickyOffset - 16, 0),
      behavior: "smooth",
    });
  }, []);

  const shellFileActions = useMemo(
    () => ({
      onAddSection: () => openComposerAndReveal(),
      onSectionSelect: handleSectionSelect,
      onProposalSelect: handleProposalSelect,
    }),
    [handleSectionSelect, handleProposalSelect, openComposerAndReveal]
  );
  useCreedShellFileActions(shellFileActions);

  // Re-run the scroll tracker when the count of pending new-section
  // proposals changes so newly-mounted `[data-proposal-id]` previews
  // get picked up. Extracted from the deps array to satisfy ESLint's
  // "complex expression in dependency array" rule.
  const pendingNewSectionProposalCount = useMemo(
    () =>
      state.proposals.filter(
        (p) => p.status === "pending" && p.draft.kind === "new-section"
      ).length,
    [state.proposals]
  );

  useEffect(() => {
    const container = editorScrollRef.current;
    if (!container) return;

    // Track both real sections and pending new-section proposals so the
    // sidebar's "active row" highlight follows the user's scroll into a
    // proposal preview the same way it follows real section scrolls.
    const elements = Array.from(
      container.querySelectorAll<HTMLElement>("[data-section-id], [data-proposal-id]")
    );
    if (elements.length === 0) return;

    function targetIdOf(element: HTMLElement) {
      return element.dataset.sectionId ?? element.dataset.proposalId ?? null;
    }

    function update() {
      const stickyHeader = container?.querySelector<HTMLElement>("[data-file-sticky-header]");
      const offset = (stickyHeader?.getBoundingClientRect().height ?? 96) + 32;
      let bestId: string | null = null;
      let bestDistance = Infinity;

      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top - offset);
        if (rect.top - offset <= 0 && rect.bottom > offset) {
          if (distance < bestDistance) {
            bestDistance = distance;
            bestId = targetIdOf(element);
          }
        }
      }

      if (!bestId) {
        const firstVisible = elements.find((element) => {
          const rect = element.getBoundingClientRect();
          return rect.bottom > offset;
        });
        bestId = firstVisible ? targetIdOf(firstVisible) : null;
      }

      const lock = scrollLockRef.current;
      if (lock) {
        if (Date.now() > lock.until || bestId === lock.sectionId) {
          scrollLockRef.current = null;
        } else {
          return;
        }
      }

      setActiveShellSection(bestId);
    }

    update();
    container.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      container.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      setActiveShellSection(null);
    };
  }, [setActiveShellSection, state.sections.length, pendingNewSectionProposalCount]);

  const saveTimeLabel = state.syncLabel
    .replace(/^Last synced /, "")
    .replace(/^Saved /, "");

  useEffect(() => {
    if (state.sections.length === 0) {
      router.replace("/onboarding");
    }
  }, [router, state.sections.length]);

  useEffect(() => {
    if (!pullDialogOpen || !pullPreview) {
      setShowPullPreview(false);
      return;
    }

    setShowPullPreview(false);
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setShowPullPreview(true);
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) {
        cancelAnimationFrame(secondFrame);
      }
    };
  }, [pullDialogOpen, pullPreview, pullPreviewRenderKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const rawIntent = window.sessionStorage.getItem(FILE_NAV_INTENT_KEY);
    if (!rawIntent) {
      return;
    }

    let cancelled = false;
    let frameId = 0;
    let timeoutId = 0;

    timeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      try {
        const intent = JSON.parse(rawIntent) as
          | { type: "section"; sectionId: string }
          | { type: "compose" }
          | { type: "proposal"; proposalId: string };

        if (intent.type === "compose") {
          const scrolled = scrollComposerIntoView("smooth");
          const openDelay = scrolled ? 280 : 0;
          const openTimeoutId = window.setTimeout(() => {
            if (!cancelled) {
              openComposer();
              window.setTimeout(() => {
                if (!cancelled) {
                  scrollComposerIntoView("smooth");
                }
              }, 60);
            }
            window.sessionStorage.removeItem(FILE_NAV_INTENT_KEY);
          }, openDelay);

          if (cancelled) {
            window.clearTimeout(openTimeoutId);
          }
          return;
        }

        let attempts = 0;

        const tryScroll = () => {
          if (cancelled) {
            return;
          }

          const container = editorScrollRef.current;
          const selector =
            intent.type === "proposal"
              ? `[data-proposal-id="${intent.proposalId}"]`
              : `[data-section-id="${intent.sectionId}"]`;
          const element = container?.querySelector<HTMLElement>(selector);

          if (container && element) {
            if (intent.type === "proposal") {
              handleProposalSelect(intent.proposalId);
            } else {
              handleSectionSelect(intent.sectionId);
            }
            window.sessionStorage.removeItem(FILE_NAV_INTENT_KEY);
            return;
          }

          attempts += 1;
          if (attempts < 24) {
            frameId = window.requestAnimationFrame(tryScroll);
          }
        };

        frameId = window.requestAnimationFrame(tryScroll);
      } catch {
        return;
      }
    }, 140);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(frameId);
    };
  }, [handleSectionSelect, handleProposalSelect, openComposer, scrollComposerIntoView]);

  return (
    <>
      <div className="relative flex h-full min-h-0 bg-[var(--creed-surface)] transition-colors duration-200">
        <div className="min-w-0 flex-1">
          <div ref={editorScrollRef} className="h-full overflow-y-auto overscroll-contain creed-scrollbar">
            <div className="mx-auto max-w-[920px] px-4 py-6 pb-28 md:px-12 md:py-10 md:pb-10 xl:px-16">
              <div
                data-file-sticky-header
                className="sticky top-0 z-20 mb-8 -mx-4 bg-[color:var(--creed-surface)]/95 px-4 pb-5 pt-2 backdrop-blur-sm md:-mx-12 md:mb-12 md:px-12 md:pb-7 xl:-mx-16 xl:px-16"
              >
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="font-heading text-[1.22rem] font-medium tracking-[-0.03em] text-[var(--creed-text-primary)] md:text-[1.45rem]">
                      {state.user.name} / Creed
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[13px] text-[var(--creed-text-secondary)]">
                      <Clock3 className="h-3.5 w-3.5" />
                      Last saved {saveTimeLabel}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start">
                    <div className="inline-flex h-7 items-center gap-1">
                      <AnimatePresence initial={false}>
                        {fullQualityDirty || qualityCanRunInitialAnalysis ? (
                          <motion.div
                            key="refresh-full-quality"
                            initial={{ opacity: 0, scale: 0.88, width: 0 }}
                            animate={{ opacity: 1, scale: 1, width: 28 }}
                            exit={{ opacity: 0, scale: 0.88, width: 0 }}
                            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                          >
                            <QualityRefreshButton
                              title="Refresh full analysis"
                              loading={qualityLoading}
                              onClick={() => void refreshFullQuality()}
                            />
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                      <OverallQualityPopover
                        report={qualityReport}
                        loading={qualityLoading}
                        notice={qualityNotice}
                        canRefresh={qualityEnabled && state.sections.length > 0}
                        onRefresh={() => void refreshFullQuality()}
                      >
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--creed-text-primary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] data-[state=open]:bg-[var(--creed-surface-raised)]"
                          aria-label="Show Creed quality"
                        >
                          <QualityRing
                            score={qualityReport?.overall.score ?? 0}
                            color="#2563EB"
                            loading={qualityLoading}
                          />
                        </button>
                      </OverallQualityPopover>
                    </div>
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".md,.markdown,text/markdown,text/plain"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) {
                          return;
                        }

                        void handleImportFile(file);
                      }}
                    />
                    <div
                      className="flex items-center"
                      title={
                        githubConfigured
                          ? undefined
                          : "Connect GitHub and choose a repo in Settings first."
                      }
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        style={{ borderTopLeftRadius: 13, borderBottomLeftRadius: 13, borderTopRightRadius: 0, borderBottomRightRadius: 0, height: 32, minHeight: 32 }}
                        className={cn(
                          // Neutral outline pill — this button only OPENS the
                          // push/pull dialog. The brand-blue CTA lives on the
                          // dialog's final confirm button (Push Creed / Import
                          // remote Creed), so we keep the trigger here calm to
                          // avoid two competing CTAs on screen.
                          "border-r-0 border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[12px] md:px-3.5 md:text-[13px]",
                          !githubConfigured && "text-[var(--creed-text-tertiary)]"
                        )}
                        onMouseEnter={versionIcon.start}
                        onMouseLeave={versionIcon.settle}
                        onClick={() => {
                          if (selectedVersionAction === "pull") {
                            if (!pullDisabled) {
                              void handleOpenPullReview();
                            }
                            return;
                          }

                          if (!pushDisabled) {
                            setPushMessage("Update Creed");
                            setPushDialogOpen(true);
                          }
                        }}
                        disabled={selectedVersionAction === "pull" ? pullDisabled : pushDisabled}
                      >
                        {selectedVersionAction === "pull" ? (
                          <CloudDownloadIcon ref={versionIcon.iconRef} size={14} className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
                        ) : (
                          <CloudUploadIcon ref={versionIcon.iconRef} size={14} className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
                        )}
                        {selectedVersionAction === "pull" ? "Pull" : "Push"}
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderTopRightRadius: 13, borderBottomRightRadius: 13, height: 32, width: 32, minHeight: 32, minWidth: 32 }}
                            className="border-[var(--creed-border)] bg-[var(--creed-surface)] data-[state=open]:bg-[var(--creed-surface-raised)]"
                            disabled={!githubConfigured}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="border-[var(--creed-border)] bg-[var(--creed-surface)]"
                        >
                          <AnimatedMenuIconItem
                            icon={CloudUploadIcon}
                            className="text-[13px]"
                            disabled={pushDisabled}
                            onSelect={(event) => {
                              event.preventDefault();
                              setSelectedVersionAction("push");
                              setPushMessage("Update Creed");
                              setPushDialogOpen(true);
                            }}
                          >
                            Push
                          </AnimatedMenuIconItem>
                          <AnimatedMenuIconItem
                            icon={CloudDownloadIcon}
                            className="text-[13px]"
                            disabled={pullDisabled}
                            onSelect={(event) => {
                              event.preventDefault();
                              setSelectedVersionAction("pull");
                              void handleOpenPullReview();
                            }}
                          >
                            Pull
                          </AnimatedMenuIconItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Desktop: labelled pill. Mobile: icon-only circle that
                        matches the Lock button next to it. */}
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Activity"
                      style={{ borderRadius: 13, height: 32, width: 32, minHeight: 32, minWidth: 32 }}
                      className={cn(
                        "border-[var(--creed-border)] bg-[var(--creed-surface)] md:hidden",
                        activityOpen && "bg-[var(--creed-surface-raised)]"
                      )}
                      onMouseEnter={activityIcon.start}
                      onMouseLeave={activityIcon.settle}
                      onClick={() => {
                        setActivityOpen((current) => !current);
                      }}
                    >
                      <HistoryIcon
                        ref={activityIcon.iconRef}
                        size={14}
                        className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none"
                      />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      style={{ borderRadius: 13, height: 32, minHeight: 32 }}
                      className={cn(
                        "hidden border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[12px] md:inline-flex md:px-3.5 md:text-[13px]",
                        activityOpen && "bg-[var(--creed-surface-raised)]"
                      )}
                      onMouseEnter={activityIcon.start}
                      onMouseLeave={activityIcon.settle}
                      onClick={() => {
                        setActivityOpen((current) => !current);
                      }}
                    >
                      <HistoryIcon
                        ref={activityIcon.iconRef}
                        size={14}
                        className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none"
                      />
                      Activity
                    </Button>

                    <HeaderLockButton locked={state.locked} onToggle={toggleLock} />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          style={{ borderRadius: 13, height: 32, width: 32, minHeight: 32, minWidth: 32 }}
                          className="border-[var(--creed-border)] bg-[var(--creed-surface)] data-[state=open]:bg-[var(--creed-surface-raised)]"
                        >
                          <Ellipsis className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="border-[var(--creed-border)] bg-[var(--creed-surface)]"
                      >
                        <AnimatedMenuIconItem
                          icon={FolderUpIcon}
                          showIcon={!importBusy && copiedAction !== "import"}
                          className="text-[13px]"
                          disabled={importBusy}
                          onSelect={(event) => {
                            event.preventDefault();
                            importInputRef.current?.click();
                          }}
                        >
                          {importBusy ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : copiedAction === "import" ? (
                            <AnimatedCheckmark />
                          ) : null}
                          {importBusy
                            ? "Importing"
                            : copiedAction === "import"
                              ? "Imported"
                              : "Import"}
                        </AnimatedMenuIconItem>
                        <AnimatedMenuIconItem
                          icon={CopyIcon}
                          showIcon={copiedAction !== "copy"}
                          className="min-w-[82px] text-[13px]"
                          onSelect={(event) => {
                            event.preventDefault();
                            void copyValue("copy", exportMarkdown());
                          }}
                        >
                          {copiedAction === "copy" ? (
                            <AnimatedCheckmark />
                          ) : null}
                          {copiedAction === "copy" ? "Copied" : "Copy"}
                        </AnimatedMenuIconItem>
                        <AnimatedMenuIconItem
                          icon={DownloadIcon}
                          showIcon={copiedAction !== "download"}
                          className="text-[13px]"
                          onSelect={(event) => {
                            event.preventDefault();
                            downloadFile(
                              "creed.md",
                              exportMarkdown(),
                              "text/markdown;charset=utf-8"
                            );
                          }}
                        >
                          {copiedAction === "download" ? (
                            <AnimatedCheckmark />
                          ) : null}
                          {copiedAction === "download" ? "Downloaded" : "Download"}
                        </AnimatedMenuIconItem>
                        <DropdownMenuSeparator />
                        <AnimatedMenuIconItem
                          variant="destructive"
                          icon={DeleteIcon}
                          className="text-[13px]"
                          onSelect={(event) => {
                            event.preventDefault();
                            setDeleteFileOpen(true);
                          }}
                        >
                          Delete
                        </AnimatedMenuIconItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Review pill lives inside the sticky header block so both
                    pin to the top of the scroll viewport together. Visually
                    distinct via its own card chrome and a top margin — but
                    structurally they share the same sticky context, which
                    means the pill always rides directly under the header
                    while the user scrolls through the file. */}
                {normalizedPendingProposals.length > 0 ? (
                  <div className="mt-5 flex justify-start">
                    <ReviewPill
                      proposals={normalizedPendingProposals.map((proposal) => {
                        const target = state.sections.find((s) => s.id === proposal.sectionId);
                        return {
                          proposal,
                          existingContent: target?.content ?? "",
                          sectionName: target?.name ?? proposal.sectionName,
                        };
                      })}
                      onAcceptAll={() => {
                        // Single-commit batch accept — bypasses the
                        // per-proposal server-state fetch that was
                        // re-introducing already-accepted proposals.
                        acceptProposals(
                          normalizedPendingProposals.map((p) => p.id)
                        );
                      }}
                      onRejectAll={() => {
                        normalizedPendingProposals.forEach((p) => rejectProposal(p.id));
                      }}
                      onAcceptOne={(id) => {
                        void acceptProposal(id);
                      }}
                      onRejectOne={(id) => {
                        rejectProposal(id);
                      }}
                      onJumpToProposal={(proposal) => {
                        const targetId =
                          proposal.draft.kind === "new-section" ? null : proposal.sectionId;
                        if (!targetId) return;
                        const el = document.querySelector<HTMLElement>(
                          `[data-section-id="${targetId}"]`
                        );
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    />
                  </div>
                ) : null}
              </div>

              <Reorder.Group
                axis="y"
                values={state.sections.map((section) => section.id)}
                onReorder={reorderSections}
                className="space-y-10 md:space-y-16"
              >
                {state.sections.map((section) => {
                  const quality = sectionQualityById.get(section.id);
                  const analyzedFingerprint = analyzedSectionFingerprints[section.id];
                  const currentFingerprint = sectionFingerprintById.get(section.id);

                  const isOverridden = state.sectionLockOverrides.includes(section.id);
                  const sectionLocked = isOverridden ? !state.locked : state.locked;
                  return (
                    <SectionCard
                      key={section.id}
                      section={section}
                      locked={sectionLocked}
                      globalLocked={state.locked}
                      onToggleLock={() => toggleSectionLock(section.id)}
                      quality={quality}
                      qualityLoading={qualitySectionLoading === section.id}
                      qualityDirty={
                        qualityEnabled &&
                        Boolean(quality) &&
                        (!analyzedFingerprint || analyzedFingerprint !== currentFingerprint)
                      }
                      onRefreshQuality={() => void refreshSectionQuality(section)}
                      proposals={normalizedPendingProposals.filter((item) => item.sectionId === section.id)}
                      onAcceptProposal={(id) => {
                        void acceptProposal(id);
                      }}
                      onRejectProposal={(id) => {
                        rejectProposal(id);
                      }}
                      onChangeRichText={(content) => {
                        updateRichTextSection(section.id, content);
                      }}
                      onRename={() =>
                        setRenameSectionState({
                          id: section.id,
                          name: section.name,
                        })
                      }
                      onDuplicate={() => duplicateSection(section.id)}
                      onSetAccent={(accent) => setSectionAccent(section.id, accent)}
                      onDelete={() =>
                        setDeleteSectionState({
                          id: section.id,
                          name: section.name,
                        })
                      }
                      onAddSectionAfter={() => openComposerAndReveal(section.id)}
                    />
                  );
                })}
              </Reorder.Group>

              {normalizedPendingProposals.filter((p) => p.draft.kind === "new-section").length > 0 ? (
                <div className="mt-10 space-y-3 md:mt-16">
                  {normalizedPendingProposals
                    .filter((p) => p.draft.kind === "new-section")
                    .map((p) => (
                      <div key={p.id} data-proposal-id={p.id}>
                        <InlineNewSectionProposal
                          proposal={p}
                          agentName={p.agentName}
                          onAccept={() => {
                            void acceptProposal(p.id);
                          }}
                          onReject={() => {
                            rejectProposal(p.id);
                          }}
                        />
                      </div>
                    ))}
                </div>
              ) : null}

              <div ref={composerAreaRef} className="mt-10 md:mt-16">
                {composerOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4 sm:p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-[var(--creed-text-primary)]">
                          New section
                        </div>
                        <div className="mt-0.5 hidden text-[12px] text-[var(--creed-text-secondary)] sm:block">
                          Pick a starter or name your own.
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-md"
                        onClick={() => setComposerOpen(false)}
                        aria-label="Close composer"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <Input
                      ref={inputRef}
                      value={composerName}
                      onChange={(event) => setComposerName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          submitComposer();
                        }
                      }}
                      placeholder="Section name..."
                      className="mt-4 h-10 rounded-md border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[14px]"
                    />

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {sectionSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.name}
                          type="button"
                          onClick={() => {
                            setComposerName(suggestion.name);
                            setComposerStarter(suggestion.starter);
                            if (!insertAfterId) {
                              addSection(suggestion.name, suggestion.starter);
                            } else {
                              addSectionAfter(insertAfterId, suggestion.name, suggestion.starter);
                            }
                            setComposerOpen(false);
                            setInsertAfterId(null);
                          }}
                          className="rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface)] px-2.5 py-1 text-[12px] font-medium text-[var(--creed-text-secondary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                        >
                          {suggestion.name}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2">
                      <Button
                        variant="ghost"
                        className="rounded-md text-[var(--creed-text-secondary)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                        onClick={() => setComposerOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={submitComposer}
                        className="rounded-md bg-[var(--creed-text-primary)] px-4 text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]"
                      >
                        Create
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openComposerAndReveal()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--creed-border-strong)] bg-[var(--creed-surface)] px-4 py-3.5 text-[13px] font-medium text-[var(--creed-text-secondary)] transition-colors duration-150 hover:border-[var(--creed-text-secondary)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add section
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <ActivityRail
          activity={state.activity}
          proposals={state.proposals}
          sections={state.sections}
          open={activityOpen}
          onClose={() => setActivityOpen(false)}
        />

      </div>

      <Dialog open={pushDialogOpen} onOpenChange={setPushDialogOpen}>
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>Push Creed</DialogTitle>
            <DialogDescription>
              This will save your current Creed as{" "}
              <span className="font-mono text-[13px]">creed.md</span> to GitHub.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-background)] px-4 py-4 text-[14px] leading-7 text-[var(--creed-text-secondary)]">
              Repo:{" "}
              <span className="font-medium text-[var(--creed-text-primary)]">
                {state.settings.versionControl.repoOwner && state.settings.versionControl.repoName
                  ? `${state.settings.versionControl.repoOwner}/${state.settings.versionControl.repoName}`
                  : "Not configured"}
              </span>
              {" · "}
              Branch:{" "}
              <span className="font-medium text-[var(--creed-text-primary)]">
                {state.settings.versionControl.branch || "Not configured"}
              </span>
            </div>
            <div>
              <label className="mb-2 block text-[12px] font-medium text-[var(--creed-text-secondary)]">
                Commit message
              </label>
              <Input
                value={pushMessage}
                onChange={(event) => setPushMessage(event.target.value)}
                className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[14px]"
              />
            </div>
          </div>
          <DialogFooter className="justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button variant="ghost" className="rounded-md" onClick={() => setPushDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[var(--creed-accent)] text-white transition-colors hover:bg-[var(--creed-accent-hover)]"
              onClick={() => void handlePushCreed()}
              disabled={pushBusy || !githubConfigured}
            >
              {pushBusy ? "Pushing" : "Push Creed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pullDialogOpen} onOpenChange={setPullDialogOpen}>
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>Pull from GitHub</DialogTitle>
            <DialogDescription>
              Review the remote <span className="font-mono text-[13px]">creed.md</span> before it replaces your local file.
            </DialogDescription>
          </DialogHeader>
          {pullBusy && !pullPreview ? (
            <div className="py-6 text-[14px] text-[var(--creed-text-secondary)]">
              Loading GitHub preview...
            </div>
          ) : pullPreview ? (
            <div className="space-y-4">
              {pullPreview.warnings.length > 0 ? (
                <div className="rounded-[var(--radius-lg)] border border-[#FDE68A] bg-[#FFFBEB] px-4 py-4 text-[14px] leading-7 text-[#92400E] dark:border-[#fbbf24]/40 dark:bg-[#451a03]/40 dark:text-[#fbbf24]">
                  {pullPreview.warnings.join(" ")}
                </div>
              ) : null}

              <AnimatePresence mode="wait" initial={false}>
                {showPullPreview ? (
                  <motion.div
                    key={pullPreviewRenderKey}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                    className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-surface)]"
                  >
                    <div className="border-b border-[var(--creed-border)] px-4 py-3 text-[13px] font-medium text-[var(--creed-text-secondary)]">
                      Sections that will be created or updated
                    </div>
                    <div className="max-h-[280px] overflow-y-auto px-4 py-3">
                      <motion.div
                        className="space-y-2"
                        initial="hidden"
                        animate="visible"
                        variants={{
                          hidden: {},
                          visible: {
                            transition: {
                              staggerChildren: 0.08,
                              delayChildren: 0.16,
                            },
                          },
                        }}
                      >
                        {pullPreview.summary.map((section) => {
                          const accent = resolveSectionAccent(section, state.sections);

                          return (
                            <motion.div
                              key={section.id}
                              className="flex items-center justify-between rounded-xl px-3.5 py-2"
                              variants={{
                                hidden: { opacity: 0, y: 10 },
                                visible: {
                                  opacity: 1,
                                  y: 0,
                                  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
                                },
                              }}
                              style={{
                                // No border — read as a tinted tag pill, not a
                                // bordered card. Same accent-tinted background
                                // the rest of the section UI uses.
                                backgroundColor: accentTintMap[accent],
                              }}
                            >
                              <div
                                className="text-[14px] font-medium"
                                style={{ color: accentColorMap[accent] }}
                              >
                                {section.name}
                              </div>
                              <div
                                className="text-[12px]"
                                style={{ color: accentColorMap[accent] }}
                              >
                                {section.kind}
                              </div>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}
          <DialogFooter className="justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button variant="ghost" className="rounded-md" onClick={() => setPullDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[var(--creed-accent)] text-white transition-colors hover:bg-[var(--creed-accent-hover)]"
              onClick={() => void handleApplyPull()}
              disabled={pullBusy || !pullPreview}
            >
              {pullBusy ? "Importing" : "Import remote Creed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renameSectionState)}
        onOpenChange={(open) => !open && setRenameSectionState(null)}
      >
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>Rename section</DialogTitle>
            <DialogDescription>
              Update the section title without changing its content.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameSectionState?.name ?? ""}
            onChange={(event) =>
              setRenameSectionState((current) =>
                current ? { ...current, name: event.target.value } : current
              )
            }
            className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[15px]"
            onKeyDown={(event) => {
              if (event.key === "Enter" && renameSectionState?.name.trim()) {
                renameSection(renameSectionState.id, renameSectionState.name);
                setRenameSectionState(null);
              }
            }}
          />
          <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button variant="ghost" className="rounded-md" onClick={() => setRenameSectionState(null)}>
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[var(--creed-accent)] text-white transition-colors hover:bg-[var(--creed-accent-hover)]"
              onClick={() => {
                if (!renameSectionState?.name.trim()) {
                  return;
                }
                renameSection(renameSectionState.id, renameSectionState.name);
                setRenameSectionState(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteSectionState)}
        onOpenChange={(open) => !open && setDeleteSectionState(null)}
      >
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>Delete section</DialogTitle>
            <DialogDescription>
              Remove {deleteSectionState?.name ?? "this section"} from the file.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button variant="ghost" className="rounded-md" onClick={() => setDeleteSectionState(null)}>
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[#DC2626] text-white hover:bg-[#B91C1C]"
              onClick={() => {
                if (!deleteSectionState) {
                  return;
                }
                deleteSection(deleteSectionState.id);
                setDeleteSectionState(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteFileOpen} onOpenChange={setDeleteFileOpen}>
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-[18px] font-medium">
              <AlertTriangle className="h-5 w-5 text-[#B91C1C]" />
              Delete Creed file
            </DialogTitle>
            <DialogDescription>
              Wipes every section, proposal, and activity entry. Your account stays. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button variant="ghost" className="rounded-md" onClick={() => setDeleteFileOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[#DC2626] text-white hover:bg-[#B91C1C]"
              onClick={() => {
                clearSections();
                setDeleteFileOpen(false);
              }}
            >
              Delete file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SectionCard({
  section,
  locked,
  globalLocked,
  onToggleLock,
  quality,
  qualityLoading,
  qualityDirty,
  onRefreshQuality,
  proposals,
  onAcceptProposal,
  onRejectProposal,
  onChangeRichText,
  onRename,
  onSetAccent,
  onDuplicate,
  onDelete,
  onAddSectionAfter,
}: {
  section: CreedSection;
  locked: boolean;
  globalLocked: boolean;
  onToggleLock: () => void;
  quality?: CreedQualityReport["sections"][number];
  qualityLoading?: boolean;
  qualityDirty?: boolean;
  onRefreshQuality: () => void;
  proposals: Proposal[];
  onAcceptProposal: (proposalId: string) => void;
  onRejectProposal: (proposalId: string) => void;
  onChangeRichText: (content: string) => void;
  onRename: () => void;
  onSetAccent: (accent: AccentKey) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddSectionAfter: () => void;
}) {
  const dragControls = useDragControls();
  const accent = accentColorMap[section.accent];
  // Ref so the Colour sub-trigger row can drive the stamp animation when
  // the row itself is hovered (not just the icon's own hit-target).
  const stampIconRef = useRef<StampIconHandle | null>(null);

  return (
    <Reorder.Item
      value={section.id}
      dragListener={false}
      dragControls={dragControls}
      data-section-id={section.id}
      id={section.id}
      className="scroll-mt-24"
    >
      <section className="group relative">
        <button
          type="button"
          onPointerDown={(event) => dragControls.start(event)}
          className="group/drag absolute -left-7 top-1 hidden rounded-full p-1 text-[var(--creed-text-secondary)] transition-colors duration-150 hover:text-[var(--creed-text-primary)] xl:flex"
        >
          <GripVerticalIcon className="h-4 w-4" size={16} />
        </button>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span
                className="inline-block h-9 w-[3px] rounded-full"
                style={{ backgroundColor: accent }}
              />
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <span
                  className="text-[15px] font-medium leading-none md:text-[16px]"
                  style={{ color: accent }}
                >
                  {section.name}
                </span>
                <SectionQualityPopover quality={quality} color={accent} loading={qualityLoading} />
                <AnimatePresence initial={false}>
                  {qualityDirty ? (
                    <motion.div
                      key={`${section.id}-quality-refresh`}
                      initial={{ opacity: 0, scale: 0.88, width: 0 }}
                      animate={{ opacity: 1, scale: 1, width: 28 }}
                      exit={{ opacity: 0, scale: 0.88, width: 0 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <QualityRefreshButton
                        title={`Refresh ${section.name} score`}
                        loading={qualityLoading}
                        onClick={onRefreshQuality}
                      />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                {/* Per-section lock controls only exist while the master
                    lock is on — the header is the authority. Smoothly
                    expand/collapse so the chrome doesn't jump when the user
                    toggles the master. */}
                <AnimatePresence initial={false}>
                  {globalLocked ? (
                    <motion.div
                      key={`${section.id}-section-lock`}
                      initial={{ opacity: 0, scale: 0.88, width: 0 }}
                      animate={{ opacity: 1, scale: 1, width: 28 }}
                      exit={{ opacity: 0, scale: 0.88, width: 0 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <SectionLockButton
                        locked={locked}
                        title={locked ? `Unlock ${section.name}` : `Lock ${section.name}`}
                        onToggle={onToggleLock}
                      />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-[var(--creed-text-secondary)] transition-colors duration-150 hover:text-[var(--creed-text-primary)] data-[state=open]:text-[var(--creed-text-primary)]"
              >
                <Ellipsis className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-[var(--creed-border)] bg-[var(--creed-surface)]">
              <AnimatedMenuIconItem
                icon={SquarePenIcon}
                className="text-[13px]"
                onSelect={onRename}
              >
                Rename
              </AnimatedMenuIconItem>
              {/*
                Colour sub-menu. Hover-driven on desktop via Radix's default
                Sub behaviour, with a custom chevron that flips < → > on
                hover/open so the affordance matches the profile-menu
                Feedback row. The default trailing chevron is hidden.
              */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger
                  onMouseEnter={() => stampIconRef.current?.startAnimation()}
                  onMouseLeave={() => stampIconRef.current?.stopAnimation()}
                  className="group/colour rounded-[var(--radius-md)] gap-1.5 px-2.5 py-2 text-[13px] [&>svg:last-of-type]:hidden"
                >
                  <StampIcon
                    ref={stampIconRef}
                    size={14}
                    className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none"
                  />
                  <span className="flex-1 text-left">Colour</span>
                  <ChevronLeft
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      "group-hover/colour:rotate-180 group-data-[state=open]/colour:rotate-180"
                    )}
                  />
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent
                    // Matches the gap the profile dropdown uses from its
                    // trigger button (see feedback-menu.tsx). Bridging
                    // pseudo widens to cover the 14px gap so cursor travel
                    // between trigger row and picker doesn't dismiss it.
                    sideOffset={14}
                    alignOffset={0}
                    className="relative w-auto border-[var(--creed-border)] bg-[var(--creed-surface)] p-2 before:pointer-events-auto before:absolute before:-left-4 before:top-0 before:bottom-0 before:w-4 before:content-['']"
                  >
                    <div className="grid grid-cols-4 gap-1.5">
                      {VISIBLE_ACCENT_KEYS.map((accentKey) => {
                        const selected =
                          section.accent === accentKey ||
                          // The legacy `custom` storage value renders as mono
                          // in the palette, so a section saved as "custom"
                          // should highlight the mono cell.
                          (accentKey === "mono" && section.accent === "custom");
                        return (
                          <button
                            key={accentKey}
                            type="button"
                            aria-label={accentLabelMap[accentKey]}
                            onClick={() => onSetAccent(accentKey)}
                            className={cn(
                              "flex aspect-square h-7 w-7 items-center justify-center rounded-md border bg-[var(--creed-surface)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)]",
                              !selected && "border-[var(--creed-border)]"
                            )}
                            style={
                              selected
                                ? {
                                    borderColor: accentColorMap[accentKey],
                                    backgroundColor: accentTintMap[accentKey],
                                  }
                                : undefined
                            }
                          >
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: accentColorMap[accentKey] }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <AnimatedMenuIconItem
                icon={FileStackIcon}
                className="text-[13px]"
                onSelect={onDuplicate}
              >
                Duplicate
              </AnimatedMenuIconItem>
              <DropdownMenuSeparator />
              {/*
                Delete row — styled red to match the rejected proposal pill
                background. variant="destructive" tells the base
                DropdownMenuItem CSS to set the icon + text + hover-fill to
                the destructive palette automatically; we override the
                hover background to use the exact rejected-tag tones so the
                visual language stays consistent across the app.
              */}
              <AnimatedMenuIconItem
                icon={DeleteIcon}
                variant="destructive"
                // Subtle red wash on hover — kept light so the menu reads
                // calm. In dark mode the tint is just a 16% red over the
                // surface; the destructive base styles handle text colour.
                className="text-[13px] focus:bg-[#FEF2F2] dark:focus:bg-[rgba(248,113,113,0.10)]"
                onSelect={onDelete}
              >
                Delete
              </AnimatedMenuIconItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {proposals.length > 0 ? (
          <div className="mb-4 space-y-3">
            {proposals.map((p) => {
              const kind = p.draft.kind;
              if (
                kind === "delete-section" ||
                kind === "rename-section" ||
                kind === "recolor-section"
              ) {
                return (
                  <InlineMetaProposal
                    key={p.id}
                    proposal={p}
                    existingName={section.name}
                    existingAccent={accentColorMap[section.accent]}
                    agentName={p.agentName}
                    onAccept={() => onAcceptProposal(p.id)}
                    onReject={() => onRejectProposal(p.id)}
                  />
                );
              }
              return (
                <InlineProposalDiff
                  key={p.id}
                  proposal={p}
                  existingContent={section.content}
                  agentName={p.agentName}
                  onAccept={() => onAcceptProposal(p.id)}
                  onReject={() => onRejectProposal(p.id)}
                />
              );
            })}
          </div>
        ) : null}

        <div>
          <RichTextEditor
            sectionId={section.id}
            content={section.content}
            readOnly={locked}
            accentColor={accentColorMap[section.accent]}
            onChange={onChangeRichText}
            onAddSectionAfter={onAddSectionAfter}
          />
        </div>
      </section>
    </Reorder.Item>
  );
}

// Animated Lock / LockOpen button shared by the header (master) and per-section.
// The lucide-animated icons fire `startAnimation()` on demand — the button
// triggers the animation on click, *not* hover, so the user sees the latch
// move in response to the new state. Same chrome as `QualityRefreshButton`.
function AnimatedLockButton({
  locked,
  title,
  onToggle,
  size = "sm",
}: {
  locked: boolean;
  title: string;
  onToggle: () => void;
  size?: "sm" | "header";
}) {
  const lockRef = useRef<LockIconHandle | null>(null);
  const openRef = useRef<LockOpenIconHandle | null>(null);
  const dimensions = size === "header"
    ? "h-8 w-8"
    : "h-7 w-7";
  const iconSize = size === "header" ? 14 : 16;

  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      aria-pressed={locked}
      onClick={() => {
        // Play the *target* state's icon animation so the click reads as
        // "this is what just happened". After the toggle the matching ref
        // will be the rendered one in the next frame.
        const next = !locked;
        onToggle();
        // Defer to next tick so the new icon has mounted before we trigger.
        window.requestAnimationFrame(() => {
          if (next) {
            lockRef.current?.startAnimation();
          } else {
            openRef.current?.startAnimation();
          }
        });
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-[var(--creed-text-secondary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]",
        dimensions
      )}
    >
      {locked ? (
        <LockIcon ref={lockRef} size={iconSize} className="h-4 w-4" />
      ) : (
        <LockOpenIcon ref={openRef} size={iconSize} className="h-4 w-4" />
      )}
    </button>
  );
}

function HeaderLockButton({ locked, onToggle }: { locked: boolean; onToggle: () => void }) {
  // Two-button pattern, identical to the Activity button:
  // mobile renders an icon-only `size="icon-sm"` circle, desktop renders a
  // labelled `size="sm"` pill with the SAME className the Activity pill uses.
  const mobileLockRef = useRef<LockIconHandle | null>(null);
  const mobileOpenRef = useRef<LockOpenIconHandle | null>(null);
  const desktopLockRef = useRef<LockIconHandle | null>(null);
  const desktopOpenRef = useRef<LockOpenIconHandle | null>(null);
  const title = locked ? "Locked" : "Unlocked";

  function trigger(refs: {
    lock: typeof mobileLockRef;
    open: typeof mobileOpenRef;
  }) {
    const next = !locked;
    onToggle();
    window.requestAnimationFrame(() => {
      if (next) refs.lock.current?.startAnimation();
      else refs.open.current?.startAnimation();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={title}
        aria-pressed={locked}
        style={{ borderRadius: 13, height: 32, width: 32, minHeight: 32, minWidth: 32 }}
        className={cn(
          "border-[var(--creed-border)] bg-[var(--creed-surface)] md:hidden",
          locked && "bg-[var(--creed-surface-raised)]"
        )}
        onClick={() => trigger({ lock: mobileLockRef, open: mobileOpenRef })}
      >
        {locked ? (
          <LockIcon
            ref={mobileLockRef}
            size={14}
            className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none"
          />
        ) : (
          <LockOpenIcon
            ref={mobileOpenRef}
            size={14}
            className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none"
          />
        )}
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-pressed={locked}
        style={{ borderRadius: 13, height: 32, minHeight: 32 }}
        className="hidden border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[12px] md:inline-flex md:px-3.5 md:text-[13px]"
        onClick={() => trigger({ lock: desktopLockRef, open: desktopOpenRef })}
      >
        {locked ? (
          <LockIcon
            ref={desktopLockRef}
            size={14}
            className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none"
          />
        ) : (
          <LockOpenIcon
            ref={desktopOpenRef}
            size={14}
            className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none"
          />
        )}
        {title}
      </Button>
    </>
  );
}

function SectionLockButton({
  locked,
  title,
  onToggle,
}: {
  locked: boolean;
  title: string;
  onToggle: () => void;
}) {
  return <AnimatedLockButton locked={locked} onToggle={onToggle} title={title} size="sm" />;
}

function ActivityRail({
  activity,
  proposals,
  sections,
  open,
  onClose,
}: {
  activity: ActivityEntry[];
  proposals: Proposal[];
  sections: CreedSection[];
  open: boolean;
  onClose: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | ActivityStatus>("all");
  const [visibleCount, setVisibleCount] = useState(50);

  const livePendingProposalIds = useMemo(
    () => new Set(proposals.filter((proposal) => proposal.status === "pending").map((proposal) => proposal.id)),
    [proposals]
  );

  const filteredAll = useMemo(
    () =>
      activity.filter((entry) => {
        if (entry.status === "pending" && (!entry.proposalId || !livePendingProposalIds.has(entry.proposalId))) {
          return false;
        }

        if (statusFilter !== "all" && entry.status !== statusFilter) {
          return false;
        }

        return true;
      }),
    [activity, livePendingProposalIds, statusFilter]
  );

  useEffect(() => {
    setVisibleCount(50);
  }, [statusFilter]);

  const filtered = useMemo(
    () => filteredAll.slice(0, visibleCount),
    [filteredAll, visibleCount]
  );
  const hasMore = filteredAll.length > visibleCount;

  const grouped = filtered.reduce<Record<string, ActivityEntry[]>>((accumulator, entry) => {
    const dayLabel = formatDayLabel(entry.createdAt, entry.dayLabel);

    if (!accumulator[dayLabel]) {
      accumulator[dayLabel] = [];
    }

    accumulator[dayLabel].push(entry);
    return accumulator;
  }, {});

  return (
    <motion.aside
      initial={false}
      animate={{
        width: open ? 356 : 0,
        opacity: open ? 1 : 0,
        x: open ? 0 : 18,
      }}
      transition={{
        duration: 0.34,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        "absolute inset-y-0 right-0 z-30 h-full overflow-hidden border-l border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[-18px_0_50px_rgba(28,28,26,0.12)] lg:static lg:h-full lg:shrink-0 lg:shadow-none",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
      style={{
        maxWidth: "min(82vw, 356px)",
      }}
    >
      <div className="flex h-full w-full flex-col p-5 lg:w-[356px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">
              Activity
            </div>
            <div className="mt-1 text-[12px] text-[var(--creed-text-tertiary)]">
              Audit trail for governed collaboration.
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {activityStatuses.map((item) => (
            <ActivityFilterPill
              key={item.value}
              onClick={() => setStatusFilter(item.value)}
              active={statusFilter === item.value}
              tone={
                item.value === "accepted"
                  ? "green"
                  : item.value === "rejected"
                    ? "red"
                    : item.value === "direct"
                      ? "orange"
                      : item.value === "stale"
                        ? "purple"
                        : "blue"
              }
            >
              {item.label}
            </ActivityFilterPill>
          ))}
        </div>

        <ScrollArea className="mt-5 min-h-0 flex-1">
          {filtered.length ? (
            <div className="space-y-7 pr-4">
              {Object.entries(grouped).map(([dayLabel, entries]) => (
                <div key={dayLabel}>
                  <div className="mb-3 text-[12px] font-medium text-[var(--creed-text-tertiary)]">
                    {dayLabel}
                  </div>
                  <div className="space-y-3">
                    {entries.map((entry) => {
                      // For pending entries we mirror the inline accept-all
                      // card byte-for-byte: same existing content, same
                      // `getProposalPreviewText` result. Without this, the
                      // sidebar diff was off by 1–2 tokens because it used a
                      // stale snapshot stored at proposal-creation time.
                      const liveProposal = entry.proposalId
                        ? proposals.find((proposal) => proposal.id === entry.proposalId)
                        : undefined;
                      const liveSection = sections.find((section) => section.id === entry.sectionId);
                      const liveExistingContent =
                        entry.status === "pending" ? liveSection?.content : undefined;
                      const liveProposedText =
                        entry.status === "pending" && liveProposal
                          ? getProposalPreviewText(liveProposal.draft)
                          : undefined;
                      return (
                        <ActivityRow
                          key={entry.id}
                          entry={entry}
                          accent={liveSection?.accent ?? entry.accent}
                          liveExistingContent={liveExistingContent}
                          liveProposedText={liveProposedText}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
              {hasMore ? (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((current) => current + 50)}
                    className="w-full rounded-[12px] border border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 py-2 text-[13px] font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                  >
                    Load more · {filteredAll.length - visibleCount} remaining
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-[13px] text-[var(--creed-text-tertiary)]">
              <HistoryIcon size={20} className="opacity-60" />
              <span className="font-medium opacity-60">Nothing here yet</span>
            </div>
          )}
        </ScrollArea>
      </div>
    </motion.aside>
  );
}

function ActivityRow({
  entry,
  accent,
  liveExistingContent,
  liveProposedText,
}: {
  entry: ActivityEntry;
  accent: CreedSection["accent"];
  liveExistingContent?: string;
  liveProposedText?: string;
}) {
  const [open, setOpen] = useState(false);
  const agentNames = entry.actorType === "agent" ? uniqueAgentNames([entry.actor]) : [];

  // Reuse the in-app diff machinery so activity cards match the inline
  // proposal diff exactly — same word-level highlighting, same +N/−N stats.
  // For pending entries the parent feeds us the same live values the inline
  // card uses; for accepted/rejected/stale entries we fall back to the
  // snapshot stored on the entry.
  const beforeForDiff = liveExistingContent ?? entry.beforeText ?? "";
  const afterForDiff = liveProposedText ?? entry.afterText ?? "";
  const diffParts = useMemo(
    () => computeDiffParts(beforeForDiff, afterForDiff),
    [beforeForDiff, afterForDiff]
  );
  const diffStats = useMemo(() => summarizeDiff(diffParts), [diffParts]);
  const hasTextualChange = diffParts.some((part) => part.added || part.removed);
  // Activity entries from delete-section operations carry a "Keep X" →
  // "Delete X" before/after pair. The outer card stays neutral (full-card
  // red wash felt heavy); we tint only the expanded diff body red below
  // so the deletion reads clearly when the user opens it.
  const isDeletionActivity =
    entry.afterText.startsWith("Delete ") &&
    (entry.beforeText?.startsWith("Keep ") ?? false);

  return (
    <div className="rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-3 transition-colors duration-150 hover:bg-[var(--creed-background)]">
      <button
        type="button"
        className="group w-full text-left"
        onClick={() => setOpen((current) => !current)}
      >
        <div className="flex items-start gap-3">
          {entry.actorType === "agent" ? (
            <AgentIconStack
              agents={agentNames}
              variant="inline"
              className="ml-0.5 mt-[2px] shrink-0"
              itemClassName="h-4 w-4"
            />
          ) : (
            <span
              className="mt-1.5 h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: accentColorMap[accent] }}
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[13px] font-medium text-[var(--creed-text-primary)]">
                {entry.sectionName}
              </div>
              <span className={cn("rounded-[6px] px-2 py-0.5 text-[10px] font-medium", getProposalStatusStyles(entry.status))}>
                {activityStatusLabelMap[entry.status]}
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-[var(--creed-text-tertiary)] transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-[var(--creed-text-secondary)]",
                  open ? "rotate-0" : "-rotate-90"
                )}
              />
            </div>
            <div className="mt-1 flex items-center gap-2 text-[12px] text-[var(--creed-text-secondary)]">
              <span className="truncate">{entry.actor}</span>
              {isDeletionActivity ? (
                // A delete-section event is conceptually all-removed (one
                // entire section) — overriding the badge stats keeps the
                // signal honest even though the underlying "Keep X" →
                // "Delete X" diff would otherwise show a confusing
                // +1/−1 split.
                <span className="inline-flex items-center gap-1">
                  <span className="text-[var(--creed-text-tertiary)]">·</span>
                  <DiffBadge tone="added" count={0} />
                  <DiffBadge tone="removed" count={1} />
                </span>
              ) : hasTextualChange ? (
                <span className="inline-flex items-center gap-1">
                  <span className="text-[var(--creed-text-tertiary)]">·</span>
                  <DiffBadge tone="added" count={diffStats.added} />
                  <DiffBadge tone="removed" count={diffStats.removed} />
                </span>
              ) : null}
            </div>
          </div>
          <div className="text-[12px] text-[var(--creed-text-tertiary)]">
            {formatRelativeTime(entry.createdAt, entry.timeLabel)}
          </div>
        </div>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ marginTop: 0 }}
            animate={{ marginTop: 12 }}
            exit={{ marginTop: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="-mx-3 border-t border-[var(--creed-border)]" />
              <div className="creed-scrollbar creed-diff-block -mx-3 max-h-72 overflow-y-auto px-4 py-3">
                {isDeletionActivity ? (
                  // Render the Delete line as a removal — same red
                  // background + strikethrough as `creed-diff-remove` so
                  // the operation reads consistently with how removed
                  // content is shown in the diff body elsewhere.
                  <span className="creed-diff-remove">
                    Delete {entry.sectionName}
                  </span>
                ) : hasTextualChange ? (
                  diffParts.map((part, index) => {
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
                ) : (
                  // Fall back to the entry's summary so structural events
                  // (e.g. renames / recolors) still tell the user what
                  // happened even when the textual diff is empty.
                  <span className="text-[var(--creed-text-secondary)]">
                    {entry.summary || "No textual change"}
                  </span>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
