"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Link2,
  LoaderCircle,
  Unlink2,
} from "lucide-react";
import { DownloadIcon } from "@creed/ui/download";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@creed/ui/dropdown-menu";
import { Button } from "@creed/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@creed/ui/dialog";
import { Input } from "@creed/ui/input";
import { Separator } from "@creed/ui/separator";
import {
  consumeSettingsPanelIntent,
  SETTINGS_PANEL_INTENT_EVENT,
} from "@/lib/panel/settings-intent";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@creed/ui/chart";
import { StackTopBar } from "@/components/creed/rounded-bar";
import {
  SkeletonBar,
  SkeletonText,
} from "@/components/creed/loading-skeleton";
import { AnimatedIconButton } from "@/components/creed/animated-icon-action";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/creed/searchable-select";
import { useCreed } from "@/components/creed/creed-provider";
import { useCreedEdition } from "@/components/creed/edition-provider";
import {
  AddCreditsDialog,
  CreditsHistoryDialog,
  GRANT_MONTHLY_USD,
  SharedSettings,
} from "@creed/edition/ui";
import {
  clearSettingsCreditsCache,
  clearSettingsOpenRouterBalanceCache,
  clearSettingsRepoCache,
  clearSettingsUsageCache,
  hashSettingsMarkdown,
  loadSettingsAiSettings,
  loadSettingsBranches,
  loadSettingsCredits,
  loadSettingsOpenRouterBalance,
  loadSettingsRepos,
  loadSettingsUsage,
  loadSettingsVersionStatus,
  setCachedSettingsAiSettings,
  SETTINGS_CREDITS_CHANGED_EVENT,
  type AiMode,
  type AiUsageRange,
  type AiUsageSummary,
  type BranchOption,
  type CreditsState,
  type OpenRouterBalance,
  type PublicAiSettings,
  type RepoOption,
  type VersionControlStatus,
} from "@/components/creed/settings-preload";
import { AI_FEATURES, featureMeta } from "@/lib/ai/features";
import { creedMarkdownFilename } from "@/lib/creed-filename";
import {
  accentColorMap,
  type AgentPermission,
  type IntegrationConnectionStatus,
} from "@creed/core/creed-data";
import { cn } from "@creed/ui/utils";
import { RichTextEditor } from "@/components/creed/rich-text-editor";
import {
  EditableProfileAvatar,
  SettingsProfileLayout,
} from "@/components/creed/profile-avatar";
import { ArchivedSectionHeading } from "@/components/creed/archived-section-heading";
import {
  GLOBAL_PERMISSION_OPTIONS,
  SectionPermissionControl,
} from "@/components/creed/section-permission-control";

const GITHUB_AUTHORIZED_APPS_URL = "https://github.com/settings/connections/applications";

function looksLikeApiKey(value: string) {
  const trimmed = value.trim();
  return trimmed.length >= 20 && /^[A-Za-z0-9._-]+$/.test(trimmed);
}

function formatGitHubAccessError(message: string) {
  if (/GitHub is not connected/i.test(message)) {
    return "GitHub isn't connected";
  }

  if (/repo access is missing/i.test(message)) {
    return "GitHub access expired";
  }

  return message;
}

function formatGitHubAccessErrorForState(message: string, githubConnected: boolean) {
  if (githubConnected && /GitHub is not connected/i.test(message)) {
    return "GitHub access expired";
  }

  return formatGitHubAccessError(message);
}

// Settings follows the active Creed. Shared Creeds add membership, role, and
// permission controls while preserving the common Creed settings experience.
export function SettingsScreen({ active = true }: { active?: boolean }) {
  const { state } = useCreed();
  if (state.creedType === "shared") {
    return <SharedSettings />;
  }
  return <PersonalSettingsScreen active={active} />;
}

function PersonalSettingsScreen({ active }: { active: boolean }) {
  const router = useRouter();
  const hasManagedCredits = useCreedEdition().capabilities.managedCredits;
  const {
    state,
    setSectionPermission,
    setAllSectionPermissions,
    setVersionControlConfig,
    exportMarkdown,
    exportActivityJson,
    exportAllDataJson,
    refreshState,
    setProfileAvatar,
    switchCreed,
    restoreSection,
    deleteSection,
  } = useCreed();
  const activeCreed = state.creeds?.find((creed) => creed.id === state.creedId);
  const activeCreedName = activeCreed?.name ?? state.user.name;
  const [nameDraft, setNameDraft] = useState(activeCreedName);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [archivedDeleteTarget, setArchivedDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [expandedArchived, setExpandedArchived] = useState<string | null>(null);
  const archivedSections = state.sections.filter((section) => section.archived);
  const [permsOpen, setPermsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [connectingGitHub, setConnectingGitHub] = useState(false);
  const [disconnectingGitHub, setDisconnectingGitHub] = useState(false);
  const [githubDisconnectedOverride, setGithubDisconnectedOverride] =
    useState(false);
  const [reposLoading, setReposLoading] = useState(false);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [versionStatus, setVersionStatus] = useState<VersionControlStatus | null>(null);
  const [githubRefreshTick, setGitHubRefreshTick] = useState(0);
  const [aiSettings, setAiSettings] = useState<PublicAiSettings>({
    provider: "openrouter",
    keyStatus: "missing",
    aiMode: hasManagedCredits ? "credits" : "byok",
  });
  const [aiKeyDraft, setAiKeyDraft] = useState("");
  const [aiSaving, setAiSaving] = useState(false);
  // aiNotice was an inline error string under the API key field. Replaced
  // by toast notifications - see toast.error/.success calls in the handlers.
  const [usageRange, setUsageRange] = useState<AiUsageRange>("90d");
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  const [credits, setCredits] = useState<CreditsState | null>(null);
  const [openRouterBalance, setOpenRouterBalance] = useState<OpenRouterBalance | null>(null);
  const [addCreditsOpen, setAddCreditsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const canSaveAiKey = looksLikeApiKey(aiKeyDraft) && !aiSaving;

  // Credit balance = lasting top-ups for this Creed. Bonus credits = Cloud
  // $5/mo include, shown only on the Creed assigned to hold them.
  const grantedUsd = credits?.grantedUsd ?? 0;
  const purchasedUsd = credits?.purchasedUsd ?? 0;
  const allowanceResets = credits?.allowanceResets ?? false;
  const allowanceUsd =
    allowanceResets && credits?.allowanceUsd && credits.allowanceUsd > 0
      ? credits.allowanceUsd
      : allowanceResets
        ? GRANT_MONTHLY_USD
        : 0;
  const isCreditsHome = credits?.isCreditsHome ?? false;
  const bonusRemainingUsd = allowanceResets
    ? Math.min(Math.max(0, grantedUsd), allowanceUsd)
    : 0;

  // The global control reflects the shared level of all non-hidden sections,
  // or nothing when they differ (mixed). Hidden sections are ignored here.
  const uniformPermission: AgentPermission | null = (() => {
    const perms = state.sections
      .filter((section) => section.agentPermission !== "hidden")
      .map((section) => section.agentPermission);
    return perms.length > 0 && perms.every((perm) => perm === perms[0]) ? perms[0] : null;
  })();

  // Stats for the Data card: gives the export buttons a sense of weight
  // ("this is everything you've built") without being a dashboard. Rendered
  // as small mono chips.
  const dataStats = useMemo(() => {
    const sectionCount = state.sections.length;
    const wordCount = exportMarkdown().trim().split(/\s+/).filter(Boolean).length;
    return { sectionCount, wordCount };
  }, [state.sections, exportMarkdown]);

  useEffect(() => {
    setNameDraft(activeCreedName);
  }, [activeCreedName]);

  useEffect(() => {
    if (active && state.sections.length === 0) {
      router.replace("/onboarding");
    }
  }, [active, router, state.sections.length]);

  async function saveCreedName() {
    const next = nameDraft.trim();
    if (!next || !state.creedId || next === activeCreedName) {
      setNameDraft(activeCreedName);
      return;
    }
    const res = await fetch("/api/app/creeds/general", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creedId: state.creedId, name: next }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? "Could not update Creed name.");
      setNameDraft(activeCreedName);
      return;
    }
    setNameDraft(next);
    toast.success("Creed name updated.");
    void refreshState();
  }

  async function uploadCreedAvatar(file: File) {
    if (!state.creedId) return;
    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.set("scope", "creed");
      form.set("creedId", state.creedId);
      form.set("file", file);
      const response = await fetch("/api/app/profile/avatar", {
        method: "POST",
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        avatarUrl?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "Could not save Creed picture.");
        return;
      }
      if (data.avatarUrl) {
        setProfileAvatar(data.avatarUrl, "creed");
      }
      void refreshState();
      toast.success("Creed picture saved.");
    } finally {
      setAvatarUploading(false);
    }
  }

  const githubStatus = state.settings.integrations.github.status;
  const effectiveGitHubStatus = githubDisconnectedOverride
    ? "disconnected"
    : githubStatus;
  const githubConnected = effectiveGitHubStatus === "connected";
  const githubDisconnected = effectiveGitHubStatus === "disconnected";
  const selectedRepoFullName =
    state.settings.versionControl.repoOwner && state.settings.versionControl.repoName
      ? `${state.settings.versionControl.repoOwner}/${state.settings.versionControl.repoName}`
      : "";
  const latestCommitUrl =
    selectedRepoFullName && versionStatus?.remoteSha
      ? `https://github.com/${selectedRepoFullName}/commit/${versionStatus.remoteSha}`
      : null;

  // After the standalone GitHub OAuth round-trip, the callback redirects back to
  // /settings?github=<status>. Toast it, bump the refresh tick so repos /
  // branches / sync-status refetch, then strip the param so a reload doesn't
  // re-toast.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("github");
    if (!status) return;
    const messages: Record<string, { ok: boolean; text: string }> = {
      connected: { ok: true, text: "GitHub connected." },
      error: { ok: false, text: "Could not connect GitHub. Please try again." },
      notconfigured: {
        ok: false,
        text: "GitHub isn't available on this deployment yet.",
      },
      invalid: { ok: false, text: "Could not start the GitHub connection." },
      forbidden: { ok: false, text: "You can't manage this GitHub connection." },
    };
    const message = messages[status];
    if (message) (message.ok ? toast.success : toast.error)(message.text);
    params.delete("github");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`,
    );
    if (message?.ok) {
      setGitHubRefreshTick((current) => current + 1);
      void refreshState();
    }
  }, [refreshState]);

  useEffect(() => {
    if (!githubConnected) {
      setRepos([]);
      setBranches([]);
      setVersionStatus({
        connected: false,
        configured: false,
        syncStatus: "not-configured",
      });
      return;
    }

    let cancelled = false;

    async function loadRepos() {
      try {
        setReposLoading(true);
        const loadedRepos = await loadSettingsRepos();

        if (!cancelled) {
          setRepos(loadedRepos);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(
            formatGitHubAccessErrorForState(
              error instanceof Error ? error.message : "Could not load GitHub repos",
              githubConnected
            )
          );
        }
      } finally {
        if (!cancelled) {
          setReposLoading(false);
        }
      }
    }

    void loadRepos();

    return () => {
      cancelled = true;
    };
  }, [githubConnected, githubRefreshTick]);

  useEffect(() => {
    if (!githubConnected || !state.settings.versionControl.repoOwner || !state.settings.versionControl.repoName) {
      setBranches([]);
      return;
    }

    let cancelled = false;

    async function loadBranches() {
      try {
        setBranchesLoading(true);
        const loadedBranches = await loadSettingsBranches(
          state.settings.versionControl.repoOwner,
          state.settings.versionControl.repoName
        );

        if (!cancelled) {
          setBranches(loadedBranches);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(
            formatGitHubAccessErrorForState(
              error instanceof Error ? error.message : "Could not load GitHub branches",
              githubConnected
            )
          );
        }
      } finally {
        if (!cancelled) {
          setBranchesLoading(false);
        }
      }
    }

    void loadBranches();

    return () => {
      cancelled = true;
    };
  }, [
    githubConnected,
    githubRefreshTick,
    state.settings.versionControl.repoOwner,
    state.settings.versionControl.repoName,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadAiSettings() {
      try {
        const settings = await loadSettingsAiSettings();
        if (!cancelled && settings) {
          setAiSettings(hasManagedCredits ? settings : { ...settings, aiMode: "byok" });
        }
      } catch {
        return;
      }
    }

    void loadAiSettings();

    return () => {
      cancelled = true;
    };
  }, [hasManagedCredits]);

  useEffect(() => {
    let cancelled = false;

    async function loadUsage() {
      try {
        const loadedUsage = await loadSettingsUsage(usageRange, aiSettings.aiMode);
        if (!cancelled) {
          setUsage(loadedUsage);
        }
      } catch {
        return;
      }
    }

    void loadUsage();

    return () => {
      cancelled = true;
    };
  }, [usageRange, aiSettings.aiMode, aiSettings.keyStatus]);

  // The Panel intent consumer below runs in a mount-once effect, so it reads
  // the mode-change handler through a ref that tracks the latest render (the
  // handler closes over aiSettings and would otherwise be stale).
  const panelModeChangeRef = useRef<(mode: "credits" | "byok") => void>(() => {});
  useEffect(() => {
    panelModeChangeRef.current = (mode: "credits" | "byok") => void handleModeChange(mode);
  });

  // Panel → Settings intents: scroll to a section, set the usage range or
  // payment mode, open a dialog. Consumed once on mount (arriving via
  // navigation) and again on the intent event (already on /settings, so no
  // remount happens). Mirrors the file screen's nav-intent retry loop: the
  // section list renders in one pass, but the rAF retry keeps this robust if
  // that ever changes.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    let frameId = 0;

    const consume = () => {
      const intent = consumeSettingsPanelIntent();
      if (!intent || cancelled) {
        return;
      }
      if (intent.aiMode) {
        panelModeChangeRef.current(hasManagedCredits ? intent.aiMode : "byok");
      }
      if (intent.usageRange) {
        setUsageRange(intent.usageRange);
      }
      if (hasManagedCredits && intent.openDialog === "add-credits") {
        setAddCreditsOpen(true);
      } else if (hasManagedCredits && intent.openDialog === "credits-history") {
        setHistoryOpen(true);
      }
      const key = intent.scrollTo;
      if (!key) {
        return;
      }

      let attempts = 0;
      const tryScroll = () => {
        if (cancelled) {
          return;
        }
        const element = document.getElementById(`settings-${key}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
          // A soft pulse so the eye lands on the right section after the jump.
          element.animate(
            [
              { backgroundColor: "var(--creed-surface-raised)", borderRadius: "12px", offset: 0.15 },
              { backgroundColor: "transparent", borderRadius: "12px" },
            ],
            { duration: 1100, easing: "ease-out" }
          );
          return;
        }
        attempts += 1;
        if (attempts < 24) {
          frameId = window.requestAnimationFrame(tryScroll);
        }
      };
      frameId = window.requestAnimationFrame(tryScroll);
    };

    const timeoutId = window.setTimeout(consume, 120);
    window.addEventListener(SETTINGS_PANEL_INTENT_EVENT, consume);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(frameId);
      window.removeEventListener(SETTINGS_PANEL_INTENT_EVENT, consume);
    };
  }, [hasManagedCredits]);

  useEffect(() => {
    if (!hasManagedCredits) {
      setCredits(null);
      return;
    }

    let cancelled = false;

    async function loadCredits() {
      try {
        const next = await loadSettingsCredits();
        if (!cancelled) {
          setCredits(next);
        }
      } catch {
        return;
      }
    }

    void loadCredits();

    function onCreditsChanged() {
      void loadCredits();
    }
    window.addEventListener(SETTINGS_CREDITS_CHANGED_EVENT, onCreditsChanged);

    return () => {
      cancelled = true;
      window.removeEventListener(SETTINGS_CREDITS_CHANGED_EVENT, onCreditsChanged);
    };
  }, [hasManagedCredits]);

  // The BYOK card shows the user's live OpenRouter balance, but only when a
  // valid key is saved. Clears in credits mode or when the key is gone.
  useEffect(() => {
    if (aiSettings.aiMode !== "byok" || aiSettings.keyStatus !== "valid") {
      setOpenRouterBalance(null);
      return;
    }
    let cancelled = false;
    void loadSettingsOpenRouterBalance()
      .then((balance) => {
        if (!cancelled) setOpenRouterBalance(balance);
      })
      .catch(() => {
        if (!cancelled) setOpenRouterBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [aiSettings.aiMode, aiSettings.keyStatus]);

  useEffect(() => {
    let cancelled = false;

    async function updateStatus() {
      if (!githubConnected) {
        return;
      }

      try {
        const localHash = await hashSettingsMarkdown(exportMarkdown());
        const status = await loadSettingsVersionStatus(localHash);

        if (!cancelled) {
          setVersionStatus(status);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(
            formatGitHubAccessErrorForState(
              error instanceof Error ? error.message : "Could not load GitHub sync status",
              githubConnected
            )
          );
        }
      }
    }

    void updateStatus();

    return () => {
      cancelled = true;
    };
  }, [
    exportMarkdown,
    githubConnected,
    githubRefreshTick,
    state.settings.versionControl.repoOwner,
    state.settings.versionControl.repoName,
    state.settings.versionControl.branch,
    state.settings.versionControl.lastSyncedContentHash,
  ]);

  function downloadFile(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleDeleteCreed() {
    if (!state.creedId || deleteConfirm !== activeCreedName || deleting) return;
    setDeleting(true);
    try {
      let preferredNextCreedId: string | null = null;
      try {
        preferredNextCreedId = window.localStorage.getItem(
          "creed:last-active-creed",
        );
      } catch {
        preferredNextCreedId = null;
      }
      const res = await fetch("/api/app/creeds", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creedId: state.creedId,
          preferredNextCreedId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        nextCreedId?: string;
        createdBlankPersonal?: boolean;
      };
      if (!res.ok || !data.nextCreedId) {
        toast.error(data.error ?? "Could not delete this Creed.");
        return;
      }
      toast.success(
        data.createdBlankPersonal
          ? "Creed deleted. Started a new Personal Creed."
          : "Creed deleted.",
      );
      setDeleteOpen(false);
      const switched = await switchCreed(data.nextCreedId);
      if (!switched.ok) {
        // Recover from a failed client switch by reloading server-owned state.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/file";
        return;
      }
      router.push("/file");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }


  // GitHub is connected through the standalone "Creed" OAuth App (not Supabase
  // identity linking): a full-page redirect to /api/app/github/authorize, which
  // bounces through GitHub and back to /settings?github=<status> (handled above).
  function handleConnectGitHub() {
    setGithubDisconnectedOverride(false);
    setConnectingGitHub(true);
    // OAuth begins with a top-level navigation through the route handler.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/api/app/github/authorize?mode=personal";
  }

  async function handleDisconnectGitHub() {
    try {
      setDisconnectingGitHub(true);
      const response = await fetch("/api/app/github/integration", {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Could not disconnect GitHub");
      }
      setGithubDisconnectedOverride(true);
      setRepos([]);
      setBranches([]);
      clearSettingsRepoCache();
      void refreshState();
      toast.success("GitHub disconnected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect GitHub");
    } finally {
      setDisconnectingGitHub(false);
    }
  }

  function handleRepoChange(value: string) {
    if (!value) {
      setVersionControlConfig({
        repoOwner: "",
        repoName: "",
        branch: "",
        lastRemoteSha: undefined,
        lastRemoteMessage: undefined,
        lastRemoteCommittedAt: undefined,
        lastSyncedContentHash: undefined,
        syncStatus: "not-configured",
      });
      return;
    }

    const repo = repos.find((item) => item.fullName === value);
    if (!repo) {
      return;
    }

    setVersionControlConfig({
      repoOwner: repo.owner,
      repoName: repo.name,
      branch: repo.defaultBranch,
      path: "creed.md",
      lastRemoteSha: undefined,
      lastRemoteMessage: undefined,
      lastRemoteCommittedAt: undefined,
      syncStatus: "unknown",
    });
  }

  function handleBranchChange(value: string) {
    setVersionControlConfig({
      branch: value,
      syncStatus: value ? "unknown" : "not-configured",
    });
  }

  async function handleSaveAiSettings() {
    if (!looksLikeApiKey(aiKeyDraft)) {
      return;
    }

    try {
      setAiSaving(true);
      const response = await fetch("/api/app/ai/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiKey: aiKeyDraft.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as {
        settings?: PublicAiSettings;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Could not save AI settings.");
      }

      if (payload.settings) {
        setAiSettings(payload.settings);
        setCachedSettingsAiSettings(payload.settings);
        clearSettingsUsageCache();
      }
      setAiKeyDraft("");
      // A freshly saved key has a new OpenRouter balance to show.
      clearSettingsOpenRouterBalanceCache();
      void loadSettingsOpenRouterBalance()
        .then(setOpenRouterBalance)
        .catch(() => setOpenRouterBalance(null));
      toast.success("API key saved");
    } catch {
      toast.error("Couldn't save API key");
    } finally {
      setAiSaving(false);
    }
  }

  async function handleClearAiKey() {
    try {
      setAiSaving(true);
      const response = await fetch("/api/app/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clearApiKey: true,
        }),
      });
      const payload = (await response.json()) as {
        settings?: PublicAiSettings;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Could not clear API key.");
      }
      if (payload.settings) {
        setAiSettings(payload.settings);
        setCachedSettingsAiSettings(payload.settings);
        clearSettingsUsageCache();
      }
      setAiKeyDraft("");
      clearSettingsOpenRouterBalanceCache();
      setOpenRouterBalance(null);
      toast.success("API key cleared");
    } catch {
      toast.error("Couldn't clear API key");
    } finally {
      setAiSaving(false);
    }
  }

  async function handleModeChange(mode: AiMode) {
    if (!hasManagedCredits && mode !== "byok") {
      return;
    }
    if (aiSettings.aiMode === mode) {
      return;
    }
    const previous = aiSettings.aiMode;
    setAiSettings((current) => ({ ...current, aiMode: mode }));
    try {
      const response = await fetch("/api/app/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiMode: mode }),
      });
      const payload = (await response.json()) as {
        settings?: PublicAiSettings;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Could not switch mode.");
      }
      if (payload.settings) {
        setAiSettings(payload.settings);
        setCachedSettingsAiSettings(payload.settings);
      }
    } catch {
      setAiSettings((current) => ({ ...current, aiMode: previous }));
      toast.error("Couldn't switch mode");
    }
  }

  async function refreshCredits() {
    clearSettingsCreditsCache();
    try {
      setCredits(await loadSettingsCredits());
    } catch {
      // Keep the current balance on a transient failure.
    }
  }

  return (
    <>
      <div className="h-full overflow-y-auto bg-[var(--creed-surface)] creed-scrollbar">
        <div className="mx-auto max-w-3xl px-8 py-10 md:px-14">
          <h1 className="font-heading text-[1.75rem] font-medium tracking-[-0.03em] text-[var(--creed-text-primary)]">
            Settings
          </h1>

          <section id="settings-identity" className="mt-10 scroll-mt-6">
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Identity
            </h2>
            <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
              <SettingsProfileLayout
                avatar={
                  <EditableProfileAvatar
                    kind="person"
                    name={nameDraft.trim() || activeCreedName}
                    initials={state.user.avatarInitials}
                    avatarUrl={activeCreed?.avatarUrl ?? state.user.avatarUrl}
                    uploading={avatarUploading}
                    onFile={(file) => void uploadCreedAvatar(file)}
                  />
                }
                nameField={
                  <>
                    <label className="mb-2 block text-[14px] font-medium leading-5 text-[var(--creed-text-secondary)]">
                      Creed name
                    </label>
                    <Input
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      onBlur={() => void saveCreedName()}
                      className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[15px]"
                    />
                  </>
                }
              />
            </div>
          </section>

          <Separator className="my-10 bg-[var(--creed-border)]" />

          <section id="settings-agent-edits" className="scroll-mt-6">
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Agent edit behaviour
            </h2>
            <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5 pb-4">
              <div className="flex items-center justify-between gap-5">
                <div>
                  <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">
                    All sections
                  </div>
                </div>
                <SectionPermissionControl
                  value={uniformPermission}
                  onChange={(permission) => {
                    if (permission !== "hidden") {
                      setAllSectionPermissions(permission);
                    }
                  }}
                  layoutGroup="all-sections"
                  options={GLOBAL_PERMISSION_OPTIONS}
                />
              </div>

              <div className="mt-5 border-t border-[var(--creed-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setPermsOpen((open) => !open)}
                  // -my-2 py-2 keeps the text where it is but expands the
                  // clickable box by 16px vertically (the bare row was too thin
                  // a target).
                  className="group -my-2 flex w-full items-center justify-between py-2 text-left"
                >
                  <span className="text-[14px] font-medium text-[var(--creed-text-primary)]">
                    Per-section permissions
                  </span>
                  <ChevronDown
                    className={cn(
                      // Match the other dropdown chevrons: tertiary by default,
                      // primary (white in dark) on hover.
                      "h-4 w-4 shrink-0 text-[var(--creed-text-tertiary)] transition-all duration-200 group-hover:text-[var(--creed-text-primary)]",
                      permsOpen && "rotate-180"
                    )}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {permsOpen ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0, y: -8 }}
                      animate={{ height: "auto", opacity: 1, y: 0 }}
                      exit={{ height: 0, opacity: 0, y: -8 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 space-y-1">
                        {state.sections.map((section) => (
                          <div
                            key={section.id}
                            className="flex items-center justify-between gap-3 rounded-sm py-1.5"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                                style={{ backgroundColor: accentColorMap[section.accent] }}
                              />
                              <span className="truncate text-[14px] text-[var(--creed-text-primary)]">
                                {section.name}
                              </span>
                            </div>
                            <SectionPermissionControl
                              value={section.agentPermission}
                              onChange={(permission) => setSectionPermission(section.id, permission)}
                              layoutGroup={section.id}
                            />
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </section>

          <Separator className="my-10 bg-[var(--creed-border)]" />

          <section id="settings-integrations" className="scroll-mt-6">
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Integrations
            </h2>
            <div className="mt-4 divide-y divide-[var(--creed-border)] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)]">
              <IntegrationRow
                title="GitHub"
                icon={<GitHubMark className="h-7 w-7 text-[#24292F] dark:text-[var(--creed-text-primary)]" />}
                status={effectiveGitHubStatus}
                statusLabel={
                  githubConnected
                    ? "Connected"
                    : githubDisconnected
                      ? "Disconnected"
                      : "Not connected"
                }
                secondaryLabel={
                  githubConnected ? state.settings.integrations.github.accountLabel : undefined
                }
                action={
                  githubConnected ? (
                    <DisconnectButton
                      label="GitHub"
                      loading={disconnectingGitHub}
                      onClick={() => void handleDisconnectGitHub()}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <ReauthorizeButton />
                      <ConnectButton
                        label="GitHub"
                        loading={connectingGitHub}
                        onClick={() => void handleConnectGitHub()}
                      />
                    </div>
                  )
                }
              />
            </div>
          </section>

          <Separator className="my-10 bg-[var(--creed-border)]" />

          <section id="settings-model-usage" className="scroll-mt-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
                Model usage
              </h2>
              {hasManagedCredits ? <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-sm text-[var(--creed-text-primary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)]"
                  >
                    {aiSettings.aiMode === "credits" ? "Credits" : "BYOK"}
                    <ChevronDown className="h-3.5 w-3.5 text-[var(--creed-text-secondary)]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="min-w-32 space-y-1 border-[var(--creed-border)] bg-[var(--creed-surface)] p-1.5"
                >
                  {(["credits", "byok"] as AiMode[]).map((mode) => (
                    <DropdownMenuItem
                      key={mode}
                      onSelect={() => void handleModeChange(mode)}
                      className={cn(
                        "flex items-center justify-between gap-5 rounded-lg px-3 py-2 text-sm",
                        aiSettings.aiMode === mode && "bg-[var(--creed-surface-selected)] font-medium"
                      )}
                    >
                      <span>{mode === "credits" ? "Credits" : "BYOK"}</span>
                      {aiSettings.aiMode === mode ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-[var(--creed-text-primary)]" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu> : (
                <span className="inline-flex h-8 items-center rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-sm text-[var(--creed-text-secondary)]">
                  BYOK
                </span>
              )}
            </div>
            <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
              <div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr] md:items-stretch">
                <div className="flex flex-col gap-4">
                  {hasManagedCredits && aiSettings.aiMode === "credits" ? (
                    <>
                      <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] px-4 py-3">
                        <div className="text-[13px] font-medium text-[var(--creed-text-secondary)]">
                          Credit balance
                        </div>
                        {credits == null ? (
                          <SkeletonText
                            preset="fig30"
                            width="w-[120px]"
                            className="mt-0.5"
                          />
                        ) : (
                          <div className="mt-0.5 text-[30px] font-medium tracking-[-0.03em] tabular-nums text-[var(--creed-text-primary)]">
                            ${purchasedUsd.toFixed(2)}
                          </div>
                        )}
                      </div>
                      {credits == null || isCreditsHome ? (
                        <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] px-4 py-2.5">
                          <div className="text-[13px] font-medium text-[var(--creed-text-secondary)]">
                            Bonus credits
                          </div>
                          {credits == null ? (
                            <SkeletonText
                              preset="fig22"
                              width="w-[64px]"
                              className="mt-0.5"
                            />
                          ) : (
                            <div className="mt-0.5 text-[22px] font-medium tracking-[-0.02em] tabular-nums text-[var(--creed-text-primary)]">
                              ${bonusRemainingUsd.toFixed(2)}
                              {allowanceResets && allowanceUsd > 0 ? (
                                <span className="text-[var(--creed-text-tertiary)]">
                                  /${allowanceUsd.toFixed(2)}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div>
                      {openRouterBalance ? (
                        <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--creed-border)] px-4 py-3">
                          <div className="text-[13px] font-medium text-[var(--creed-text-secondary)]">
                            OpenRouter balance
                          </div>
                          <div className="mt-0.5 text-[30px] font-medium tracking-[-0.03em] text-[var(--creed-text-primary)]">
                            {openRouterBalance.remainingUsd != null
                              ? `$${openRouterBalance.remainingUsd.toFixed(2)}`
                              : "Unlimited"}
                          </div>
                        </div>
                      ) : null}
                      <label className="mb-2 block text-[13px] font-medium text-[var(--creed-text-secondary)]">
                        OpenRouter API key
                      </label>
                      <Input
                        type="password"
                        value={aiKeyDraft}
                        onChange={(event) => {
                          setAiKeyDraft(event.target.value);
                        }}
                        placeholder={
                          aiSettings.keyLastFour
                            ? `Saved key ending in ${aiSettings.keyLastFour}`
                            : "sk-or-..."
                        }
                        className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[14px]"
                      />
                    </div>
                  )}

                  {hasManagedCredits && aiSettings.aiMode === "credits" ? (
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      <Button
                        variant="ghost"
                        className="rounded-md px-3 text-[var(--creed-text-secondary)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                        onClick={() => setHistoryOpen(true)}
                      >
                        View purchases
                      </Button>
                      <Button
                        className="rounded-md bg-[var(--creed-accent)] px-4 text-white hover:bg-[var(--creed-accent-hover)]"
                        onClick={() => setAddCreditsOpen(true)}
                      >
                        Add credits
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      <Button
                        variant="ghost"
                        className="rounded-md px-3 text-[var(--creed-text-secondary)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                        onClick={() => {
                          if (aiSettings.keyLastFour) {
                            void handleClearAiKey();
                          } else {
                            setAiKeyDraft("");
                          }
                        }}
                        disabled={aiSaving || (!aiKeyDraft && !aiSettings.keyLastFour)}
                      >
                        Clear
                      </Button>
                      <Button
                        className="rounded-md bg-[var(--creed-accent)]! px-4 text-white! hover:bg-[var(--creed-accent-hover)]! hover:text-white! disabled:bg-[var(--creed-surface-raised)]! disabled:text-[var(--creed-text-tertiary)]! disabled:opacity-100"
                        onClick={() => void handleSaveAiSettings()}
                        disabled={!canSaveAiKey}
                      >
                        Save
                        {aiSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                      </Button>
                    </div>
                  )}
                </div>

                <UsageCard
                  usage={usage}
                  range={usageRange}
                  onRangeChange={setUsageRange}
                  mode={aiSettings.aiMode}
                />
              </div>
            </div>

            {hasManagedCredits ? (
              <>
                <AddCreditsDialog
                  open={addCreditsOpen}
                  onOpenChange={setAddCreditsOpen}
                  currentBalanceUsd={credits?.balanceUsd ?? 0}
                  creedId={state.creedId}
                  onToppedUp={() => void refreshCredits()}
                />
                <CreditsHistoryDialog
                  open={historyOpen}
                  onOpenChange={setHistoryOpen}
                  transactions={credits?.transactions ?? []}
                />
              </>
            ) : null}
          </section>

          <Separator className="my-10 bg-[var(--creed-border)]" />

          <section id="settings-version-control" className="scroll-mt-6">
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Version control
            </h2>
            <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
              {/* When GitHub is disconnected we keep the same layout and
                  just disable the controls. The saved repo/branch are
                  still rendered so the user can see what'll auto-select
                  on reconnect. Synthesized options below ensure the
                  SearchableSelect can render the saved label even when
                  the live repo/branch lists haven't been fetched. */}
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-[14px] font-medium text-[var(--creed-text-secondary)]">
                      Repo
                    </label>
                    <SearchableSelect
                      value={selectedRepoFullName}
                      onChange={handleRepoChange}
                      placeholder={
                        !githubConnected
                          ? selectedRepoFullName || "Select a repo"
                          : reposLoading
                            ? "Loading repos..."
                            : "Select a repo"
                      }
                      searchPlaceholder="Search repos..."
                      disabled={!githubConnected || reposLoading || repos.length === 0}
                      options={
                        repos.length > 0
                          ? repos.map((repo) => ({
                              key: String(repo.id),
                              value: repo.fullName,
                              label: repo.fullName,
                              description: repo.private ? "Private repo" : "Public repo",
                              search: `${repo.fullName} ${repo.defaultBranch}`,
                            }))
                          : selectedRepoFullName
                            ? [
                                {
                                  key: selectedRepoFullName,
                                  value: selectedRepoFullName,
                                  label: selectedRepoFullName,
                                  search: selectedRepoFullName,
                                },
                              ]
                            : []
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-[14px] font-medium text-[var(--creed-text-secondary)]">
                      Branch
                    </label>
                    <SearchableSelect
                      value={state.settings.versionControl.branch}
                      onChange={handleBranchChange}
                      placeholder={
                        !githubConnected
                          ? state.settings.versionControl.branch || "Select a branch"
                          : branchesLoading
                            ? "Loading branches..."
                            : "Select a branch"
                      }
                      searchPlaceholder="Search branches..."
                      disabled={
                        !githubConnected ||
                        branchesLoading ||
                        branches.length === 0 ||
                        !state.settings.versionControl.repoOwner ||
                        !state.settings.versionControl.repoName
                      }
                      options={
                        branches.length > 0
                          ? branches.map((branch) => ({
                              key: branch.name,
                              value: branch.name,
                              label: branch.name,
                              search: branch.name,
                            }))
                          : state.settings.versionControl.branch
                            ? [
                                {
                                  key: state.settings.versionControl.branch,
                                  value: state.settings.versionControl.branch,
                                  label: state.settings.versionControl.branch,
                                  search: state.settings.versionControl.branch,
                                },
                              ]
                            : []
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-[var(--creed-text-secondary)]">
                  <span className="font-medium text-[var(--creed-text-secondary)]">
                    Last commit
                  </span>
                  <span aria-hidden className="shrink-0 text-[var(--creed-text-tertiary)]">
                    ·
                  </span>
                  {versionStatus?.remoteMessage ? (
                    <span className="inline-flex min-w-0 items-center gap-2">
                      {latestCommitUrl ? (
                        <a
                          href={latestCommitUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={versionStatus.remoteMessage}
                          className="truncate font-medium text-[var(--creed-accent)] transition-colors hover:text-[var(--creed-accent-hover)]"
                        >
                          {versionStatus.remoteMessage}
                        </a>
                      ) : (
                        <span className="truncate text-[var(--creed-text-secondary)]">
                          {versionStatus.remoteMessage}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[var(--creed-text-tertiary)]">
                      no commits yet
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <Separator className="my-10 bg-[var(--creed-border)]" />

          <section id="settings-archived" className="scroll-mt-6">
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Archived
            </h2>
            <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
              {archivedSections.length === 0 ? (
                <p className="text-[14px] leading-7 text-[var(--creed-text-secondary)]">
                  Nothing archived. Archived sections show up here, ready to restore.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {archivedSections.map((section) => {
                    const expanded = expandedArchived === section.id;
                    return (
                      <div
                        key={section.id}
                        className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--creed-border)]"
                      >
                        <div className="flex items-center justify-between gap-4 px-4 py-3">
                          <ArchivedSectionHeading
                            name={section.name}
                            accent={accentColorMap[section.accent]}
                            expanded={expanded}
                            onToggle={() =>
                              setExpandedArchived((current) =>
                                current === section.id ? null : section.id
                              )
                            }
                          />
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              variant="outline"
                              className="rounded-md border-[var(--creed-border)]"
                              onClick={() => {
                                restoreSection(section.id);
                                toast.success(`Restored "${section.name}"`);
                              }}
                            >
                              Restore
                            </Button>
                            <Button
                              className="rounded-md bg-[#DC2626] text-white hover:bg-[#B91C1C] hover:text-white"
                              onClick={() =>
                                setArchivedDeleteTarget({ id: section.id, name: section.name })
                              }
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                        <AnimatePresence initial={false}>
                          {expanded ? (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                              className="hidden overflow-hidden md:block"
                            >
                              <div className="border-t border-[var(--creed-border)] px-4 py-4">
                                <RichTextEditor
                                  sectionId={section.id}
                                  content={section.content}
                                  readOnly
                                  accentColor={accentColorMap[section.accent]}
                                  onChange={() => {}}
                                />
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <Separator className="my-10 bg-[var(--creed-border)]" />

          <section id="settings-data" className="scroll-mt-6">
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Data
            </h2>
            <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[14px]">
                <span>
                  <span className="font-medium text-[var(--creed-text-primary)]">
                    {dataStats.wordCount.toLocaleString()}
                  </span>
                  <span className="ml-1 text-[var(--creed-text-secondary)]">
                    {dataStats.wordCount === 1 ? "word" : "words"}
                  </span>
                </span>
                <span aria-hidden className="text-[var(--creed-text-tertiary)]">
                  ·
                </span>
                <span>
                  <span className="font-medium text-[var(--creed-text-primary)]">
                    {dataStats.sectionCount.toLocaleString()}
                  </span>
                  <span className="ml-1 text-[var(--creed-text-secondary)]">
                    {dataStats.sectionCount === 1 ? "section" : "sections"}
                  </span>
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <AnimatedIconButton
                  icon={DownloadIcon}
                  variant="outline"
                  className="rounded-md border-[var(--creed-border)]"
                  onClick={() =>
                    downloadFile(
                      creedMarkdownFilename(activeCreedName),
                      exportMarkdown(),
                      "text/markdown;charset=utf-8",
                    )
                  }
                >
                  Export Creed as markdown
                </AnimatedIconButton>
                <AnimatedIconButton
                  icon={DownloadIcon}
                  variant="outline"
                  className="rounded-md border-[var(--creed-border)]"
                  onClick={() =>
                    downloadFile(
                      "creed-activity.json",
                      exportActivityJson(),
                      "application/json;charset=utf-8"
                    )
                  }
                >
                  Export activity log
                </AnimatedIconButton>
                <AnimatedIconButton
                  icon={DownloadIcon}
                  variant="outline"
                  className="rounded-md border-[var(--creed-border)]"
                  onClick={() =>
                    downloadFile(
                      "creed-data.json",
                      exportAllDataJson(),
                      "application/json;charset=utf-8"
                    )
                  }
                >
                  Export all data
                </AnimatedIconButton>
              </div>
            </div>
          </section>

          <Separator className="my-10 bg-[var(--creed-border)]" />

          <section id="settings-danger" className="scroll-mt-6">
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Danger zone
            </h2>
            <div className="mt-4 rounded-[var(--radius-xl)] border border-[#FECACA] bg-[#FEF2F2] p-5 dark:border-[#7F1D1D]/40 dark:bg-[#3F1212]/30">
              <div className="flex items-center justify-between gap-5">
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-[#DC2626] dark:text-[#DC2626]">
                    Delete Creed
                  </div>
                  <div className="mt-2 hidden text-[14px] leading-7 text-[#DC2626] dark:text-[#DC2626] md:block">
                    Deletes this Creed, its content, and its credit balance.
                  </div>
                </div>
                <Button
                  className="rounded-md bg-[#DC2626] px-4 text-white hover:bg-[#B91C1C] hover:text-white"
                  onClick={() => {
                    setDeleteConfirm("");
                    setDeleteOpen(true);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteConfirm("");
        }}
      >
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-[#B91C1C]" />
              Delete Creed
            </DialogTitle>
          </DialogHeader>
          <p className="text-[14px] leading-7 text-[var(--creed-text-secondary)]">
            Permanently deletes this Creed, its content, and credit balance.
            Type its name to confirm.
          </p>
          <Input
            value={deleteConfirm}
            onChange={(event) => setDeleteConfirm(event.target.value)}
            placeholder={activeCreedName}
            className="mt-1 h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[15px] focus-visible:border-[#DC2626] focus-visible:ring-[#DC2626]/20"
          />
          <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button
              variant="ghost"
              className="rounded-md"
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[#DC2626] text-white hover:bg-[#B91C1C]"
              onClick={() => void handleDeleteCreed()}
              disabled={deleting || deleteConfirm !== activeCreedName}
            >
              {deleting ? (
                <>
                  Deleting
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={archivedDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchivedDeleteTarget(null);
        }}
      >
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>Delete archived section</DialogTitle>
            <DialogDescription>
              This permanently deletes &ldquo;{archivedDeleteTarget?.name}&rdquo; and its history.
              This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button
              variant="ghost"
              className="rounded-md"
              onClick={() => setArchivedDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[#DC2626] px-4 text-white hover:bg-[#B91C1C] hover:text-white"
              onClick={() => {
                if (archivedDeleteTarget) deleteSection(archivedDeleteTarget.id);
                setArchivedDeleteTarget(null);
              }}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ConnectButton({
  label,
  loading,
  onClick,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={`Connect ${label}`}
      className="rounded-md bg-[#16A34A] text-white hover:bg-[#15803d] hover:text-white max-md:size-9 max-md:p-0 md:px-4 md:text-sm"
      onClick={onClick}
      disabled={loading}
    >
      {loading ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <Link2 className="h-4 w-4 md:hidden" />
          <span className="hidden md:inline">Connect</span>
        </>
      )}
    </Button>
  );
}

export function DisconnectButton({
  label,
  loading,
  onClick,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={`Disconnect ${label}`}
      className="rounded-md bg-[#DC2626] text-white hover:bg-[#B91C1C] hover:text-white max-md:size-9 max-md:p-0 md:px-4 md:text-sm"
      onClick={onClick}
      disabled={loading}
    >
      {loading ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <Unlink2 className="h-4 w-4 md:hidden" />
          <span className="hidden md:inline">Disconnect</span>
        </>
      )}
    </Button>
  );
}

export function ReauthorizeButton() {
  return (
    <Button
      asChild
      variant="ghost"
      className="rounded-md px-3 text-[13px] text-[var(--creed-text-secondary)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] max-md:hidden"
    >
      <a
        href={GITHUB_AUTHORIZED_APPS_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        Re-authorize
      </a>
    </Button>
  );
}

export function IntegrationRow({
  title,
  icon,
  action,
  secondaryLabel,
  status,
  statusLabel,
}: {
  title: string;
  icon: ReactNode;
  action: ReactNode;
  secondaryLabel?: string;
  status?: IntegrationConnectionStatus;
  statusLabel?: string;
}) {
  const isConnected = status === "connected";
  const isDisconnected = status === "disconnected";
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-medium text-[var(--creed-text-primary)]">
              {title}
            </span>
            {statusLabel ? (
              <span
                className={cn(
                  "inline-flex items-center whitespace-nowrap rounded-[6px] px-1.5 py-0.5 text-[12px] font-medium",
                  isConnected
                    ? "bg-[#ECFDF5] text-[#047857] dark:bg-[#052e1a]/50 dark:text-[#4ade80]"
                    : isDisconnected
                      ? "bg-[#FEF2F2] text-[#B91C1C] dark:bg-[#3F1212]/40 dark:text-[#F87171]"
                      : "bg-[var(--creed-surface-raised)] text-[var(--creed-text-secondary)]"
                )}
              >
                {statusLabel}
              </span>
            ) : null}
          </div>
          {secondaryLabel ? (
            <div className="mt-1 truncate text-[13px] text-[var(--creed-text-secondary)]">
              {secondaryLabel}
            </div>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function UsageCard({
  usage,
  range,
  onRangeChange,
  mode,
}: {
  usage: AiUsageSummary | null;
  range: AiUsageRange;
  onRangeChange: (range: AiUsageRange) => void;
  mode: AiMode;
}) {
  const total = usage?.totalCostUsd ?? 0;

  // Features present in the range, known features first. Each day's spend is
  // stacked by feature - same recharts pattern as the /connections charts.
  const featureOrder: readonly string[] = AI_FEATURES;
  const present = Array.from(
    new Set(
      (usage?.days ?? []).flatMap((day) =>
        day.segments.filter((s) => s.costUsd > 0).map((s) => s.feature)
      )
    )
  ).sort((a, b) => {
    const ai = featureOrder.indexOf(a);
    const bi = featureOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const chartData = (usage?.days ?? [])
    .map((day) => {
      const row: Record<string, number | string> = { date: day.date };
      for (const feature of present) row[feature] = 0;
      for (const segment of day.segments) {
        if (present.includes(segment.feature)) {
          row[segment.feature] = (Number(row[segment.feature]) || 0) + segment.costUsd;
        }
      }
      return row;
    })
    // Only plot days that actually have spend.
    .filter((row) => present.reduce((sum, feature) => sum + Number(row[feature] ?? 0), 0) > 0);
  const chartConfig: ChartConfig = {};
  present.forEach((feature) => {
    const meta = featureMeta(feature);
    chartConfig[feature] = { label: meta.label, color: meta.color };
  });

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-[var(--creed-text-secondary)]">
            {mode === "credits" ? "Credits spend" : "BYOK spend"}
          </div>
          {usage == null ? (
            <SkeletonText preset="fig30" width="w-[72px]" className="mt-2" />
          ) : (
            <div className="mt-2 text-[30px] font-medium tracking-[-0.04em] text-[var(--creed-text-primary)]">
              ${total.toFixed(total < 10 ? 2 : 0)}
            </div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-sm text-[var(--creed-text-primary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)]"
            >
              {range}
              <ChevronDown className="h-3.5 w-3.5 text-[var(--creed-text-secondary)]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-24 space-y-1 border-[var(--creed-border)] bg-[var(--creed-surface)] p-1.5"
          >
            {(["7d", "30d", "90d"] as AiUsageRange[]).map((item) => (
              <DropdownMenuItem
                key={item}
                onSelect={() => onRangeChange(item)}
                className={cn(
                  "flex items-center justify-between gap-5 rounded-lg px-3 py-2 text-sm",
                  range === item && "bg-[var(--creed-surface-selected)] font-medium"
                )}
              >
                <span>{item}</span>
                {range === item ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-[var(--creed-text-primary)]" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative mt-5 h-[120px] w-full">
        {usage == null ? (
          <SkeletonBar className="h-[120px] w-full rounded-lg" />
        ) : (
        <AnimatePresence initial={false}>
          <motion.div
            // Cross-fade between states on timeframe change. The populated
            // chart keeps a stable key so recharts morphs its bars across
            // ranges; the empty state is keyed per-range so it re-animates
            // (and updates its caption) when you switch the timeframe.
            key={chartData.length > 0 ? "chart" : `empty-${range}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            {chartData.length > 0 ? (
              <ChartContainer config={chartConfig} className="aspect-auto h-full w-full">
                <BarChart data={chartData} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value) => formatUsageDate(String(value))}
                        formatter={(value, name, item) => (
                          <div className="flex w-full items-center justify-between gap-3">
                            <span className="flex items-center gap-1.5 text-[var(--creed-text-secondary)]">
                              <span
                                className="h-2.5 w-2.5 rounded-[2px]"
                                style={{ backgroundColor: item.color ?? item.payload?.fill }}
                              />
                              {chartConfig[String(name)]?.label ?? name}
                            </span>
                            <span className="font-mono text-[var(--creed-text-primary)]">
                              ${Number(value).toFixed(2)}
                            </span>
                          </div>
                        )}
                      />
                    }
                  />
                  {present.map((feature) => (
                    <Bar
                      key={feature}
                      dataKey={feature}
                      stackId="cost"
                      fill={`var(--color-${feature})`}
                      shape={<StackTopBar orderedKeys={present} dataKey={feature} />}
                    />
                  ))}
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="relative flex h-full items-center justify-center">
                {/* Faint zero baseline echoing the chart grid, so the empty
                    state reads as a chart at $0 rather than a bare message. */}
                <div className="absolute inset-x-0 bottom-0 border-t border-dashed border-[var(--creed-border)]" />
                <span className="text-[12px] text-[var(--creed-text-tertiary)]">
                  No spend in the last {range.replace("d", " days")}
                </span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function formatUsageDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.66.5 12.02c0 5.09 3.29 9.4 7.86 10.93.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.69-1.28-1.69-1.04-.71.08-.69.08-.69 1.15.08 1.75 1.18 1.75 1.18 1.02 1.76 2.68 1.25 3.34.96.1-.74.4-1.25.72-1.53-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.17a11 11 0 0 1 5.78 0c2.2-1.48 3.16-1.17 3.16-1.17.63 1.58.24 2.75.12 3.04.74.8 1.18 1.82 1.18 3.07 0 4.41-2.69 5.39-5.26 5.67.41.36.77 1.06.77 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.68.8.56A11.53 11.53 0 0 0 23.5 12C23.5 5.66 18.35.5 12 .5Z" />
    </svg>
  );
}
