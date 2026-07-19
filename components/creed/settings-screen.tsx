"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type Ref,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Plug,
  Unplug,
} from "lucide-react";
import { DownloadIcon } from "@/components/ui/download";
import { EyeIcon } from "@/components/ui/eye";
import { EyeOffIcon } from "@/components/ui/eye-off";
import { PenToolIcon } from "@/components/ui/pen-tool";
import { ShieldCheckIcon } from "@/components/ui/shield-check";
import {
  useAnimatedIconControls,
  type AnimatedIconHandle,
} from "@/components/creed/animated-icon-controls";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  consumeSettingsPanelIntent,
  SETTINGS_PANEL_INTENT_EVENT,
} from "@/lib/panel/settings-intent";
import { SimpleTooltip } from "@/components/ui/tooltip";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { StackTopBar } from "@/components/creed/rounded-bar";
import { AnimatedIconButton } from "@/components/creed/animated-icon-action";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/creed/searchable-select";
import { useCreed } from "@/components/creed/creed-provider";
import { CompanySettings } from "@/components/creed/company-settings";
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
import { AddCreditsDialog } from "@/components/creed/add-credits-dialog";
import { CreditsHistoryDialog } from "@/components/creed/credits-history-dialog";
import { LOW_ALLOWANCE_RATIO } from "@/lib/ai/credit-config";
import { AI_FEATURES, featureMeta } from "@/lib/ai/features";
import {
  accentColorMap,
  type AgentPermission,
  type IntegrationConnectionStatus,
} from "@/lib/creed-data";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/creed/rich-text-editor";
import { EditableProfileAvatar } from "@/components/creed/profile-avatar";

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

// The /settings surface switches on the active Creed: company Creeds get the
// company management screen (members, permissions, billing); personal Creeds get
// the original settings below. Personal behaviour is unchanged.
export function SettingsScreen() {
  const { state } = useCreed();
  if (state.creedType === "company") {
    return <CompanySettings />;
  }
  return <PersonalSettingsScreen />;
}

function PersonalSettingsScreen() {
  const router = useRouter();
  const {
    state,
    setDisplayName,
    setSectionPermission,
    setAllSectionPermissions,
    setVersionControlConfig,
    exportMarkdown,
    exportActivityJson,
    exportAllDataJson,
    refreshState,
    setProfileAvatar,
    deleteAccount,
    restoreSection,
    deleteSection,
  } = useCreed();
  const [nameDraft, setNameDraft] = useState(state.user.name);
  const [deleteOpen, setDeleteOpen] = useState(false);
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
    aiMode: "credits",
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

  // Two-bucket credits display: the allowance as spent / total, a separate
  // roll-over "extra credits" card beneath it, and a quiet "low" nudge once the
  // combined balance drops to <= 20% of the allowance. Kept minimal on purpose.
  const grantedUsd = credits?.grantedUsd ?? 0;
  const purchasedUsd = credits?.purchasedUsd ?? 0;
  const balanceUsd = credits?.balanceUsd ?? 0;
  const allTimeSpentUsd = credits?.allTimeSpentUsd ?? 0;
  const allowanceUsd = credits?.allowanceUsd ?? 0;
  const allowanceResets = credits?.allowanceResets ?? false;
  const allowanceSpentUsd = Math.max(0, allowanceUsd - grantedUsd);
  // Low once the combined balance drops to <= 20% of the allowance, so a large
  // extra-credits buffer suppresses the nudge.
  const lowOnAllowance = allowanceUsd > 0 && balanceUsd <= allowanceUsd * LOW_ALLOWANCE_RATIO;

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
    if (state.sections.length === 0) {
      router.replace("/onboarding");
    }
  }, [router, state.sections.length]);

  async function saveDisplayName() {
    const next = nameDraft.trim();
    if (!next || next === state.user.name) {
      setNameDraft(state.user.name);
      return;
    }

    const ok = await setDisplayName(next);
    if (ok) {
      setNameDraft(next);
      toast.success("Name updated.");
    } else {
      setNameDraft(state.user.name);
      toast.error("Could not update name.");
    }
  }

  async function uploadPersonalAvatar(file: File) {
    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.set("scope", "personal");
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
        toast.error(data.error ?? "Could not save profile picture.");
        return;
      }
      if (data.avatarUrl) {
        setProfileAvatar(data.avatarUrl, "personal");
      }
      void refreshState();
      toast.success("Profile picture saved.");
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
          setAiSettings(settings);
        }
      } catch {
        return;
      }
    }

    void loadAiSettings();

    return () => {
      cancelled = true;
    };
  }, []);

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
        panelModeChangeRef.current(intent.aiMode);
      }
      if (intent.usageRange) {
        setUsageRange(intent.usageRange);
      }
      if (intent.openDialog === "add-credits") {
        setAddCreditsOpen(true);
      } else if (intent.openDialog === "credits-history") {
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
  }, []);

  useEffect(() => {
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

    return () => {
      cancelled = true;
    };
  }, []);

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

  async function handleDeleteAccount() {
    try {
      setDeleting(true);
      await deleteAccount();
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

          <section id="settings-profile" className="mt-10 scroll-mt-6">
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Profile
            </h2>
            <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
              <div className="grid grid-cols-[calc(1.25rem+0.5rem+2.75rem)_minmax(0,1fr)] items-start gap-x-4 gap-y-4 md:flex md:gap-5">
                <EditableProfileAvatar
                  kind="person"
                  name={state.user.name}
                  initials={state.user.avatarInitials}
                  avatarUrl={state.user.avatarUrl}
                  uploading={avatarUploading}
                  onFile={(file) => void uploadPersonalAvatar(file)}
                />
                <div className="contents md:block md:min-w-0 md:flex-1 md:space-y-3">
                  <div className="min-w-0">
                    <label className="mb-2 block text-[14px] font-medium leading-5 text-[var(--creed-text-secondary)]">
                      Name
                    </label>
                    <Input
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      onBlur={() => void saveDisplayName()}
                      className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[15px]"
                    />
                  </div>
                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <label className="mb-2 block text-[14px] font-medium leading-5 text-[var(--creed-text-secondary)]">
                      Email
                    </label>
                    <Input
                      value={state.user.email}
                      readOnly
                      className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[15px] text-[var(--creed-text-secondary)]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <Separator className="my-10 bg-[var(--creed-border)]" />

          <section id="settings-agent-edits" className="scroll-mt-6">
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Agent edit behaviour
            </h2>
            <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5 pb-4">
              <div className="flex items-center justify-between gap-5 md:items-start">
                <div>
                  <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">
                    All sections
                  </div>
                  <div className="mt-2 hidden max-w-xl text-[14px] leading-7 text-[var(--creed-text-secondary)] md:block">
                    Set every section at once, and the default for new ones.
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
              <DropdownMenu>
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
              </DropdownMenu>
            </div>
            <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
              <div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr] md:items-stretch">
                <div className="flex flex-col gap-4">
                  {aiSettings.aiMode === "credits" ? (
                    allowanceResets ? (
                      <>
                        {/* Recurring allowance: this period's spend / total, plus
                            the roll-over extra credits as a second bucket. */}
                        <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] px-4 py-3">
                          <div className="text-[13px] font-medium text-[var(--creed-text-secondary)]">
                            This month
                          </div>
                          <div className="mt-0.5 text-[30px] font-medium tracking-[-0.03em] text-[var(--creed-text-primary)]">
                            ${allowanceSpentUsd.toFixed(2)}
                            <span className="text-[var(--creed-text-tertiary)]">
                              {" "}
                              / ${allowanceUsd.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        {/* Extra credits: top-ups that roll over and never reset. */}
                        <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] px-4 py-2.5">
                          <div className="text-[13px] font-medium text-[var(--creed-text-secondary)]">
                            Extra credits
                          </div>
                          <div className="mt-0.5 text-[22px] font-medium tracking-[-0.02em] text-[var(--creed-text-primary)]">
                            ${purchasedUsd.toFixed(2)}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] px-4 py-3">
                          <div className="text-[13px] font-medium text-[var(--creed-text-secondary)]">
                            Credits left
                          </div>
                          <div className="mt-0.5 text-[30px] font-medium tracking-[-0.03em] text-[var(--creed-text-primary)]">
                            ${balanceUsd.toFixed(2)}
                          </div>
                        </div>
                        {/* Lifetime-only: total credits spent over all time. */}
                        <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] px-4 py-2.5">
                          <div className="text-[13px] font-medium text-[var(--creed-text-secondary)]">
                            All-time spend
                          </div>
                          <div className="mt-0.5 text-[22px] font-medium tracking-[-0.02em] text-[var(--creed-text-primary)]">
                            ${allTimeSpentUsd.toFixed(2)}
                          </div>
                        </div>
                      </>
                    )
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

                  {aiSettings.aiMode === "credits" ? (
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      <Button
                        variant="ghost"
                        className="rounded-md px-3 text-[var(--creed-text-secondary)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
                        onClick={() => setHistoryOpen(true)}
                      >
                        View history
                      </Button>
                      <div className="flex items-center gap-3">
                        {lowOnAllowance ? (
                          <span className="text-[12px] text-[#B45309] dark:text-[#F5A623]">
                            Running low
                          </span>
                        ) : null}
                        <Button
                          className="rounded-md bg-[var(--creed-accent)] px-4 text-white hover:bg-[var(--creed-accent-hover)]"
                          onClick={() => setAddCreditsOpen(true)}
                        >
                          Add credits
                        </Button>
                      </div>
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
                        className="rounded-md bg-[var(--creed-text-primary)] px-4 text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]"
                        onClick={() => void handleSaveAiSettings()}
                        disabled={!canSaveAiKey}
                      >
                        Save API key
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

            <AddCreditsDialog
              open={addCreditsOpen}
              onOpenChange={setAddCreditsOpen}
              currentBalanceUsd={credits?.balanceUsd ?? 0}
              onToppedUp={() => void refreshCredits()}
            />
            <CreditsHistoryDialog
              open={historyOpen}
              onOpenChange={setHistoryOpen}
              transactions={credits?.transactions ?? []}
              allowanceResets={allowanceResets}
            />
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
                          <button
                            type="button"
                            aria-expanded={expanded}
                            onClick={() =>
                              setExpandedArchived((current) =>
                                current === section.id ? null : section.id
                              )
                            }
                            className="group flex min-w-0 flex-1 items-center gap-2.5 text-left"
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-[3px]"
                              style={{ backgroundColor: accentColorMap[section.accent] }}
                            />
                            <span className="truncate text-[14px] font-medium text-[var(--creed-text-primary)]">
                              {section.name}
                            </span>
                            <ChevronRight
                              className={cn(
                                "h-4 w-4 shrink-0 text-[var(--creed-text-tertiary)] transition duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-[var(--creed-text-primary)]",
                                expanded && "rotate-90"
                              )}
                            />
                          </button>
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
                              className="overflow-hidden"
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
                    downloadFile("creed.md", exportMarkdown(), "text/markdown;charset=utf-8")
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
                  <div className="text-[15px] font-medium text-[#DC2626] dark:text-[#DC2626]">Account Deletion</div>
                  <div className="mt-2 hidden text-[14px] leading-7 text-[#DC2626] dark:text-[#DC2626] md:block">
                    This permanently deletes your Creed, tokens, proposals, activity, and account.
                  </div>
                </div>
                <Button
                  className="rounded-md bg-[#DC2626] px-4 text-white hover:bg-[#B91C1C] hover:text-white"
                  onClick={() => setDeleteOpen(true)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-[#B91C1C]" />
              Delete account
            </DialogTitle>
          </DialogHeader>
          <p className="text-[14px] leading-7 text-[var(--creed-text-secondary)]">
            This deletes your account and everything linked to it. This cannot be undone.
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <Button variant="ghost" className="rounded-md" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[#DC2626] text-white hover:bg-[#B91C1C]"
              onClick={() => void handleDeleteAccount()}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  Deleting
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                </>
              ) : (
                "Confirm delete"
              )}
            </Button>
          </div>
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
          <Plug className="h-4 w-4 md:hidden" />
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
          <Unplug className="h-4 w-4 md:hidden" />
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
          <div className="mt-2 text-[30px] font-medium tracking-[-0.04em] text-[var(--creed-text-primary)]">
            ${total.toFixed(total < 10 ? 2 : 0)}
          </div>
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

type AnimatedIconComponent = ComponentType<{
  ref?: Ref<AnimatedIconHandle>;
  size?: number;
  className?: string;
}>;

const PERMISSION_OPTIONS: Array<{
  value: AgentPermission;
  label: string;
  icon: AnimatedIconComponent;
  color: string;
}> = [
  { value: "hidden", label: "Hidden from agent", icon: EyeOffIcon, color: "#DC2626" },
  { value: "read-only", label: "Read-only", icon: EyeIcon, color: "#EAB308" },
  { value: "propose", label: "Propose (needs approval)", icon: ShieldCheckIcon, color: "#16A34A" },
  { value: "direct", label: "Direct edit", icon: PenToolIcon, color: "#2563EB" },
];

// The global control reuses the same control without the "hidden" option.
const GLOBAL_PERMISSION_OPTIONS = PERMISSION_OPTIONS.filter((option) => option.value !== "hidden");

// One segment. Hover plays the icon's animation through the shared controls
// hook, exactly like AnimatedIconButton elsewhere on the site.
function PermissionSegment({
  option,
  selected,
  layoutGroup,
  muted = false,
  onSelect,
}: {
  option: (typeof PERMISSION_OPTIONS)[number];
  selected: boolean;
  layoutGroup: string;
  muted?: boolean;
  onSelect: () => void;
}) {
  const { iconRef, start, settle } = useAnimatedIconControls();
  const Icon = option.icon;
  return (
    <SimpleTooltip label={option.label}>
      <button
        type="button"
        aria-label={option.label}
        aria-pressed={selected}
        onClick={onSelect}
        // When the control is greyed (mixed state) skip the hover animation so
        // the icons read as inactive.
        onMouseEnter={muted ? undefined : start}
        onMouseLeave={muted ? undefined : settle}
        className="group relative inline-flex h-7 w-7 items-center justify-center rounded-[7px] transition-colors duration-150"
      >
        {selected ? (
          <motion.span
            layoutId={`perm-highlight-${layoutGroup}`}
            className="absolute inset-0 rounded-[7px]"
            style={{ backgroundColor: option.color }}
            transition={{ type: "spring", stiffness: 520, damping: 40 }}
          />
        ) : null}
        <Icon
          ref={iconRef}
          size={14}
          // pointer-events-none so the whole button is the click/hover target,
          // not just the 14px glyph. The icon brightens on hover via group-hover
          // (the button's hover), since its own :hover can't fire with pointer
          // events disabled.
          className={cn(
            "pointer-events-none relative inline-flex h-3.5 w-3.5 items-center justify-center transition-colors duration-150",
            selected
              ? "text-white"
              : muted
                ? "text-[var(--creed-text-tertiary)]"
                : "text-[var(--creed-text-tertiary)] group-hover:text-[var(--creed-text-primary)]"
          )}
        />
      </button>
    </SimpleTooltip>
  );
}

// Compact icon-segmented control. The selected segment fills with its level
// colour and the highlight slides between segments via a shared layoutId.
// `layoutGroup` scopes that animation to one row so highlights don't fly
// between sections.
function SectionPermissionControl({
  value,
  onChange,
  layoutGroup,
  options = PERMISSION_OPTIONS,
}: {
  value: AgentPermission | null;
  onChange: (permission: AgentPermission) => void;
  layoutGroup: string;
  options?: typeof PERMISSION_OPTIONS;
}) {
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-sm border border-[var(--creed-border)] bg-[var(--creed-surface)] p-0.5 transition-opacity duration-150",
        // No shared level (sections differ): grey the control to read as
        // "mixed / not applied", but it stays clickable to set one level.
        value === null && "opacity-45"
      )}
    >
      {options.map((option) => (
        <PermissionSegment
          key={option.value}
          option={option}
          selected={value === option.value}
          layoutGroup={layoutGroup}
          muted={value === null}
          onSelect={() => onChange(option.value)}
        />
      ))}
    </div>
  );
}
