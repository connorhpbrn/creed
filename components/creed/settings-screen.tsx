"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { UserIdentity } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  LoaderCircle,
  Plug,
  Unplug,
} from "lucide-react";
import { AnimatedCheckmark } from "@/components/ui/animated-checkmark";
import { CopyIcon } from "@/components/ui/copy";
import { DownloadIcon } from "@/components/ui/download";
import { RotateCCWIcon } from "@/components/ui/rotate-ccw";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { AnimatedIconButton } from "@/components/creed/animated-icon-action";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/creed/searchable-select";
import { useCreed } from "@/components/creed/creed-provider";
import {
  clearSettingsRepoCache,
  clearSettingsUsageCache,
  hashSettingsMarkdown,
  loadSettingsAiSettings,
  loadSettingsAiModels,
  loadSettingsBranches,
  loadSettingsRepos,
  loadSettingsUsage,
  loadSettingsVersionStatus,
  setCachedSettingsAiSettings,
  type AiUsageRange,
  type AiUsageSummary,
  type BranchOption,
  type PublicAiSettings,
  type RepoOption,
  type VersionControlStatus,
} from "@/components/creed/settings-preload";
import {
  AI_MODEL_CATALOG,
  AI_MODEL_QUALITY_META,
  DEFAULT_AI_MODEL_ID,
  formatModelCost,
  type AiModelCatalogItem,
} from "@/lib/ai/model-catalog";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { IntegrationConnectionStatus } from "@/lib/creed-data";
import { cn } from "@/lib/utils";

const GITHUB_CONNECTED_EVENT = "creed:github-connected";

function looksLikeApiKey(value: string) {
  const trimmed = value.trim();
  return trimmed.length >= 20 && /^[A-Za-z0-9._-]+$/.test(trimmed);
}

function formatGitHubConnectError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Couldn't connect GitHub.";
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  if (
    code === "manual_linking_disabled" ||
    /manual linking is disabled/i.test(message)
  ) {
    return "Enable Manual Linking in Supabase Auth first.";
  }

  return message;
}

function formatGitHubAccessError(message: string) {
  if (/GitHub is not connected/i.test(message)) {
    return "GitHub isn't connected.";
  }

  if (/repo access is missing/i.test(message)) {
    return "GitHub token expired. Reconnect to refresh.";
  }

  return message;
}

function formatGitHubAccessErrorForState(message: string, githubConnected: boolean) {
  if (githubConnected && /GitHub is not connected/i.test(message)) {
    return "GitHub token expired. Reconnect to refresh.";
  }

  return formatGitHubAccessError(message);
}

function maskToken(token: string) {
  if (!token) {
    return token;
  }

  if (token.length <= 12) {
    return `${token.slice(0, 4)}****${token.slice(-2)}`;
  }

  return `${token.slice(0, 8)}********${token.slice(-6)}`;
}

function maskSensitiveText(value: string) {
  return value
    .replace(/token=([A-Za-z0-9_-]+)/g, (_match, token: string) => `token=${maskToken(token)}`)
    .replace(/\bxt_(?:read|proposal|write|mcp)_[A-Za-z0-9_-]+\b/g, (token: string) => maskToken(token));
}

export function SettingsScreen() {
  const router = useRouter();
  const {
    state,
    setDisplayName,
    setRequireApproval,
    setVersionControlConfig,
    exportMarkdown,
    exportActivityJson,
    exportAllDataJson,
    refreshState,
    rotateTokens,
    rotateMcpCredential,
    deleteAccount,
  } = useCreed();
  const [nameDraft, setNameDraft] = useState(state.user.name);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mcpCopied, setMcpCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotatingMcp, setRotatingMcp] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [connectingGitHub, setConnectingGitHub] = useState(false);
  const [disconnectingGitHub, setDisconnectingGitHub] = useState(false);
  const [reposLoading, setReposLoading] = useState(false);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [versionStatus, setVersionStatus] = useState<VersionControlStatus | null>(null);
  const [githubRefreshTick, setGitHubRefreshTick] = useState(0);
  const [aiSettings, setAiSettings] = useState<PublicAiSettings>({
    provider: "openrouter",
    selectedModelId: DEFAULT_AI_MODEL_ID,
    keyStatus: "missing",
  });
  const [aiKeyDraft, setAiKeyDraft] = useState("");
  const [aiSaving, setAiSaving] = useState(false);
  // aiNotice was an inline error string under the API key field. Replaced
  // by toast notifications — see toast.error/.success calls in the handlers.
  const [usageRange, setUsageRange] = useState<AiUsageRange>("7d");
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  const [aiModels, setAiModels] = useState<AiModelCatalogItem[]>(AI_MODEL_CATALOG);
  const canSaveAiKey = looksLikeApiKey(aiKeyDraft) && !aiSaving;

  useEffect(() => {
    if (state.sections.length === 0) {
      router.replace("/onboarding");
    }
  }, [router, state.sections.length]);

  const githubStatus = state.settings.integrations.github.status;
  const githubConnected = githubStatus === "connected";
  const githubDisconnected = githubStatus === "disconnected";
  const selectedRepoFullName =
    state.settings.versionControl.repoOwner && state.settings.versionControl.repoName
      ? `${state.settings.versionControl.repoOwner}/${state.settings.versionControl.repoName}`
      : "";

  useEffect(() => {
    function handleGitHubConnected() {
      setGitHubRefreshTick((current) => current + 1);
    }

    window.addEventListener(GITHUB_CONNECTED_EVENT, handleGitHubConnected);
    return () => {
      window.removeEventListener(GITHUB_CONNECTED_EVENT, handleGitHubConnected);
    };
  }, []);

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
              error instanceof Error ? error.message : "Could not load GitHub repos.",
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
              error instanceof Error ? error.message : "Could not load GitHub branches.",
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
        const [settings, models] = await Promise.all([
          loadSettingsAiSettings(),
          loadSettingsAiModels(),
        ]);
        if (!cancelled && settings) {
          setAiSettings(settings);
        }
        if (!cancelled && models.length) {
          setAiModels(models);
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
        const loadedUsage = await loadSettingsUsage(usageRange);
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
  }, [usageRange, aiSettings.keyStatus]);

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
              error instanceof Error ? error.message : "Could not load GitHub sync status.",
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

  async function copyUrl() {
    await navigator.clipboard.writeText(state.readUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function copyMcpConfig() {
    await navigator.clipboard.writeText(state.mcpConfig);
    setMcpCopied(true);
    window.setTimeout(() => setMcpCopied(false), 1500);
  }

  function downloadFile(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleRotateTokens() {
    try {
      setRotating(true);
      await rotateTokens();
      toast.success("Tokens rotated");
    } catch {
      toast.error("Couldn't rotate tokens");
    } finally {
      setRotating(false);
    }
  }

  async function handleRotateMcpCredential() {
    try {
      setRotatingMcp(true);
      await rotateMcpCredential();
      toast.success("MCP credential rotated");
    } catch {
      toast.error("Couldn't rotate MCP credential");
    } finally {
      setRotatingMcp(false);
    }
  }

  async function handleDeleteAccount() {
    try {
      setDeleting(true);
      await deleteAccount();
    } finally {
      setDeleting(false);
    }
  }

  async function handleConnectGitHub() {
    try {
      setConnectingGitHub(true);
      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=/settings&integration=github`;
      const { error } = await supabase.auth.linkIdentity({
        provider: "github",
        options: {
          redirectTo,
          scopes: "repo read:user",
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      toast.error(formatGitHubConnectError(error));
      setConnectingGitHub(false);
    }
  }

  async function handleDisconnectGitHub() {
    try {
      setDisconnectingGitHub(true);
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.getUserIdentities();

      if (error) {
        throw error;
      }

      const githubIdentity = data.identities.find(
        (identity: UserIdentity) => identity.provider === "github"
      );
      if (githubIdentity) {
        const unlinkResult = await supabase.auth.unlinkIdentity(githubIdentity);
        if (unlinkResult.error) {
          throw unlinkResult.error;
        }
      }

      const response = await fetch("/api/app/github/integration", {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Could not disconnect GitHub.");
      }

      await refreshState();
      toast.success("GitHub disconnected.");
      setRepos([]);
      setBranches([]);
      clearSettingsRepoCache();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect GitHub.");
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
          modelId: aiSettings.selectedModelId,
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
          modelId: aiSettings.selectedModelId,
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
      toast.success("API key cleared");
    } catch {
      toast.error("Couldn't clear API key");
    } finally {
      setAiSaving(false);
    }
  }

  async function handleModelChange(modelId: string) {
    setAiSettings((current) => ({
      ...current,
      selectedModelId: modelId,
    }));

    if (aiSettings.keyStatus !== "valid") {
      return;
    }

    try {
      const response = await fetch("/api/app/ai/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modelId,
        }),
      });
      const payload = (await response.json()) as {
        settings?: PublicAiSettings;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Could not save model.");
      }

      if (payload.settings) {
        setAiSettings(payload.settings);
        setCachedSettingsAiSettings(payload.settings);
      }
    } catch {
      toast.error("Couldn't save model");
    }
  }

  return (
    <>
      <div className="h-full overflow-y-auto bg-[var(--creed-surface)] creed-scrollbar">
        <div className="mx-auto max-w-3xl px-8 py-10 md:px-14">
          <h1 className="font-heading text-[1.75rem] font-medium tracking-[-0.03em] text-[var(--creed-text-primary)]">
            Settings
          </h1>

          <section className="mt-10">
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Profile
            </h2>
            <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <label className="mb-2 block text-[12px] font-medium text-[var(--creed-text-secondary)]">
                    Display name
                  </label>
                  <Input
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    onBlur={() => setDisplayName(nameDraft)}
                    className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[15px]"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[12px] font-medium text-[var(--creed-text-secondary)]">
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
          </section>

          <Separator className="my-10 bg-[var(--creed-border)]" />

          <section>
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Agent edit behaviour
            </h2>
            <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">
                    Require approval for agent edits
                  </div>
                  <div className="mt-2 hidden max-w-xl text-[14px] leading-7 text-[var(--creed-text-secondary)] md:block">
                    When enabled, agent-proposed changes appear in your file for review.
                  </div>
                </div>
                <ApprovalToggle
                  checked={state.settings.requireApproval}
                  onChange={setRequireApproval}
                />
              </div>
            </div>
          </section>

          <Separator className="my-10 bg-[var(--creed-border)]" />

          <section>
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Integrations
            </h2>
            <div className="mt-4 divide-y divide-[var(--creed-border)] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)]">
              <IntegrationRow
                title="Google"
                icon={<GoogleMark className="h-5 w-5" />}
                status="connected"
                statusLabel="Connected"
                secondaryLabel={state.user.email}
                action={null}
              />
              <IntegrationRow
                title="GitHub"
                icon={<GitHubMark className="h-5 w-5 text-[#24292F] dark:text-[var(--creed-text-primary)]" />}
                status={githubStatus}
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
                    <Button
                      aria-label="Disconnect GitHub"
                      title="Disconnect"
                      className="rounded-md bg-[#DC2626] text-white hover:bg-[#B91C1C] hover:text-white max-md:size-9 max-md:p-0 md:px-4 md:text-[13px]"
                      onClick={() => void handleDisconnectGitHub()}
                      disabled={disconnectingGitHub}
                    >
                      {disconnectingGitHub ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Unplug className="h-4 w-4 md:hidden" />
                          <span className="hidden md:inline">Disconnect</span>
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      aria-label="Connect GitHub"
                      title="Connect"
                      className="rounded-md bg-[#10B981] text-white hover:bg-[#059669] hover:text-white max-md:size-9 max-md:p-0 md:px-4 md:text-[13px]"
                      onClick={() => void handleConnectGitHub()}
                      disabled={connectingGitHub}
                    >
                      {connectingGitHub ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Plug className="h-4 w-4 md:hidden" />
                          <span className="hidden md:inline">Connect</span>
                        </>
                      )}
                    </Button>
                  )
                }
              />
            </div>
          </section>

          <Separator className="my-10 bg-[var(--creed-border)]" />

          <section>
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              API keys and models
            </h2>
            <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
              <div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr] md:items-stretch">
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="mb-2 block text-[12px] font-medium text-[var(--creed-text-secondary)]">
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
                  <div>
                    <label className="mb-2 block text-[12px] font-medium text-[var(--creed-text-secondary)]">
                      Model
                    </label>
                    <ModelSelect
                      value={aiSettings.selectedModelId}
                      onChange={(modelId) => void handleModelChange(modelId)}
                      models={aiModels}
                    />
                  </div>
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
                      {aiSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                      Save API key
                    </Button>
                  </div>
                </div>

                <UsageCard usage={usage} range={usageRange} onRangeChange={setUsageRange} />
              </div>
            </div>
          </section>

          <Separator className="my-10 bg-[var(--creed-border)]" />

          <section>
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
                    <label className="mb-2 block text-[12px] font-medium text-[var(--creed-text-secondary)]">
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
                    <label className="mb-2 block text-[12px] font-medium text-[var(--creed-text-secondary)]">
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

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-[var(--creed-text-secondary)]">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--creed-surface-raised)] px-2 py-1 font-mono text-[var(--creed-text-primary)]">
                    creed.md
                  </span>
                  {versionStatus?.remoteMessage ? (
                    <>
                      <span className="text-[var(--creed-text-tertiary)]">·</span>
                      <span>Last commit</span>
                      <span className="truncate font-mono text-[var(--creed-text-primary)]">
                        {versionStatus.remoteMessage}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <Separator className="my-10 bg-[var(--creed-border)]" />

          <section>
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Agent credentials
            </h2>
            <div className="mt-4 space-y-5 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
              {/* MCP first — matches the order on the Connections page so
                  agents-and-MCP-related controls live above the raw API
                  surface for users who think in "agent connections" first. */}
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-medium text-[var(--creed-text-primary)]">
                      Creed MCP
                    </div>
                  </div>
                </div>
                <div className="mb-4 hidden overflow-hidden rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-background)] px-4 py-4 font-mono text-[13px] text-[var(--creed-text-primary)] md:block">
                  <span className="block break-all">
                    {maskSensitiveText(state.mcpConfig)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <AnimatedIconButton
                    icon={CopyIcon}
                    showIcon={!mcpCopied}
                    variant="outline"
                    className="rounded-md border-[var(--creed-border)]"
                    onClick={() => void copyMcpConfig()}
                  >
                    {mcpCopied ? (
                      <>
                        <AnimatedCheckmark className="h-4 w-4" size={16} />
                        Copied
                      </>
                    ) : (
                      "Copy MCP"
                    )}
                  </AnimatedIconButton>
                  <AnimatedIconButton
                    icon={RotateCCWIcon}
                    showIcon={!rotatingMcp}
                    variant="outline"
                    className="rounded-md border-[var(--creed-border)] text-[var(--creed-text-primary)]"
                    onClick={() => void handleRotateMcpCredential()}
                    disabled={rotatingMcp}
                  >
                    {rotatingMcp ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : null}
                    Rotate MCP
                  </AnimatedIconButton>
                  <span className="text-[13px] text-[var(--creed-text-secondary)]">
                    Rotating breaks existing MCP clients.
                  </span>
                </div>
              </div>

              <div className="border-t border-[var(--creed-border)] pt-5">
                <div className="mb-3 text-[14px] font-medium text-[var(--creed-text-primary)]">
                  Creed API
                </div>
                <div className="mb-4 hidden overflow-hidden rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-background)] px-4 py-4 font-mono text-[13px] text-[var(--creed-text-primary)] md:block">
                  <span className="block break-all">
                    {maskSensitiveText(state.readUrl)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <AnimatedIconButton
                    icon={CopyIcon}
                    showIcon={!copied}
                    variant="outline"
                    className="rounded-md border-[var(--creed-border)]"
                    onClick={copyUrl}
                  >
                    {copied ? (
                      <>
                        <AnimatedCheckmark className="h-4 w-4" size={16} />
                        Copied
                      </>
                    ) : (
                      "Copy URL"
                    )}
                  </AnimatedIconButton>
                  <AnimatedIconButton
                    icon={RotateCCWIcon}
                    showIcon={!rotating}
                    variant="outline"
                    className="rounded-md border-[var(--creed-border)] text-[var(--creed-text-primary)]"
                    onClick={() => void handleRotateTokens()}
                    disabled={rotating}
                  >
                    {rotating ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : null}
                    Rotate token
                  </AnimatedIconButton>
                  <span className="text-[13px] text-[var(--creed-text-secondary)]">
                    Rotating your token will break existing agent connections.
                  </span>
                </div>
              </div>
            </div>
          </section>

          <Separator className="my-10 bg-[var(--creed-border)]" />

          <section>
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Data
            </h2>
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
          </section>

          <Separator className="my-10 bg-[var(--creed-border)]" />

          <section>
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
            <DialogTitle className="flex items-center gap-3 text-[18px] font-medium">
              <AlertTriangle className="h-5 w-5 text-[#B91C1C]" />
              Delete account
            </DialogTitle>
          </DialogHeader>
          <p className="text-[14px] leading-7 text-[var(--creed-text-secondary)]">
            This deletes your account and everything attached to it. This cannot be undone.
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
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Deleting
                </>
              ) : (
                "Confirm delete"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function IntegrationRow({
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
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium",
                  isConnected
                    ? "bg-[#ECFDF5] text-[#047857] dark:bg-[#052e1a]/50 dark:text-[#4ade80]"
                    : isDisconnected
                      ? "bg-[#FEF2F2] text-[#B91C1C] dark:bg-[#3F1212]/40 dark:text-[#F87171]"
                      : "bg-[var(--creed-surface-raised)] text-[var(--creed-text-secondary)]"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isConnected
                      ? "bg-[#10B981]"
                      : isDisconnected
                        ? "bg-[#DC2626]"
                        : "bg-[var(--creed-text-tertiary)]"
                  )}
                />
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

function ModelSelect({
  value,
  onChange,
  models,
}: {
  value: string;
  onChange: (value: string) => void;
  models: AiModelCatalogItem[];
}) {
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      placeholder="Choose a model"
      searchPlaceholder="Search models..."
      options={models.map((model) => ({
        key: model.id,
        value: model.id,
        label: model.name,
        description: `${model.provider} · ${AI_MODEL_QUALITY_META[model.quality].label} · ${formatModelCost(model)}`,
        search: `${model.name} ${model.provider} ${model.id} ${AI_MODEL_QUALITY_META[model.quality].label}`,
      }))}
      renderOption={(option) => {
        const model = models.find((item) => item.id === option.value) ?? models[0];
        const quality = AI_MODEL_QUALITY_META[model.quality];

        return (
          <div className="flex min-w-0 items-center gap-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: quality.color }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium text-[var(--creed-text-primary)]">
                {model.name}
              </div>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--creed-text-secondary)]">
                <span>{model.provider}</span>
                <span>·</span>
                <span>{quality.label}</span>
                <span>·</span>
                <span>{formatModelCost(model)}</span>
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}

function UsageCard({
  usage,
  range,
  onRangeChange,
}: {
  usage: AiUsageSummary | null;
  range: AiUsageRange;
  onRangeChange: (range: AiUsageRange) => void;
}) {
  const total = usage?.totalCostUsd ?? 0;
  const maxDay = Math.max(
    0.000001,
    ...(usage?.days.map((day) =>
      day.segments.reduce((sum, segment) => sum + segment.costUsd, 0)
    ) ?? [])
  );

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-background)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-[var(--creed-text-secondary)]">
            Estimated spend
          </div>
          <div className="mt-2 text-[30px] font-medium tracking-[-0.04em] text-[var(--creed-text-primary)]">
            ${total.toFixed(total < 10 ? 2 : 0)}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[12px] text-[var(--creed-text-primary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)]"
            >
              {range}
              <ChevronDown className="h-3.5 w-3.5 text-[var(--creed-text-secondary)]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-28 space-y-1 border-[var(--creed-border)] bg-[var(--creed-surface)] p-1.5"
          >
            {(["24h", "7d", "30d", "1y"] as AiUsageRange[]).map((item) => (
              <DropdownMenuItem
                key={item}
                onSelect={() => onRangeChange(item)}
                className={cn(
                  "flex items-center justify-between gap-5 rounded-lg px-3 py-2 text-[13px]",
                  range === item && "bg-[var(--creed-background)] font-medium"
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

      <motion.div layout className="mt-6 flex h-24 items-end gap-1.5">
        {(usage?.days.length ? usage.days : Array.from({ length: 14 }, (_, index) => ({ date: String(index), segments: [] }))).map((day) => {
          const dayTotal = day.segments.reduce((sum, segment) => sum + segment.costUsd, 0);
          const height = Math.max(6, (dayTotal / maxDay) * 88);
          const hasData = day.segments.length > 0;

          return (
            <UsageBar
              key={day.date}
              day={day}
              height={height}
              dayTotal={dayTotal}
              hasData={hasData}
            />
          );
        })}
      </motion.div>

      {!usage?.days.length ? (
        <div className="mt-5 text-[13px] leading-6 text-[var(--creed-text-secondary)]">
          Spend appears here after Creed uses your key.
        </div>
      ) : null}
    </div>
  );
}

function formatUsageDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function UsageBar({
  day,
  height,
  dayTotal,
  hasData,
}: {
  day: AiUsageSummary["days"][number];
  height: number;
  dayTotal: number;
  hasData: boolean;
}) {
  const [open, setOpen] = useState(false);

  const bar = (
    <div
      className={cn("flex flex-1 items-end", hasData && "cursor-default")}
      onMouseEnter={() => hasData && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => hasData && setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <motion.div
        layout
        className={cn(
          "flex w-full min-w-1 flex-col-reverse overflow-hidden rounded-t-sm bg-[var(--creed-border)]",
          hasData && "transition-opacity hover:opacity-85"
        )}
        initial={false}
        animate={{ height }}
        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      >
        {day.segments.map((segment) => (
          <motion.span
            key={`${day.date}-${segment.modelId}`}
            className="block w-full"
            initial={false}
            animate={{
              height: `${Math.max(8, (segment.costUsd / Math.max(dayTotal, 0.000001)) * 100)}%`,
              backgroundColor: AI_MODEL_QUALITY_META[segment.quality].color,
            }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </motion.div>
    </div>
  );

  if (!hasData) {
    return bar;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{bar}</PopoverTrigger>
      <PopoverContent
        align="center"
        side="top"
        sideOffset={8}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="w-44 rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-2 shadow-[0_8px_24px_rgba(28,28,26,0.10)]"
      >
        <div className="flex items-baseline justify-between gap-2 pb-1.5">
          <span className="text-[11px] font-medium text-[var(--creed-text-primary)]">
            {formatUsageDate(day.date)}
          </span>
          <span className="font-mono text-[11px] font-medium tabular-nums text-[var(--creed-text-primary)]">
            ${dayTotal.toFixed(dayTotal < 10 ? 2 : 0)}
          </span>
        </div>
        <div className="space-y-1 border-t border-[var(--creed-border)] pt-1.5">
          {[...day.segments]
            .sort((a, b) => b.costUsd - a.costUsd)
            .map((segment) => (
              <div
                key={`${day.date}-${segment.modelId}`}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="inline-flex min-w-0 items-center gap-1.5 text-[var(--creed-text-primary)]">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: AI_MODEL_QUALITY_META[segment.quality].color }}
                  />
                  <span className="truncate">{segment.modelName}</span>
                </span>
                <span className="font-mono tabular-nums text-[var(--creed-text-secondary)]">
                  ${segment.costUsd.toFixed(2)}
                </span>
              </div>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M21.8 12.23c0-.7-.06-1.22-.2-1.76H12v3.33h5.64c-.11.83-.7 2.08-2 2.92l-.02.11 2.72 2.11.19.02c1.75-1.61 2.77-3.98 2.77-6.73Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.76 0 5.08-.91 6.78-2.47l-3.23-2.5c-.86.6-2.01 1.02-3.55 1.02-2.7 0-4.99-1.78-5.81-4.24l-.1.01-2.82 2.19-.03.1A10.24 10.24 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.19 13.81A6.15 6.15 0 0 1 5.87 12c0-.63.11-1.24.3-1.81l-.01-.12-2.86-2.22-.09.04A10.26 10.26 0 0 0 2 12c0 1.65.39 3.2 1.08 4.55l3.11-2.74Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.95c1.94 0 3.25.84 4 1.54l2.92-2.85C17.07 2.91 14.76 2 12 2a10.24 10.24 0 0 0-8.79 4.89l3.1 2.4C7.12 7.73 9.31 5.95 12 5.95Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.66.5 12.02c0 5.09 3.29 9.4 7.86 10.93.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.69-1.28-1.69-1.04-.71.08-.69.08-.69 1.15.08 1.75 1.18 1.75 1.18 1.02 1.76 2.68 1.25 3.34.96.1-.74.4-1.25.72-1.53-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.17a11 11 0 0 1 5.78 0c2.2-1.48 3.16-1.17 3.16-1.17.63 1.58.24 2.75.12 3.04.74.8 1.18 1.82 1.18 3.07 0 4.41-2.69 5.39-5.26 5.67.41.36.77 1.06.77 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.68.8.56A11.53 11.53 0 0 0 23.5 12C23.5 5.66 18.35.5 12 .5Z" />
    </svg>
  );
}

function ApprovalToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors duration-200",
        checked
          ? "border-[#10B981] bg-[#10B981]"
          : "border-[#DC2626] bg-[#DC2626]"
      )}
    >
      <span
        className={cn(
          "absolute left-1 h-6 w-6 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.22)] transition-transform duration-200",
          checked && "translate-x-6"
        )}
      />
    </button>
  );
}
