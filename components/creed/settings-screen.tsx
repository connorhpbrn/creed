"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { UserIdentity } from "@supabase/supabase-js";
import {
  ChevronRight,
  EyeOff,
  FileText,
  Folder,
  LoaderCircle,
  PenTool,
  Plug,
  ShieldCheck,
  Unplug,
} from "@/components/ui/phosphor-icons";
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
import { oauthErrorMessage } from "@/components/auth/use-oauth-sign-in";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/creed/searchable-select";
import { useCreed } from "@/components/creed/creed-provider";
import {
  clearSettingsRepoCache,
  hashSettingsMarkdown,
  loadSettingsBranches,
  loadSettingsRepos,
  loadSettingsVersionStatus,
  type BranchOption,
  type RepoOption,
  type VersionControlStatus,
} from "@/components/creed/settings-preload";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  accentColorMap,
  type IntegrationConnectionStatus,
} from "@/lib/creed-data";
import type { SharedDocumentFolder, SharedDocumentSummary } from "@/lib/shared-documents";
import type { EditPolicyValue } from "@/lib/workspace-settings";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/creed/rich-text-editor";

const GITHUB_CONNECTED_EVENT = "creed:github-connected";

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
    setVersionControlConfig,
    exportMarkdown,
    refreshState,
    restoreSection,
    deleteSection,
  } = useCreed();
  const [nameDraft, setNameDraft] = useState(state.user.name);
  const [archivedDeleteTarget, setArchivedDeleteTarget] = useState<{
    kind: "section" | "document" | "folder";
    id: string;
    name: string;
  } | null>(null);
  const [archivedDeleteAllOpen, setArchivedDeleteAllOpen] = useState(false);
  const [expandedArchived, setExpandedArchived] = useState<string | null>(null);
  const archivedSections = state.sections.filter((section) => section.archived);
  const [archivedDocuments, setArchivedDocuments] = useState<SharedDocumentSummary[]>([]);
  const [archivedFolders, setArchivedFolders] = useState<SharedDocumentFolder[]>([]);
  const [archivedItemsLoading, setArchivedItemsLoading] = useState(true);
  const [busyArchivedItemId, setBusyArchivedItemId] = useState<string | null>(null);
  const [deletingAllArchived, setDeletingAllArchived] = useState(false);
  const [connectingGitHub, setConnectingGitHub] = useState(false);
  const [editPolicy, setEditPolicy] = useState<{ human: EditPolicyValue; agent: EditPolicyValue }>({
    human: "propose",
    agent: "propose",
  });
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

  const loadArchivedItems = useCallback(async () => {
    setArchivedItemsLoading(true);
    try {
      const [docsRes, foldersRes] = await Promise.all([
        fetch("/api/app/documents?archived=true"),
        fetch("/api/app/document-folders?archived=true"),
      ]);
      if (docsRes.ok) {
        const payload = (await docsRes.json()) as { documents?: SharedDocumentSummary[] };
        setArchivedDocuments(payload.documents ?? []);
      }
      if (foldersRes.ok) {
        const payload = (await foldersRes.json()) as { folders?: SharedDocumentFolder[] };
        setArchivedFolders(payload.folders ?? []);
      }
    } catch {
      // Non-fatal: the card just shows nothing rather than blocking settings.
    } finally {
      setArchivedItemsLoading(false);
    }
  }, []);

  // Archived documents and folders live in Supabase (not in Creed state), so
  // the Archived card loads them separately and manages restore / delete here.
  useEffect(() => {
    void loadArchivedItems();
  }, [loadArchivedItems]);

  async function restoreArchivedDocument(id: string, title: string) {
    if (busyArchivedItemId) return;
    setBusyArchivedItemId(id);
    try {
      const res = await fetch(`/api/app/documents/${encodeURIComponent(id)}/restore`, {
        method: "POST",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Could not restore document.");
      }
      setArchivedDocuments((rows) => rows.filter((row) => row.id !== id));
      toast.success(`Restored "${title}"`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore document.");
    } finally {
      setBusyArchivedItemId(null);
    }
  }

  async function restoreArchivedFolder(id: string, name: string) {
    if (busyArchivedItemId) return;
    setBusyArchivedItemId(id);
    try {
      const res = await fetch(`/api/app/document-folders/${encodeURIComponent(id)}/restore`, {
        method: "POST",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Could not restore folder.");
      }
      setArchivedFolders((rows) => rows.filter((row) => row.id !== id));
      toast.success(`Restored "${name}"`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore folder.");
    } finally {
      setBusyArchivedItemId(null);
    }
  }

  async function deleteArchivedDocument(id: string) {
    setBusyArchivedItemId(id);
    try {
      const res = await fetch(`/api/app/documents/${encodeURIComponent(id)}?permanent=true`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        if (res.status === 404) {
          await loadArchivedItems();
          toast.success("Archived list refreshed");
          return;
        }
        throw new Error(payload?.error || "Could not delete document.");
      }
      setArchivedDocuments((rows) => rows.filter((row) => row.id !== id));
      toast.success("Document deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete document.");
    } finally {
      setBusyArchivedItemId(null);
    }
  }

  async function deleteArchivedFolder(id: string) {
    setBusyArchivedItemId(id);
    try {
      const res = await fetch(`/api/app/document-folders/${encodeURIComponent(id)}?permanent=true`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        if (res.status === 404) {
          await loadArchivedItems();
          toast.success("Archived list refreshed");
          return;
        }
        throw new Error(payload?.error || "Could not delete folder.");
      }
      await loadArchivedItems();
      toast.success("Folder deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete folder.");
    } finally {
      setBusyArchivedItemId(null);
    }
  }

  function confirmDeleteArchived() {
    if (!archivedDeleteTarget) return;
    const { kind, id } = archivedDeleteTarget;
    if (kind === "section") deleteSection(id);
    else if (kind === "document") void deleteArchivedDocument(id);
    else void deleteArchivedFolder(id);
    setArchivedDeleteTarget(null);
  }

  async function deleteArchivedDocumentPermanently(id: string) {
    const res = await fetch(`/api/app/documents/${encodeURIComponent(id)}?permanent=true`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || "Could not delete document.");
    }
  }

  async function deleteArchivedFolderPermanently(id: string) {
    const res = await fetch(`/api/app/document-folders/${encodeURIComponent(id)}?permanent=true`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || "Could not delete folder.");
    }
  }

  async function confirmDeleteAllArchived() {
    if (deletingAllArchived) return;
    setDeletingAllArchived(true);
    try {
      for (const section of archivedSections) {
        deleteSection(section.id);
      }
      for (const document of archivedDocuments) {
        await deleteArchivedDocumentPermanently(document.id);
      }
      const foldersDeepestFirst = [...archivedFolders].sort(
        (a, b) => b.path.split("/").length - a.path.split("/").length
      );
      for (const folder of foldersDeepestFirst) {
        await deleteArchivedFolderPermanently(folder.id);
      }
      setArchivedDeleteAllOpen(false);
      setArchivedDocuments([]);
      setArchivedFolders([]);
      await loadArchivedItems();
      toast.success("Archived items deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete archived items.");
      await loadArchivedItems();
    } finally {
      setDeletingAllArchived(false);
    }
  }

  const hasArchivedItems =
    archivedSections.length > 0 || archivedDocuments.length > 0 || archivedFolders.length > 0;

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

        const { error } = await supabase.auth.linkIdentity({
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
        provider === "google"
          ? oauthErrorMessage(error, `Couldn't connect ${LOGIN_PROVIDER_LABEL[provider]}`)
          : error instanceof Error ? error.message : `Couldn't connect ${LOGIN_PROVIDER_LABEL[provider]}`
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/app/workspace-settings", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          policy?: { human: EditPolicyValue; agent: EditPolicyValue };
        };
        if (!cancelled && payload.policy) {
          setEditPolicy(payload.policy);
        }
      } catch {
        // Non-fatal: the control stays disabled until settings load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveEditPolicy(actor: "human" | "agent", value: EditPolicyValue) {
    const previous = editPolicy;
    setEditPolicy((current) => ({ ...current, [actor]: value }));
    try {
      const response = await fetch("/api/app/workspace-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [actor]: value }),
      });
      if (!response.ok) {
        throw new Error("save failed");
      }
      const payload = (await response.json()) as {
        policy?: { human: EditPolicyValue; agent: EditPolicyValue };
      };
      if (payload.policy) {
        setEditPolicy(payload.policy);
      }
    } catch {
      setEditPolicy(previous);
      toast.error("Couldn't save the edit policy.");
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
              Edit policy
            </h2>
            <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
              <div className="flex items-center justify-between gap-5 md:items-start">
                <div>
                  <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">
                    People
                  </div>
                  <div className="mt-2 hidden max-w-xl text-[14px] leading-7 text-[var(--creed-text-secondary)] md:block">
                    How members&apos; document edits are handled: not at all, as proposals that need
                    approval, or applied directly.
                  </div>
                </div>
                <EditPolicyControl
                  value={editPolicy.human}
                  layoutGroup="edit-policy-human"
                  onChange={(value) => void saveEditPolicy("human", value)}
                />
              </div>

              <div className="mt-5 flex items-center justify-between gap-5 border-t border-[var(--creed-border)] pt-5 md:items-start">
                <div>
                  <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">
                    Agents
                  </div>
                  <div className="mt-2 hidden max-w-xl text-[14px] leading-7 text-[var(--creed-text-secondary)] md:block">
                    How AI and connected agents&apos; document edits are handled. Set to Propose so
                    agent changes wait for a member to approve them.
                  </div>
                </div>
                <EditPolicyControl
                  value={editPolicy.agent}
                  layoutGroup="edit-policy-agent"
                  onChange={(value) => void saveEditPolicy("agent", value)}
                />
              </div>
            </div>
          </section>

          <Separator className="my-10 hidden bg-[var(--creed-border)]" />

          <section className="hidden">
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
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
                Archived
              </h2>
              {hasArchivedItems ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-md border-[#FCA5A5] text-[#DC2626] hover:border-[#F87171] hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
                  disabled={deletingAllArchived}
                  onClick={() => setArchivedDeleteAllOpen(true)}
                >
                  {deletingAllArchived ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    "Delete all"
                  )}
                </Button>
              ) : null}
            </div>
            <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
              {!hasArchivedItems && !archivedItemsLoading ? (
                <p className="text-[14px] leading-7 text-[var(--creed-text-secondary)]">
                  Nothing archived. Archived sections, documents, and folders show
                  up here, ready to restore.
                </p>
              ) : (
                <div className="space-y-6">
                  {archivedSections.length > 0 && (
                    <div className="space-y-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--creed-text-tertiary)]">
                        Sections
                      </p>
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
                                setArchivedDeleteTarget({
                                  kind: "section",
                                  id: section.id,
                                  name: section.name,
                                })
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
                  {archivedDocuments.length > 0 && (
                    <div className="space-y-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--creed-text-tertiary)]">
                        Documents
                      </p>
                      {archivedDocuments.map((document) => (
                        <div
                          key={document.id}
                          className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--creed-border)] px-4 py-3"
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-2.5">
                            <FileText
                              className="h-4 w-4 shrink-0 text-[var(--creed-text-tertiary)]"
                              strokeWidth={1.8}
                            />
                            <span className="truncate text-[14px] font-medium text-[var(--creed-text-primary)]">
                              {document.title}
                            </span>
                            {document.path ? (
                              <span className="truncate text-[12px] text-[var(--creed-text-tertiary)]">
                                {document.path}
                              </span>
                            ) : null}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              variant="outline"
                              className="rounded-md border-[var(--creed-border)]"
                              disabled={busyArchivedItemId === document.id}
                              onClick={() => void restoreArchivedDocument(document.id, document.title)}
                            >
                              {busyArchivedItemId === document.id ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                "Restore"
                              )}
                            </Button>
                            <Button
                              className="rounded-md bg-[#DC2626] text-white hover:bg-[#B91C1C] hover:text-white"
                              disabled={busyArchivedItemId === document.id}
                              onClick={() =>
                                setArchivedDeleteTarget({
                                  kind: "document",
                                  id: document.id,
                                  name: document.title,
                                })
                              }
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {archivedFolders.length > 0 && (
                    <div className="space-y-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--creed-text-tertiary)]">
                        Folders
                      </p>
                      {archivedFolders.map((folder) => (
                        <div
                          key={folder.id}
                          className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--creed-border)] px-4 py-3"
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-2.5">
                            <Folder
                              className="h-4 w-4 shrink-0 text-[var(--creed-text-tertiary)]"
                              strokeWidth={1.8}
                            />
                            <span className="truncate text-[14px] font-medium text-[var(--creed-text-primary)]">
                              {folder.name}
                            </span>
                            {folder.path ? (
                              <span className="truncate text-[12px] text-[var(--creed-text-tertiary)]">
                                {folder.path}
                              </span>
                            ) : null}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              variant="outline"
                              className="rounded-md border-[var(--creed-border)]"
                              disabled={busyArchivedItemId === folder.id}
                              onClick={() => void restoreArchivedFolder(folder.id, folder.name)}
                            >
                              {busyArchivedItemId === folder.id ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                "Restore"
                              )}
                            </Button>
                            <Button
                              className="rounded-md bg-[#DC2626] text-white hover:bg-[#B91C1C] hover:text-white"
                              disabled={busyArchivedItemId === folder.id}
                              onClick={() =>
                                setArchivedDeleteTarget({
                                  kind: "folder",
                                  id: folder.id,
                                  name: folder.name,
                                })
                              }
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
            <DialogTitle>
              {archivedDeleteTarget?.kind === "document"
                ? "Delete archived document"
                : archivedDeleteTarget?.kind === "folder"
                  ? "Delete archived folder"
                  : "Delete archived section"}
            </DialogTitle>
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
              onClick={confirmDeleteArchived}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={archivedDeleteAllOpen}
        onOpenChange={(open) => {
          if (!open && !deletingAllArchived) setArchivedDeleteAllOpen(false);
        }}
      >
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>Delete all archived items</DialogTitle>
            <DialogDescription>
              This permanently deletes every archived section, document, and folder. This
              can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button
              variant="ghost"
              className="rounded-md"
              disabled={deletingAllArchived}
              onClick={() => setArchivedDeleteAllOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[#DC2626] px-4 text-white hover:bg-[#B91C1C] hover:text-white"
              disabled={deletingAllArchived}
              onClick={() => void confirmDeleteAllArchived()}
            >
              {deletingAllArchived ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Deleting
                </>
              ) : (
                "Delete all permanently"
              )}
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

const EDIT_POLICY_OPTIONS = [
  {
    value: "cant-edit" as const,
    label: "Can't edit",
    description: "Cannot change documents at all.",
    icon: EyeOff,
    color: "#DC2626",
  },
  {
    value: "propose" as const,
    label: "Propose",
    description: "Edits become proposals that a member approves.",
    icon: ShieldCheck,
    color: "#16A34A",
  },
  {
    value: "direct" as const,
    label: "Direct edit",
    description: "Edits apply immediately.",
    icon: PenTool,
    color: "#2563EB",
  },
];

// Compile-time guard (zero runtime cost): every option's `value` must stay
// within the canonical EditPolicyValue union imported from lib/workspace-settings,
// so this UI can never drift from the API/data-model definition.
EDIT_POLICY_OPTIONS satisfies readonly { value: EditPolicyValue }[];

// One compact icon segment with a hover tooltip describing the option. The
// selected segment fills with its colour; the highlight slides between segments
// via a shared layoutId scoped to the row (People vs Agents).
function EditPolicySegment({
  option,
  selected,
  layoutGroup,
  onSelect,
}: {
  option: (typeof EDIT_POLICY_OPTIONS)[number];
  selected: boolean;
  layoutGroup: string;
  onSelect: () => void;
}) {
  const Icon = option.icon;
  return (
    <SimpleTooltip label={`${option.label} - ${option.description}`}>
      <button
        type="button"
        aria-label={option.label}
        aria-pressed={selected}
        onClick={onSelect}
        className="group relative inline-flex h-7 w-7 items-center justify-center rounded-[7px] transition-colors duration-150"
      >
        {selected ? (
          <motion.span
            layoutId={`edit-policy-highlight-${layoutGroup}`}
            className="absolute inset-0 rounded-[7px]"
            style={{ backgroundColor: option.color }}
            transition={{ type: "spring", stiffness: 520, damping: 40 }}
          />
        ) : null}
        <Icon
          size={14}
          className={cn(
            "pointer-events-none relative inline-flex h-3.5 w-3.5 items-center justify-center transition-colors duration-150",
            selected
              ? "text-white"
              : "text-[var(--creed-text-tertiary)] group-hover:text-[var(--creed-text-primary)]"
          )}
        />
      </button>
    </SimpleTooltip>
  );
}

function EditPolicyControl({
  value,
  onChange,
  layoutGroup,
}: {
  value: EditPolicyValue | null;
  onChange: (value: EditPolicyValue) => void;
  layoutGroup: string;
}) {
  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-[10px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-0.5">
      {EDIT_POLICY_OPTIONS.map((option) => (
        <EditPolicySegment
          key={option.value}
          option={option}
          selected={value === option.value}
          layoutGroup={layoutGroup}
          onSelect={() => onChange(option.value)}
        />
      ))}
    </div>
  );
}
