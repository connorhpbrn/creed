"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { UserIdentity } from "@supabase/supabase-js";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  LoaderCircle,
  PenTool,
  Plug,
  ShieldCheck,
  Unplug,
} from "@/components/ui/phosphor-icons";
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
  type AiModelQuality,
} from "@/lib/ai/model-catalog";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  accentColorMap,
  type AgentPermission,
  type IntegrationConnectionStatus,
} from "@/lib/creed-data";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/creed/rich-text-editor";

const GITHUB_CONNECTED_EVENT = "creed:github-connected";

function forceByokSettings(settings: PublicAiSettings): PublicAiSettings {
  return { ...settings, aiMode: "byok" };
}

function looksLikeApiKey(value: string) {
  const trimmed = value.trim();
  return trimmed.length >= 20 && /^[A-Za-z0-9._-]+$/.test(trimmed);
}

function formatGitHubConnectError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Couldn't connect GitHub";
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  if (
    code === "manual_linking_disabled" ||
    /manual linking is disabled/i.test(message)
  ) {
    return "Enable Manual Linking in Supabase Auth first";
  }

  return message;
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

// "x" is Supabase's X / Twitter (OAuth 2.0) provider; a linked identity may
// still report the legacy "twitter" provider string, so detection matches both.
type LoginProvider = "google" | "x";

const LOGIN_PROVIDER_LABEL: Record<LoginProvider, string> = {
  google: "Google",
  x: "X",
};

function matchesProvider(identityProvider: string, provider: LoginProvider) {
  if (provider === "x") return identityProvider === "x" || identityProvider === "twitter";
  return identityProvider === provider;
}

// Providers that count as a way to sign in. A user must keep at least one, so
// disconnecting the last sign-in method is blocked.
const SIGN_IN_PROVIDERS = ["google", "x", "twitter", "email"];

function identityAccountLabel(identity: UserIdentity | null): string | undefined {
  const data = (identity?.identity_data ?? {}) as Record<string, unknown>;
  for (const key of ["email", "user_name", "preferred_username", "name"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function normalizeIdentityEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function identityEmail(identity: UserIdentity | null): string | undefined {
  const data = (identity?.identity_data ?? {}) as Record<string, unknown>;
  const value = data.email;
  return typeof value === "string" ? value : undefined;
}

export function SettingsScreen() {
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
    restoreSection,
    deleteSection,
  } = useCreed();
  const [nameDraft, setNameDraft] = useState(state.user.name);
  const [archivedDeleteTarget, setArchivedDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [expandedArchived, setExpandedArchived] = useState<string | null>(null);
  const archivedSections = state.sections.filter((section) => section.archived);
  const [permsOpen, setPermsOpen] = useState(false);
  const [connectingGitHub, setConnectingGitHub] = useState(false);
  const [disconnectingGitHub, setDisconnectingGitHub] = useState(false);
  // Login identities (Google + X) shown in Integrations, loaded live from
  // Supabase so connect / disconnect reflects the real account state.
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null);
  const [linkingProvider, setLinkingProvider] = useState<LoginProvider | null>(null);
  const [unlinkingProvider, setUnlinkingProvider] = useState<LoginProvider | null>(null);
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
    aiMode: "byok",
  });
  const [aiKeyDraft, setAiKeyDraft] = useState("");
  const [aiSaving, setAiSaving] = useState(false);
  // aiNotice was an inline error string under the API key field. Replaced
  // by toast notifications - see toast.error/.success calls in the handlers.
  const [usageRange, setUsageRange] = useState<AiUsageRange>("7d");
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  const [aiModels, setAiModels] = useState<AiModelCatalogItem[]>(AI_MODEL_CATALOG);
  const canSaveAiKey = looksLikeApiKey(aiKeyDraft) && !aiSaving;

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

  const githubStatus = state.settings.integrations.github.status;
  const githubConnected = githubStatus === "connected";
  const githubDisconnected = githubStatus === "disconnected";
  const selectedRepoFullName =
    state.settings.versionControl.repoOwner && state.settings.versionControl.repoName
      ? `${state.settings.versionControl.repoOwner}/${state.settings.versionControl.repoName}`
      : "";
  const latestCommitUrl =
    selectedRepoFullName && versionStatus?.remoteSha
      ? `https://github.com/${selectedRepoFullName}/commit/${versionStatus.remoteSha}`
      : null;

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
        const [settings, models] = await Promise.all([
          loadSettingsAiSettings(),
          loadSettingsAiModels(),
        ]);
        if (!cancelled && settings) {
          setAiSettings(forceByokSettings(settings));
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
        const loadedUsage = await loadSettingsUsage(usageRange, "byok");
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

  // Load the user's linked identities so the Google / X rows reflect the real
  // account state, and refresh whenever auth changes (e.g. after a link).
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;

    async function load() {
      const [{ data: userData }, { data, error }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getUserIdentities(),
      ]);
      if (!active) return;

      const nextIdentities = (error ? [] : data.identities ?? []) as UserIdentity[];
      const userEmail = normalizeIdentityEmail(userData.user?.email);
      const google = nextIdentities.find((identity) => identity.provider === "google") ?? null;
      const googleEmail = normalizeIdentityEmail(identityEmail(google));
      if (google && userEmail && googleEmail && userEmail !== googleEmail) {
        await supabase.auth.unlinkIdentity(google);
        if (!active) return;
        toast.error("Google account email must match your Creed email.");
        setIdentities(nextIdentities.filter((identity) => identity.id !== google.id));
        return;
      }

      setIdentities(nextIdentities);
    }

    void load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void load();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const googleIdentity = identities?.find((identity) => identity.provider === "google") ?? null;
  const xIdentity = identities?.find((identity) => matchesProvider(identity.provider, "x")) ?? null;
  const signInMethodCount = (identities ?? []).filter((identity) =>
    SIGN_IN_PROVIDERS.includes(identity.provider)
  ).length;

  async function handleConnectIdentity(provider: LoginProvider) {
    try {
      setLinkingProvider(provider);
      const supabase = getSupabaseBrowserClient();
      if (provider === "google") {
        const { data } = await supabase.auth.getUser();
        const callbackUrl = new URL("/auth/callback", window.location.origin);
        callbackUrl.searchParams.set("next", "/settings");
        if (data.user?.email) {
          callbackUrl.searchParams.set("expected_email", data.user.email);
        }

        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: callbackUrl.toString() },
        });
        if (error) throw error;
        return;
      }

      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback?next=/settings` },
      });
      if (error) throw error;
      // On success the browser is navigating to the provider; nothing else runs.
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `Couldn't connect ${LOGIN_PROVIDER_LABEL[provider]}`
      );
      setLinkingProvider(null);
    }
  }

  async function handleDisconnectIdentity(provider: LoginProvider) {
    const label = LOGIN_PROVIDER_LABEL[provider];
    const identity = identities?.find((entry) => matchesProvider(entry.provider, provider)) ?? null;
    if (!identity) return;
    if (signInMethodCount <= 1) {
      toast.error("Add another sign-in method before disconnecting this one.");
      return;
    }
    try {
      setUnlinkingProvider(provider);
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (error) throw error;
      const { data } = await supabase.auth.getUserIdentities();
      setIdentities(data?.identities ?? []);
      toast.success(`${label} disconnected`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Couldn't disconnect ${label}`);
    } finally {
      setUnlinkingProvider(null);
    }
  }

  async function handleConnectGitHub() {
    try {
      setConnectingGitHub(true);
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", "/settings");
      callbackUrl.searchParams.set("integration", "github");
      if (data.user?.email) {
        callbackUrl.searchParams.set("expected_email", data.user.email);
      }

      const { error } = await supabase.auth.linkIdentity({
        provider: "github",
        options: {
          redirectTo: callbackUrl.toString(),
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
        throw new Error(payload.error || "Could not disconnect GitHub");
      }

      await refreshState();
      toast.success("GitHub disconnected");
      setRepos([]);
      setBranches([]);
      clearSettingsRepoCache();
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
          modelId: aiSettings.selectedModelId,
          aiMode: "byok",
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
        const settings = forceByokSettings(payload.settings);
        setAiSettings(settings);
        setCachedSettingsAiSettings(settings);
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
          aiMode: "byok",
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
        const settings = forceByokSettings(payload.settings);
        setAiSettings(settings);
        setCachedSettingsAiSettings(settings);
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
          aiMode: "byok",
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
        const settings = forceByokSettings(payload.settings);
        setAiSettings(settings);
        setCachedSettingsAiSettings(settings);
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
                  <label className="mb-2 block text-[14px] font-medium text-[var(--creed-text-secondary)]">
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
                  <label className="mb-2 block text-[14px] font-medium text-[var(--creed-text-secondary)]">
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
                            className="flex items-center justify-between gap-3 rounded-[10px] py-1.5"
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

          <section>
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Integrations
            </h2>
            <div className="mt-4 divide-y divide-[var(--creed-border)] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)]">
              <IntegrationRow
                title="Google"
                icon={<GoogleMark className="h-7 w-7" />}
                status={identities === null ? undefined : googleIdentity ? "connected" : "not-connected"}
                statusLabel={
                  identities === null ? undefined : googleIdentity ? "Connected" : "Not connected"
                }
                secondaryLabel={googleIdentity ? identityAccountLabel(googleIdentity) : undefined}
                action={
                  <IdentityAction
                    loading={identities === null}
                    connected={Boolean(googleIdentity)}
                    label="Google"
                    pending={linkingProvider === "google" || unlinkingProvider === "google"}
                    onConnect={() => void handleConnectIdentity("google")}
                    onDisconnect={() => void handleDisconnectIdentity("google")}
                  />
                }
              />
              <IntegrationRow
                title="X"
                icon={<XMark className="h-6 w-6 text-[#0F1419] dark:text-[var(--creed-text-primary)]" />}
                status={identities === null ? undefined : xIdentity ? "connected" : "not-connected"}
                statusLabel={
                  identities === null ? undefined : xIdentity ? "Connected" : "Not connected"
                }
                secondaryLabel={xIdentity ? identityAccountLabel(xIdentity) : undefined}
                action={
                  <IdentityAction
                    loading={identities === null}
                    connected={Boolean(xIdentity)}
                    label="X"
                    pending={linkingProvider === "x" || unlinkingProvider === "x"}
                    onConnect={() => void handleConnectIdentity("x")}
                    onDisconnect={() => void handleDisconnectIdentity("x")}
                  />
                }
              />
              <IntegrationRow
                title="GitHub"
                icon={<GitHubMark className="h-7 w-7 text-[#24292F] dark:text-[var(--creed-text-primary)]" />}
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
                    <DisconnectButton
                      label="GitHub"
                      loading={disconnectingGitHub}
                      onClick={() => void handleDisconnectGitHub()}
                    />
                  ) : (
                    <ConnectButton
                      label="GitHub"
                      loading={connectingGitHub}
                      onClick={() => void handleConnectGitHub()}
                    />
                  )
                }
              />
            </div>
          </section>

          <Separator className="my-10 hidden bg-[var(--creed-border)]" />

          <section className="hidden">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
                Models
              </h2>
            </div>
            <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
              <div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr] md:items-stretch">
                <div className="flex flex-col gap-4">
                  <div>
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

                  <div>
                    <label className="mb-2 block text-[13px] font-medium text-[var(--creed-text-secondary)]">
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
                      Save API key
                      {aiSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
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

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-[var(--creed-text-secondary)]">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--creed-surface-raised)] px-2 py-1 font-mono text-[var(--creed-text-primary)]">
                    creed.md
                  </span>
                  {versionStatus?.remoteMessage ? (
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <span aria-hidden className="shrink-0 text-[var(--creed-text-tertiary)]">
                        ·
                      </span>
                      {latestCommitUrl ? (
                        <a
                          href={latestCommitUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={versionStatus.remoteMessage}
                          className="truncate font-medium text-[#2563EB] transition-colors hover:text-[#1D4ED8]"
                        >
                          {versionStatus.remoteMessage}
                        </a>
                      ) : (
                        <span className="truncate text-[var(--creed-text-secondary)]">
                          {versionStatus.remoteMessage}
                        </span>
                      )}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <Separator className="my-10 bg-[var(--creed-border)]" />

          <section>
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

          <section>
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Data
            </h2>
            <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
              <p className="text-[14px] leading-7 text-[var(--creed-text-secondary)]">
                <span className="inline-flex items-center rounded-md bg-[var(--creed-surface-raised)] px-2 py-0.5 align-middle font-mono text-[13px] text-[var(--creed-text-primary)]">
                  {dataStats.wordCount.toLocaleString()}
                </span>{" "}
                {dataStats.wordCount === 1 ? "word" : "words"} across{" "}
                <span className="inline-flex items-center rounded-md bg-[var(--creed-surface-raised)] px-2 py-0.5 align-middle font-mono text-[13px] text-[var(--creed-text-primary)]">
                  {dataStats.sectionCount.toLocaleString()}
                </span>{" "}
                {dataStats.sectionCount === 1 ? "section" : "sections"}.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <AnimatedIconButton
                  icon={Download}
                  variant="outline"
                  className="rounded-md border-[var(--creed-border)]"
                  onClick={() =>
                    downloadFile("creed.md", exportMarkdown(), "text/markdown;charset=utf-8")
                  }
                >
                  Export Creed as markdown
                </AnimatedIconButton>
                <AnimatedIconButton
                  icon={Download}
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
                  icon={Download}
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

        </div>
      </div>

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

function ConnectButton({
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

function DisconnectButton({
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

// Connect / disconnect control for a login identity (Google, X). Shows a quiet
// spinner while identities are still loading so the row never flips state.
function IdentityAction({
  loading,
  connected,
  label,
  pending,
  onConnect,
  onDisconnect,
}: {
  loading: boolean;
  connected: boolean;
  label: string;
  pending: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (loading) {
    return <LoaderCircle className="h-4 w-4 animate-spin text-[var(--creed-text-tertiary)]" />;
  }
  return connected ? (
    <DisconnectButton label={label} loading={pending} onClick={onDisconnect} />
  ) : (
    <ConnectButton label={label} loading={pending} onClick={onConnect} />
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
        description: `${model.provider} · ${AI_MODEL_QUALITY_META[model.quality].label} · ${formatModelCost(model, 1)}`,
        search: `${model.name} ${model.provider} ${model.id} ${AI_MODEL_QUALITY_META[model.quality].label}`,
      }))}
      renderOption={(option) => {
        const model = models.find((item) => item.id === option.value) ?? models[0];
        const quality = AI_MODEL_QUALITY_META[model.quality];

        return (
          <div className="flex min-w-0 items-center gap-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: quality.color }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium text-[var(--creed-text-primary)]">
                {model.name}
              </div>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--creed-text-secondary)]">
                <span>{model.provider}</span>
                <span>·</span>
                <span>{quality.label}</span>
                <span>·</span>
                <span>{formatModelCost(model, 1)}</span>
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

  // Quality tiers present in the range, in fixed order. Each day's cost is
  // stacked by tier - same recharts pattern as the /connections charts.
  const qualityOrder: AiModelQuality[] = ["excellent", "good", "weak", "uncertain"];
  const present = qualityOrder.filter((quality) =>
    (usage?.days ?? []).some((day) => day.segments.some((s) => s.quality === quality && s.costUsd > 0))
  );
  const chartData = (usage?.days ?? [])
    .map((day) => {
      const row: Record<string, number | string> = { date: day.date };
      for (const quality of present) row[quality] = 0;
      for (const segment of day.segments) {
        if (present.includes(segment.quality)) {
          row[segment.quality] = (Number(row[segment.quality]) || 0) + segment.costUsd;
        }
      }
      return row;
    })
    // Only plot days that actually have spend.
    .filter((row) => present.reduce((sum, quality) => sum + Number(row[quality] ?? 0), 0) > 0);
  const chartConfig: ChartConfig = {};
  present.forEach((quality) => {
    chartConfig[quality] = { label: AI_MODEL_QUALITY_META[quality].label, color: AI_MODEL_QUALITY_META[quality].color };
  });

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4">
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
                  {present.map((quality) => (
                    <Bar
                      key={quality}
                      dataKey={quality}
                      stackId="cost"
                      fill={`var(--color-${quality})`}
                      shape={<StackTopBar orderedKeys={present} dataKey={quality} />}
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

function XMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
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

type AnimatedIconComponent = ComponentType<{
  size?: number;
  className?: string;
}>;

const PERMISSION_OPTIONS: Array<{
  value: AgentPermission;
  label: string;
  icon: AnimatedIconComponent;
  color: string;
}> = [
  { value: "hidden", label: "Hidden from agent", icon: EyeOff, color: "#DC2626" },
  { value: "read-only", label: "Read-only", icon: Eye, color: "#EAB308" },
  { value: "propose", label: "Propose (needs approval)", icon: ShieldCheck, color: "#16A34A" },
  { value: "direct", label: "Direct edit", icon: PenTool, color: "#2563EB" },
];

// The global control reuses the same control without the "hidden" option.
const GLOBAL_PERMISSION_OPTIONS = PERMISSION_OPTIONS.filter((option) => option.value !== "hidden");

// One compact segment in the permission control.
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
  const Icon = option.icon;
  return (
    <SimpleTooltip label={option.label}>
      <button
        type="button"
        aria-label={option.label}
        aria-pressed={selected}
        onClick={onSelect}
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
        "inline-flex shrink-0 items-center gap-0.5 rounded-[10px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-0.5 transition-opacity duration-150",
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
