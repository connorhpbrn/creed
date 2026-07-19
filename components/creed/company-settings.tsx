"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  LoaderCircle,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SelectMenu } from "@/components/ui/select-menu";
import {
  SectionPermissionControl,
  PERMISSION_OPTIONS,
  GLOBAL_PERMISSION_OPTIONS,
} from "@/components/creed/section-permission-control";
import {
  UsageCard,
  IntegrationRow,
  ConnectButton,
  DisconnectButton,
  ReauthorizeButton,
} from "@/components/creed/settings-screen";
import { CreditsHistoryDialog } from "@/components/creed/credits-history-dialog";
import { AddCreditsDialog } from "@/components/creed/add-credits-dialog";
import { BuySeatsDialog } from "@/components/creed/buy-seats-dialog";
import { RemoveSeatsDialog } from "@/components/creed/remove-seats-dialog";
import { seatCadence } from "@/lib/seat-config";
import { SearchableSelect } from "@/components/creed/searchable-select";
import { RichTextEditor } from "@/components/creed/rich-text-editor";
import {
  EditableProfileAvatar,
  ProfileAvatar,
} from "@/components/creed/profile-avatar";
import { AnimatedIconButton } from "@/components/creed/animated-icon-action";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { DownloadIcon } from "@/components/ui/download";
import { SendIcon } from "@/components/ui/send";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import {
  type RepoOption,
  type BranchOption,
} from "@/components/creed/settings-preload";
import { useCreed } from "@/components/creed/creed-provider";
import type {
  AiMode,
  AiUsageRange,
  AiUsageSummary,
  CreditsState,
  OpenRouterBalance,
  PublicAiSettings,
} from "@/components/creed/settings-preload";
import {
  accentColorMap,
  isAccentKey,
  type AgentPermission,
  type CreedMemberSummary,
} from "@/lib/creed-data";
import { permissionsUpTo } from "@/lib/creed-permissions";
import { cn } from "@/lib/utils";

// A section's accent chip colour, tolerating custom/unknown accents the same
// way the connections charts do.
function sectionAccent(accent: string): string {
  return isAccentKey(accent)
    ? accentColorMap[accent]
    : "var(--accent-color-mono)";
}

// Role pill colours: owner blue, admin green, member amber. Same shape as the
// personal integration status pills (rounded-[6px] px-1.5 py-0.5 text-[12px]).
const ROLE_PILL: Record<"owner" | "admin" | "member", string> = {
  owner: "bg-[#EFF6FF] text-[var(--creed-accent-hover)] dark:bg-[#172554]/50 dark:text-[#60A5FA]",
  admin: "bg-[#ECFDF5] text-[#047857] dark:bg-[#052e1a]/50 dark:text-[#4ade80]",
  member:
    "bg-[#FFFBEB] text-[#B45309] dark:bg-[#422006]/50 dark:text-[#FBBF24]",
};

function RolePill({ role }: { role: "owner" | "admin" | "member" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[6px] px-1.5 py-0.5 text-[12px] font-medium capitalize",
        ROLE_PILL[role],
      )}
    >
      {role}
    </span>
  );
}

const INVITE_BUTTON =
  "rounded-xl bg-[var(--creed-accent)] px-6 text-white hover:bg-[var(--creed-accent-hover)] hover:text-white";

// Company-mode /settings, built to match the personal settings screen exactly:
// a single scrolling column of sections, each a bare card under an outside H2,
// separated by rules. Sections mirror the personal ones the company needs:
// Profile (avatar, name, email), Members & permissions, Model usage, Danger zone.
// AI/money lives in Model usage (like personal) - there is no separate billing
// or API-key section. Every member SEES every section; access is by role.
// Managers (owner/admin) edit General + Members. The owner alone manages Model
// usage (mode, credits, BYOK key) and the Danger zone. A plain member sees the
// same sections read-only: General is disabled, and Model usage shows the
// figures + spend chart (time frame still switchable) with the owner-only
// controls and purchase history hidden.

// Shared personal-settings class strings, kept here so company renders identically.
const PRIMARY_BUTTON =
  "rounded-md bg-[var(--creed-text-primary)] px-4 text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]";
const GHOST_BUTTON =
  "rounded-md px-3 text-[var(--creed-text-secondary)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]";
const DANGER_BUTTON =
  "rounded-md bg-[#DC2626] px-4 text-white hover:bg-[#B91C1C] hover:text-white";
const FIELD_INPUT =
  "h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[15px]";
const FIELD_LABEL =
  "mb-2 block text-[14px] font-medium leading-5 text-[var(--creed-text-secondary)]";
const CARD =
  "mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5";
const H2 = "text-[16px] font-medium text-[var(--creed-text-primary)]";
const LOW_ALLOWANCE_RATIO = 0.2;

function looksLikeApiKey(value: string) {
  return /^sk-or-[A-Za-z0-9-_]{8,}$/.test(value.trim());
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  // Matches the personal section anatomy exactly: H2 (with optional right-side
  // action) directly above the card; descriptive copy lives INSIDE the card.
  return (
    <section className="scroll-mt-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className={H2}>{title}</h2>
        {action}
      </div>
      <div className={CARD}>
        {description ? (
          <p className="mb-4 text-[14px] leading-7 text-[var(--creed-text-secondary)]">
            {description}
          </p>
        ) : null}
        {children}
      </div>
    </section>
  );
}

function MemberAvatar({
  member,
  size = "md",
}: {
  member: CreedMemberSummary;
  size?: "sm" | "md";
}) {
  return (
    <ProfileAvatar
      kind="person"
      name={member.name}
      initials={member.avatarInitials}
      avatarUrl={member.avatarUrl}
      size={size}
    />
  );
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M12 .5C5.65.5.5 5.66.5 12.02c0 5.09 3.29 9.4 7.86 10.93.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.69-1.28-1.69-1.04-.71.08-.69.08-.69 1.15.08 1.75 1.18 1.75 1.18 1.02 1.76 2.68 1.25 3.34.96.1-.74.4-1.25.72-1.53-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.17a11 11 0 0 1 5.78 0c2.2-1.48 3.16-1.17 3.16-1.17.63 1.58.24 2.75.12 3.04.74.8 1.18 1.82 1.18 3.07 0 4.41-2.69 5.39-5.26 5.67.41.36.77 1.06.77 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.68.8.56A11.53 11.53 0 0 0 23.5 12C23.5 5.66 18.35.5 12 .5Z" />
    </svg>
  );
}

// One credits/allowance tile, matching the personal Model-usage stat tiles.
function CreditTile({
  label,
  primary,
  secondary,
  size = 30,
}: {
  label: string;
  primary: string;
  secondary?: string;
  size?: number;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] px-4 py-3">
      <div className="text-[13px] font-medium text-[var(--creed-text-secondary)]">
        {label}
      </div>
      <div
        className="mt-0.5 font-medium tracking-[-0.03em] text-[var(--creed-text-primary)]"
        style={{ fontSize: `${size}px` }}
      >
        {primary}
        {secondary ? (
          <span className="text-[var(--creed-text-tertiary)]">
            {" "}
            {secondary}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function CompanySettings() {
  const {
    state,
    refreshState,
    restoreSection,
    setProfileAvatar,
    setVersionControlConfig,
    exportMarkdown,
    exportActivityJson,
    exportAllDataJson,
  } = useCreed();
  const router = useRouter();
  const company = state.company;
  const creedId = state.creedId ?? "";
  const role = company?.myRole ?? "member";
  const isManager = role === "owner" || role === "admin";
  const isOwner = role === "owner";

  const [nameDraft, setNameDraft] = useState(company?.creedName ?? "");
  const [emailDraft, setEmailDraft] = useState(company?.companyEmail ?? "");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  // Drives the send-icon hover animation on the Invite button.
  const inviteIcon = useAnimatedIconControls();

  // Agent edit behaviour (this member's own per-section ceiling). Optimistic
  // overrides layered over state.sections[].agentPermission so the control feels
  // instant; the POST persists and a background refresh reconciles.
  const [agentPermsOpen, setAgentPermsOpen] = useState(false);
  const [agentOverrides, setAgentOverrides] = useState<
    Record<string, AgentPermission>
  >({});

  // The TEAM's GitHub connection (managers only) + version control (the company
  // repo target). This is the team's own connection, never a member's personal
  // GitHub; in company mode the loader feeds settings.integrations.github from
  // the team integration row.
  const github = state.settings.integrations.github;
  const [githubDisconnectedOverride, setGithubDisconnectedOverride] =
    useState(false);
  const effectiveGitHubStatus = githubDisconnectedOverride
    ? "disconnected"
    : github.status;
  const githubConnected = effectiveGitHubStatus === "connected";
  const [connectingGitHub, setConnectingGitHub] = useState(false);
  const [disconnectingGitHub, setDisconnectingGitHub] = useState(false);
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [vcSaving, setVcSaving] = useState(false);

  // Invites optimistically hidden on revoke, so the row disappears instantly
  // while the backend catches up (refreshState then drops it for good).
  const [hiddenInviteIds, setHiddenInviteIds] = useState<string[]>([]);
  // Invites optimistically shown on send, so the pending row appears instantly
  // without waiting for the state refresh. Pruned once the server echoes them.
  const [optimisticInvites, setOptimisticInvites] = useState<
    Array<{ id: string; email: string; role: "admin" | "member" }>
  >([]);
  // Members optimistically updated: a role change reflects instantly, a removal
  // hides the row instantly. Both reconcile against the server on the next
  // refresh (and revert on failure).
  const [roleOverrides, setRoleOverrides] = useState<
    Record<string, "admin" | "member">
  >({});
  const [hiddenMemberIds, setHiddenMemberIds] = useState<string[]>([]);

  // Archived section confirm-delete target.
  const [archivedDeleteTarget, setArchivedDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [expandedArchived, setExpandedArchived] = useState<string | null>(null);

  // Permissions editor (merged into the Members section).
  const [permTarget, setPermTarget] = useState<string>("");
  const [permOverrides, setPermOverrides] = useState<Record<string, string>>(
    {},
  );

  // Model usage: company AI credits / allowance / usage / BYOK, fetched directly
  // (not via the personal settings cache, which is per-user). Read by every
  // member; only the owner can mutate it.
  const [aiSettings, setAiSettings] = useState<PublicAiSettings>({
    provider: "openrouter",
    keyStatus: "missing",
    aiMode: "credits",
  });
  const [aiKeyDraft, setAiKeyDraft] = useState("");
  const [aiSaving, setAiSaving] = useState(false);
  const [usageRange, setUsageRange] = useState<AiUsageRange>("90d");
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  const [credits, setCredits] = useState<CreditsState | null>(null);
  const [openRouterBalance, setOpenRouterBalance] =
    useState<OpenRouterBalance | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addCreditsOpen, setAddCreditsOpen] = useState(false);
  const [buySeatsOpen, setBuySeatsOpen] = useState(false);
  const [removeSeatsOpen, setRemoveSeatsOpen] = useState(false);

  // Owner dialogs.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string>("");

  // Load the per-member permission overrides when a member is picked.
  useEffect(() => {
    if (!permTarget || !creedId) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(
        `/api/app/company/permissions?creedId=${creedId}&userId=${permTarget}`,
      );
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({}))) as {
        overrides?: Record<string, string>;
      };
      if (!cancelled) setPermOverrides(data.overrides ?? {});
    })();
    return () => {
      cancelled = true;
    };
  }, [permTarget, creedId]);

  // Model-usage data. Every member can view the company's model usage (owners
  // additionally manage it), so this loads for all roles. The endpoints are
  // company-aware off the active-Creed cookie, so a plain GET returns this
  // company's figures (with owner-only detail like purchase history stripped
  // server-side for non-owners).
  useEffect(() => {
    if (!creedId) return;
    let cancelled = false;
    void (async () => {
      // Pin every AI-data read to THIS company Creed (not the active-Creed
      // cookie), so the card always shows the company's own pooled figures.
      const q = `?creedId=${encodeURIComponent(creedId)}`;
      const [settingsRes, creditsRes] = await Promise.all([
        fetch(`/api/app/ai/settings${q}`, { cache: "no-store" }),
        fetch(`/api/app/credits${q}`, { cache: "no-store" }),
      ]);
      if (cancelled) return;
      const s = (await settingsRes.json().catch(() => ({}))) as {
        settings?: PublicAiSettings;
      };
      if (s.settings) setAiSettings(s.settings);
      const c = (await creditsRes.json().catch(() => ({}))) as {
        credits?: CreditsState;
      };
      if (c.credits) setCredits(c.credits);
    })();
    return () => {
      cancelled = true;
    };
  }, [creedId]);

  useEffect(() => {
    if (!creedId) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(
        `/api/app/ai/usage?range=${usageRange}&mode=${aiSettings.aiMode}&creedId=${encodeURIComponent(creedId)}`,
        { cache: "no-store" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        usage?: AiUsageSummary;
      };
      if (!cancelled) setUsage(data.usage ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [creedId, usageRange, aiSettings.aiMode, aiSettings.keyStatus]);

  useEffect(() => {
    if (aiSettings.aiMode !== "byok" || aiSettings.keyStatus !== "valid") {
      setOpenRouterBalance(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/app/ai/openrouter-balance", {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        balance?: OpenRouterBalance | null;
      };
      if (!cancelled) setOpenRouterBalance(data.balance ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [aiSettings.aiMode, aiSettings.keyStatus]);

  // Keep the roster live without a manual refresh. Invite accepts happen on the
  // invitee's device, so a manager watching this screen needs the change pulled
  // in: poll while mounted, and refetch the moment the tab regains focus.
  useEffect(() => {
    const onFocus = () => void refreshState();
    window.addEventListener("focus", onFocus);
    // 15s, visible tabs only: an invite accept surfacing within a few seconds
    // of the manager looking at the screen is what matters, not a hidden tab
    // polling all day.
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshState();
    }, 15000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [refreshState]);

  // Drop optimistic invite rows once the server state echoes them (or they were
  // revoked), so the real rows drive the list from then on.
  const companyInvites = company?.invites;
  useEffect(() => {
    setOptimisticInvites((prev) => {
      if (prev.length === 0) return prev;
      const serverIds = new Set((companyInvites ?? []).map((i) => i.id));
      const next = prev.filter((o) => !serverIds.has(o.id));
      return next.length === prev.length ? prev : next;
    });
  }, [companyInvites]);

  // Drop optimistic member state once the server reflects it: a role override
  // clears when the server role matches, a removal clears when the row is gone.
  const companyMembers = company?.members;
  useEffect(() => {
    const rows = companyMembers ?? [];
    const roleByUser = new Map(rows.map((m) => [m.userId, m.role]));
    setRoleOverrides((prev) => {
      const next: Record<string, "admin" | "member"> = {};
      for (const [userId, role] of Object.entries(prev)) {
        if (roleByUser.get(userId) !== role) next[userId] = role;
      }
      return Object.keys(next).length === Object.keys(prev).length
        ? prev
        : next;
    });
    setHiddenMemberIds((prev) => {
      if (prev.length === 0) return prev;
      const present = new Set(rows.map((m) => m.userId));
      const next = prev.filter((id) => present.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [companyMembers]);

  // GitHub repos/branches on the TEAM's connection (the /api/app/github/* routes
  // resolve the team token when the active Creed is a company the caller
  // manages). Fetched directly - NOT through the shared settings-preload cache,
  // which is keyed for the personal connection and would otherwise leak a
  // manager's personal repos into the team picker.
  const vcRepoOwner = state.settings.versionControl.repoOwner;
  const vcRepoName = state.settings.versionControl.repoName;
  const selectedCommitUrl =
    vcRepoOwner && vcRepoName && state.settings.versionControl.lastRemoteSha
      ? `https://github.com/${vcRepoOwner}/${vcRepoName}/commit/${state.settings.versionControl.lastRemoteSha}`
      : null;
  useEffect(() => {
    if (!isManager || !githubConnected) return;
    let cancelled = false;
    void fetch("/api/app/github/repos", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ repos?: RepoOption[] }>)
      .then((payload) => {
        if (!cancelled && payload.repos) setRepos(payload.repos);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [isManager, githubConnected]);

  useEffect(() => {
    if (!isManager || !githubConnected || !vcRepoOwner || !vcRepoName) return;
    let cancelled = false;
    void fetch(
      `/api/app/github/branches?owner=${encodeURIComponent(vcRepoOwner)}&repo=${encodeURIComponent(vcRepoName)}`,
      { cache: "no-store" },
    )
      .then((r) => r.json() as Promise<{ branches?: BranchOption[] }>)
      .then((payload) => {
        if (!cancelled && payload.branches) setBranches(payload.branches);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [isManager, githubConnected, vcRepoOwner, vcRepoName]);

  // Surface the outcome of the team-GitHub OAuth round-trip (the callback
  // redirects back with ?teamGithub=<status>), then strip the param so a
  // refresh doesn't re-toast.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("teamGithub");
    if (!status) return;
    const messages: Record<string, { ok: boolean; text: string }> = {
      connected: { ok: true, text: "GitHub connected." },
      error: { ok: false, text: "Could not connect GitHub. Please try again." },
      forbidden: {
        ok: false,
        text: "Only an owner or admin can connect GitHub.",
      },
      notconfigured: {
        ok: false,
        text: "GitHub isn't available on this deployment yet.",
      },
      invalid: { ok: false, text: "Could not start the GitHub connection." },
    };
    const message = messages[status];
    if (message) (message.ok ? toast.success : toast.error)(message.text);
    params.delete("teamGithub");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`,
    );
    if (message?.ok) void refreshState();
  }, [refreshState]);

  if (!company) return null;

  async function post(
    url: string,
    body: unknown,
    method: "POST" | "DELETE" | "PUT" = "POST",
  ): Promise<boolean> {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? "Something went wrong.");
      return false;
    }
    return true;
  }

  async function saveName() {
    const next = nameDraft.trim();
    if (!next || next === company?.creedName) return;
    if (await post("/api/app/company/general", { creedId, name: next })) {
      toast.success("Company name updated.");
      router.refresh();
    }
  }

  async function saveEmail() {
    const next = emailDraft.trim();
    if (next === (company?.companyEmail ?? "")) return;
    if (await post("/api/app/company/general", { creedId, email: next })) {
      toast.success(next ? "Company email updated." : "Company email cleared.");
      router.refresh();
    }
  }

  async function uploadCompanyAvatar(file: File) {
    if (!creedId) return;
    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.set("scope", "company");
      form.set("creedId", creedId);
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
        toast.error(data.error ?? "Could not save company picture.");
        return;
      }
      if (data.avatarUrl) {
        setProfileAvatar(data.avatarUrl, "company");
      }
      void refreshState();
      router.refresh();
      toast.success("Company picture saved.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    // New teammates join as members; promote to admin from the roster after they
    // accept. Keeps the invite row a single field + button.
    const res = await fetch("/api/app/company/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creedId,
        email: inviteEmail.trim(),
        role: "member",
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      emailSent?: boolean;
      inviteId?: string;
    };
    if (!res.ok) {
      toast.error(data.error ?? "Invite failed.");
    } else {
      // The invite row + seat are created either way; the toast reflects only
      // whether the email actually went out (green sent / red failed).
      if (data.emailSent) toast.success("Invite sent.");
      else toast.error("Invite failed to send.");
      // Show the pending row instantly; refreshState then reconciles it (and the
      // prune effect drops this optimistic copy once the server echoes the id).
      if (data.inviteId) {
        const email = inviteEmail.trim().toLowerCase();
        setOptimisticInvites((prev) => [
          ...prev.filter((o) => o.id !== data.inviteId),
          { id: data.inviteId!, email, role: "member" },
        ]);
      }
      setInviteEmail("");
      void refreshState();
    }
    setInviting(false);
  }

  // The member's own agent ceiling for a section (or all sections). Optimistic,
  // then persisted; a background refresh reconciles state.sections.
  function agentPermissionValue(
    sectionId: string,
    current: AgentPermission,
  ): AgentPermission {
    return agentOverrides[sectionId] ?? current;
  }

  async function setAgentPermission(
    sectionId: string,
    permission: AgentPermission,
  ) {
    setAgentOverrides((prev) => ({ ...prev, [sectionId]: permission }));
    const ok = await post("/api/app/company/agent-permissions", {
      creedId,
      sectionId,
      permission,
    });
    if (ok) void refreshState();
  }

  async function setAllAgentPermissions(permission: AgentPermission) {
    setAgentOverrides(() => {
      const next: Record<string, AgentPermission> = {};
      for (const section of state.sections) next[section.id] = permission;
      return next;
    });
    const ok = await post("/api/app/company/agent-permissions", {
      creedId,
      permission,
      allSections: true,
    });
    if (ok) void refreshState();
  }

  // The TEAM's GitHub connection is authorized through a dedicated OAuth App
  // (not Supabase identity linking, which is one-GitHub-per-user). Connecting is
  // a full-page redirect through GitHub; the callback stores the team token and
  // returns to /settings?teamGithub=<status>, which the effect below toasts.
  function connectGitHub() {
    setGithubDisconnectedOverride(false);
    setConnectingGitHub(true);
    window.location.href = `/api/app/github/authorize?mode=company&creedId=${encodeURIComponent(creedId)}`;
  }

  async function disconnectGitHub() {
    try {
      setDisconnectingGitHub(true);
      const ok = await post("/api/app/company/github", { creedId }, "DELETE");
      if (!ok) return;
      setGithubDisconnectedOverride(true);
      setRepos([]);
      setBranches([]);
      void refreshState();
      toast.success("GitHub disconnected.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not disconnect GitHub.",
      );
    } finally {
      setDisconnectingGitHub(false);
    }
  }

  async function saveVersionControl(patch: {
    repoOwner?: string;
    repoName?: string;
    branch?: string;
  }) {
    const previous = state.settings.versionControl;
    const next = {
      ...previous,
      ...patch,
      lastRemoteSha: undefined,
      lastRemoteMessage: undefined,
      lastRemoteCommittedAt: undefined,
      lastSyncedContentHash: undefined,
      syncStatus:
        (patch.repoOwner ?? previous.repoOwner) &&
        (patch.repoName ?? previous.repoName) &&
        (patch.branch ?? previous.branch)
          ? ("unknown" as const)
          : ("not-configured" as const),
    };

    setVersionControlConfig(next);
    setVcSaving(true);
    const ok = await post("/api/app/company/version-control", {
      creedId,
      ...patch,
    });
    if (ok) {
      await refreshState();
    } else {
      setVersionControlConfig(previous);
    }
    setVcSaving(false);
  }

  function handleRepoChange(fullName: string) {
    const repo = repos.find((item) => item.fullName === fullName);
    if (!repo) return;
    const [owner, ...rest] = fullName.split("/");
    void saveVersionControl({
      repoOwner: owner,
      repoName: rest.join("/"),
      branch: repo.defaultBranch,
    });
  }

  async function deleteArchivedSection(sectionId: string) {
    if (await post(`/api/app/sections/${sectionId}`, { creedId }, "DELETE")) {
      toast.success("Section deleted.");
      setArchivedDeleteTarget(null);
      await refreshState();
    }
  }

  function downloadFile(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function changeRole(userId: string, newRole: "admin" | "member") {
    // Reflect the new role instantly; reconcile (or revert) after the write.
    setRoleOverrides((prev) => ({ ...prev, [userId]: newRole }));
    const ok = await post(`/api/app/company/members/${userId}`, {
      creedId,
      role: newRole,
    });
    if (ok) {
      toast.success("Role updated.");
      void refreshState();
    } else {
      // Failed: drop the override so the row snaps back (post already toasted).
      setRoleOverrides((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }
  }

  async function remove(userId: string) {
    // Hide the row instantly; reconcile with the server after.
    setHiddenMemberIds((prev) => [...prev, userId]);
    const ok = await post(
      `/api/app/company/members/${userId}`,
      { creedId },
      "DELETE",
    );
    if (ok) {
      toast.success("Member removed.");
      void refreshState();
    } else {
      // Failed: put the row back (post already surfaced the error toast).
      setHiddenMemberIds((prev) => prev.filter((id) => id !== userId));
    }
  }

  async function doTransfer() {
    if (!transferTargetId) return;
    const ok = await post(`/api/app/company/members/${transferTargetId}`, {
      creedId,
      action: "transfer",
    });
    if (ok) {
      toast.success("Ownership transferred.");
      setTransferOpen(false);
      setTransferTargetId("");
      await refreshState();
    }
  }

  async function revokeInvite(inviteId: string) {
    // Remove it from the list immediately; reconcile with the server after.
    setHiddenInviteIds((prev) => [...prev, inviteId]);
    const ok = await post(`/api/app/company/invites/${inviteId}`, {}, "DELETE");
    if (ok) {
      toast.success("Invite revoked.");
      await refreshState();
    } else {
      // Failed: put the row back (post already surfaced the error toast).
      setHiddenInviteIds((prev) => prev.filter((id) => id !== inviteId));
    }
  }

  async function setPermission(sectionId: string, permission: AgentPermission) {
    setPermOverrides((prev) => ({ ...prev, [sectionId]: permission }));
    await post("/api/app/company/permissions", {
      creedId,
      userId: permTarget,
      sectionId,
      permission,
    });
  }

  async function openPortal() {
    const res = await fetch("/api/app/company/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creedId }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (data.url) window.location.href = data.url;
    else toast.error(data.error ?? "Could not open billing.");
  }

  async function refreshCredits() {
    const res = await fetch(
      `/api/app/credits?creedId=${encodeURIComponent(creedId)}`,
      { cache: "no-store" },
    );
    const data = (await res.json().catch(() => ({}))) as {
      credits?: CreditsState;
    };
    if (data.credits) setCredits(data.credits);
  }

  async function putAiSettings(
    body: Record<string, unknown>,
  ): Promise<PublicAiSettings | null> {
    const res = await fetch("/api/app/ai/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      settings?: PublicAiSettings;
      error?: string;
    };
    if (!res.ok) {
      toast.error(data.error ?? "Could not save AI settings.");
      return null;
    }
    return data.settings ?? null;
  }

  async function saveAiKey() {
    if (!looksLikeApiKey(aiKeyDraft)) return;
    setAiSaving(true);
    const next = await putAiSettings({ apiKey: aiKeyDraft.trim() });
    if (next) {
      setAiSettings(next);
      setAiKeyDraft("");
      toast.success("API key saved.");
    }
    setAiSaving(false);
  }

  async function clearAiKey() {
    setAiSaving(true);
    const next = await putAiSettings({ clearApiKey: true });
    if (next) {
      setAiSettings(next);
      setAiKeyDraft("");
      setOpenRouterBalance(null);
      toast.success("API key cleared.");
    }
    setAiSaving(false);
  }

  async function changeAiMode(mode: AiMode) {
    if (aiSettings.aiMode === mode) return;
    const previous = aiSettings.aiMode;
    setAiSettings((current) => ({ ...current, aiMode: mode }));
    const next = await putAiSettings({ aiMode: mode });
    if (next) setAiSettings(next);
    else setAiSettings((current) => ({ ...current, aiMode: previous }));
  }

  async function doDelete() {
    if (await post("/api/app/company", { creedId }, "DELETE")) {
      toast.success("Company Creed deleted.");
      router.push("/file");
      router.refresh();
    }
  }

  const seats = company.seats;

  // The roster with optimistic member edits applied (role overrides + removals),
  // so role changes and removals render instantly. The owner is never overridden.
  const members = company.members
    .filter((m) => !hiddenMemberIds.includes(m.userId))
    .map((m) =>
      m.role !== "owner" && roleOverrides[m.userId]
        ? { ...m, role: roleOverrides[m.userId]! }
        : m,
    );
  const memberOptions = members.filter((m) => m.role === "member");

  const liveSections = state.sections.filter((s) => !s.archived);
  const archivedSections = state.sections.filter((s) => s.archived);
  const selectedRepoFullName =
    vcRepoOwner && vcRepoName ? `${vcRepoOwner}/${vcRepoName}` : "";
  // The member's shared agent level across the sections they can actually
  // control (read-only sections are locked, so they don't count), null = mixed.
  const editableSections = liveSections.filter(
    (s) => (company.myPermissions?.[s.id] ?? "direct") !== "read-only",
  );
  const uniformAgentPermission: AgentPermission | null = (() => {
    const perms = editableSections
      .map((s) => agentPermissionValue(s.id, s.agentPermission))
      .filter((p) => p !== "hidden");
    return perms.length > 0 && perms.every((p) => p === perms[0])
      ? perms[0]
      : null;
  })();
  const dataWordCount = exportMarkdown()
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  // Credits figures (mirrors the personal Model-usage card).
  const grantedUsd = credits?.grantedUsd ?? 0;
  const purchasedUsd = credits?.purchasedUsd ?? 0;
  const balanceUsd = credits?.balanceUsd ?? 0;
  const allowanceUsd = credits?.allowanceUsd ?? 0;
  const allTimeSpentUsd = credits?.allTimeSpentUsd ?? 0;
  const allowanceResets = credits?.allowanceResets ?? false;
  const allowanceSpentUsd = Math.max(0, allowanceUsd - grantedUsd);
  const lowOnAllowance =
    allowanceUsd > 0 && balanceUsd <= allowanceUsd * LOW_ALLOWANCE_RATIO;
  const canSaveAiKey = looksLikeApiKey(aiKeyDraft) && !aiSaving;

  const blocks: ReactNode[] = [];

  // ── Profile ────────────────────────────────────────────────────────────────
  // Everyone sees the company name + email; only managers (owner/admin) can edit
  // them. For a plain member the fields render disabled (view-only), matching
  // the greyed-out read-only treatment across the rest of settings.
  blocks.push(
    <Section key="profile" title="Profile">
      <div className="grid grid-cols-[calc(1.25rem+0.5rem+2.75rem)_minmax(0,1fr)] items-start gap-x-4 gap-y-4 md:flex md:gap-5">
        <EditableProfileAvatar
          kind="company"
          name={company.creedName}
          avatarUrl={company.avatarUrl}
          disabled={!isManager}
          uploading={avatarUploading}
          onFile={(file) => void uploadCompanyAvatar(file)}
        />
        <div className="contents md:block md:min-w-0 md:flex-1 md:space-y-3">
          <div className="min-w-0">
            <label className={FIELD_LABEL}>Company name</label>
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={saveName}
              disabled={!isManager}
              className={cn(
                FIELD_INPUT,
                !isManager && "cursor-not-allowed opacity-60",
              )}
            />
          </div>
          <div className="col-span-2 min-w-0 md:col-span-1">
            <label className={FIELD_LABEL}>Company email</label>
            <Input
              type="email"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              onBlur={saveEmail}
              placeholder="hello@company.com"
              disabled={!isManager}
              className={cn(
                FIELD_INPUT,
                !isManager && "cursor-not-allowed opacity-60",
              )}
            />
          </div>
        </div>
      </div>
    </Section>,
  );

  // ── Members & permissions ────────────────────────────────────────────────────
  blocks.push(
    <Section key="members" title="Members & permissions">
      {isManager ? (
        <div className="mb-5 flex items-center gap-3">
          <Input
            type="email"
            placeholder="teammate@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && inviteEmail.trim() && !inviting)
                void sendInvite();
            }}
            className={`${FIELD_INPUT} flex-1`}
          />
          <Button
            className={`${INVITE_BUTTON} h-11`}
            onClick={sendInvite}
            disabled={inviting || !inviteEmail.trim()}
            onMouseEnter={inviteIcon.start}
            onMouseLeave={inviteIcon.settle}
          >
            {inviting ? (
              <>
                Inviting
                <LoaderCircle className="h-4 w-4 animate-spin" />
              </>
            ) : (
              <>
                Invite
                <SendIcon
                  ref={inviteIcon.iconRef}
                  size={16}
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center leading-none"
                />
              </>
            )}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col divide-y divide-[var(--creed-border)]">
        {members.map((m) => (
          <div
            key={m.userId}
            className="flex items-center justify-between gap-4 py-5 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 items-center gap-3">
              <MemberAvatar member={m} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-[var(--creed-text-primary)]">
                    {m.name}
                  </span>
                  <RolePill role={m.role} />
                </div>
                <div className="truncate text-[12px] text-[var(--creed-text-tertiary)]">
                  {m.email}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {isManager && m.role !== "owner" ? (
                <>
                  {/* Only the owner sets roles: an admin can't promote a member
                      or demote another admin. Admins can still remove members. */}
                  {isOwner ? (
                    <div className="hidden md:block">
                      <SelectMenu<"admin" | "member">
                        value={m.role as "admin" | "member"}
                        onChange={(v) => changeRole(m.userId, v)}
                        align="end"
                        options={[
                          { value: "member", label: "Member" },
                          { value: "admin", label: "Admin" },
                        ]}
                      />
                    </div>
                  ) : null}
                  {/* Admins can remove members but not other admins; the owner
                      can remove anyone but themselves. */}
                  {isOwner || m.role === "member" ? (
                    <Button
                      className={DANGER_BUTTON}
                      onClick={() => remove(m.userId)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        ))}

        {[
          ...(company.invites ?? []),
          ...optimisticInvites.filter(
            (o) => !(company.invites ?? []).some((i) => i.id === o.id),
          ),
        ]
          .filter((invite) => !hiddenInviteIds.includes(invite.id))
          .map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between gap-4 py-5 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-dashed border-[var(--creed-border-strong)] text-[var(--creed-text-tertiary)]">
                  <Mail className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-[var(--creed-text-primary)]">
                      {invite.email}
                    </span>
                    <span className="inline-flex items-center rounded-[6px] bg-[#F5F3FF] px-1.5 py-0.5 text-[12px] font-medium text-[#6D28D9] dark:bg-[#2E1065]/50 dark:text-[#A78BFA]">
                      Pending
                    </span>
                  </div>
                  <div className="truncate text-[12px] text-[var(--creed-text-tertiary)] capitalize">
                    Invited as {invite.role}
                  </div>
                </div>
              </div>
              <Button
                className={DANGER_BUTTON}
                onClick={() => revokeInvite(invite.id)}
              >
                Revoke
              </Button>
            </div>
          ))}
      </div>

      {seats ? (
        <div className="mt-5 border-t border-[var(--creed-border)] pt-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-[var(--creed-text-primary)]">
                Seats
              </div>
              <p className="mt-1 hidden text-[13px] text-[var(--creed-text-secondary)] md:block">
                {`${seats.used} of ${seats.capacity} in use.`}
                {seats.used >= seats.capacity
                  ? " Every seat is taken."
                  : ` ${seats.capacity - seats.used} open.`}
              </p>
            </div>
            {isOwner ? (
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="ghost"
                  className={GHOST_BUTTON}
                  onClick={openPortal}
                >
                  Manage
                </Button>
                {/* Removing seats is subscription-only; lifetime seats are
                    purchased capacity and never refunded. */}
                {company.billing?.billingMode === "subscription" && seats.extra > 0 ? (
                  <Button
                    variant="ghost"
                    className={GHOST_BUTTON}
                    onClick={() => setRemoveSeatsOpen(true)}
                  >
                    Remove
                  </Button>
                ) : null}
                <Button
                  className="rounded-md bg-[var(--creed-accent)] px-4 text-white hover:bg-[var(--creed-accent-hover)] hover:text-white"
                  onClick={() => setBuySeatsOpen(true)}
                >
                  Buy
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isManager ? (
        <div className="mt-5 border-t border-[var(--creed-border)] pt-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-[var(--creed-text-primary)]">
                Section access
              </div>
              <p className="mt-1 hidden text-[13px] text-[var(--creed-text-secondary)] md:block">
                Everyone starts with Direct edit.
              </p>
            </div>
            <SelectMenu<string>
              value={permTarget}
              onChange={setPermTarget}
              align="end"
              disabled={memberOptions.length === 0}
              placeholder={
                memberOptions.length === 0
                  ? "No members yet"
                  : "Select a member"
              }
              options={memberOptions.map((m) => ({
                value: m.userId,
                label: m.name,
                avatar: <MemberAvatar member={m} size="sm" />,
              }))}
            />
          </div>
          {permTarget ? (
            state.sections.length ? (
              <div className="mt-4 space-y-1">
                {state.sections.map((section) => (
                  <div
                    key={section.id}
                    className="flex items-center justify-between gap-3 rounded-sm py-1.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                        style={{
                          backgroundColor: sectionAccent(section.accent),
                        }}
                      />
                      <span className="truncate text-[14px] text-[var(--creed-text-primary)]">
                        {section.name}
                      </span>
                    </div>
                    <SectionPermissionControl
                      value={
                        (permOverrides[section.id] ??
                          "direct") as AgentPermission
                      }
                      onChange={(v) => setPermission(section.id, v)}
                      layoutGroup={`perm-${section.id}`}
                      options={PERMISSION_OPTIONS}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-[13px] text-[var(--creed-text-tertiary)]">
                No sections yet.
              </p>
            )
          ) : null}
        </div>
      ) : null}
    </Section>,
  );

  // ── Agent edit behaviour (each member sets their own agent's access) ─────────
  blocks.push(
    <Section key="agent-edits" title="Agent edit behaviour">
      <div className="flex items-center justify-between gap-5 md:items-start">
        <div>
          <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">
            All sections
          </div>
          <div className="mt-2 hidden max-w-xl text-[14px] leading-7 text-[var(--creed-text-secondary)] md:block">
            What your connected agents may do across this company Creed.
          </div>
        </div>
        <SectionPermissionControl
          value={uniformAgentPermission}
          onChange={(permission) => {
            if (permission !== "hidden")
              void setAllAgentPermissions(permission);
          }}
          layoutGroup="company-all-sections"
          options={GLOBAL_PERMISSION_OPTIONS}
        />
      </div>

      {liveSections.length ? (
        <div className="mt-5 border-t border-[var(--creed-border)] pt-4">
          <button
            type="button"
            onClick={() => setAgentPermsOpen((open) => !open)}
            className="group -my-2 flex w-full items-center justify-between py-2 text-left"
          >
            <span className="text-[14px] font-medium text-[var(--creed-text-primary)]">
              Per-section
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-[var(--creed-text-tertiary)] transition-all duration-200 group-hover:text-[var(--creed-text-primary)]",
                agentPermsOpen && "rotate-180",
              )}
            />
          </button>
          <AnimatePresence initial={false}>
            {agentPermsOpen ? (
              <motion.div
                initial={{ height: 0, opacity: 0, y: -8 }}
                animate={{ height: "auto", opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="mt-4 space-y-1">
                  {liveSections.map((section) => {
                    // You can only set your agent's behaviour up to what YOU may
                    // do on the section (the owner-granted ceiling). Read-only /
                    // hidden lock the control to that fixed value; otherwise the
                    // choices are capped at the ceiling, so a Proposal-only
                    // member can pick up to Propose but not Direct edit.
                    const myAccess =
                      company.myPermissions?.[section.id] ?? "direct";
                    const locked =
                      myAccess === "read-only" || myAccess === "hidden";
                    const allowed = permissionsUpTo(myAccess);
                    const cappedOptions = PERMISSION_OPTIONS.filter((o) =>
                      allowed.includes(o.value),
                    );
                    const rawValue = agentPermissionValue(
                      section.id,
                      section.agentPermission,
                    );
                    // Clamp the shown value to the ceiling so a stale over-grant
                    // (or a server-clamped value) still reads correctly.
                    const shownValue = locked
                      ? myAccess
                      : allowed.includes(rawValue)
                        ? rawValue
                        : myAccess;
                    return (
                      <div
                        key={section.id}
                        className="flex items-center justify-between gap-3 rounded-sm py-1.5"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                            style={{
                              backgroundColor: sectionAccent(section.accent),
                            }}
                          />
                          <span className="truncate text-[14px] text-[var(--creed-text-primary)]">
                            {section.name}
                          </span>
                        </div>
                        <SectionPermissionControl
                          value={shownValue}
                          onChange={(permission) =>
                            void setAgentPermission(section.id, permission)
                          }
                          layoutGroup={`agent-${section.id}`}
                          options={cappedOptions}
                          disabled={locked}
                        />
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
    </Section>,
  );

  // ── Integrations (managers only) ────────────────────────────────────────────
  // Company integrations are authorized separately from a member's personal
  // account, so the shared Creed can connect to shared tools.
  if (isManager) {
    blocks.push(
      <section key="integrations" className="scroll-mt-6">
        <h2 className={H2}>Integrations</h2>
        <div className="mt-4 divide-y divide-[var(--creed-border)] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <IntegrationRow
            title="GitHub"
            icon={
              <GitHubMark className="h-7 w-7 text-[#24292F] dark:text-[var(--creed-text-primary)]" />
            }
            status={effectiveGitHubStatus}
            statusLabel={
              githubConnected
                ? "Connected"
                : effectiveGitHubStatus === "disconnected"
                  ? "Disconnected"
                  : "Not connected"
            }
            secondaryLabel={githubConnected ? github.accountLabel : undefined}
            action={
              githubConnected ? (
                <DisconnectButton
                  label="GitHub"
                  loading={disconnectingGitHub}
                  onClick={disconnectGitHub}
                />
              ) : company.githubOAuthConfigured ? (
                <div className="flex items-center gap-2">
                  <ReauthorizeButton />
                  <ConnectButton
                    label="GitHub"
                    loading={connectingGitHub}
                    onClick={connectGitHub}
                  />
                </div>
              ) : (
                <span className="text-[13px] text-[var(--creed-text-tertiary)]">
                  Not available on this deployment
                </span>
              )
            }
          />
        </div>
      </section>,
    );
  }

  // ── Model usage ──────────────────────────────────────────────────────────────
  // Every member sees the allowance/balance figures and usage chart. Owners
  // alone manage mode switching, top-ups, purchase history, and BYOK.
  blocks.push(
    <section key="model-usage" className="scroll-mt-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className={H2}>Model usage</h2>
        {isOwner ? (
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
                  onSelect={() => void changeAiMode(mode)}
                  className={cn(
                    "flex items-center justify-between gap-5 rounded-lg px-3 py-2 text-sm",
                    aiSettings.aiMode === mode &&
                      "bg-[var(--creed-surface-selected)] font-medium",
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
        ) : (
          <span className="inline-flex h-8 items-center rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-sm text-[var(--creed-text-tertiary)]">
            {aiSettings.aiMode === "credits" ? "Credits" : "BYOK"}
          </span>
        )}
      </div>
      <div className={CARD}>
        <div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr] md:items-stretch">
          <div className="flex flex-col gap-4">
            {aiSettings.aiMode === "credits" ? (
              allowanceResets ? (
                <>
                  <CreditTile
                    label="This month"
                    primary={`$${allowanceSpentUsd.toFixed(2)}`}
                    secondary={`/ $${allowanceUsd.toFixed(2)}`}
                  />
                  <CreditTile
                    label="Extra credits"
                    primary={`$${purchasedUsd.toFixed(2)}`}
                    size={22}
                  />
                </>
              ) : (
                <>
                  <CreditTile
                    label="Credits left"
                    primary={`$${balanceUsd.toFixed(2)}`}
                  />
                  <CreditTile
                    label="All-time spend"
                    primary={`$${allTimeSpentUsd.toFixed(2)}`}
                    size={22}
                  />
                </>
              )
            ) : (
              <div>
                {openRouterBalance ? (
                  <div className="mb-4">
                    <CreditTile
                      label="OpenRouter balance"
                      primary={
                        openRouterBalance.remainingUsd != null
                          ? `$${openRouterBalance.remainingUsd.toFixed(2)}`
                          : "Unlimited"
                      }
                    />
                  </div>
                ) : null}
                {isOwner ? (
                  <>
                    <label className="mb-2 block text-[13px] font-medium text-[var(--creed-text-secondary)]">
                      OpenRouter API key
                    </label>
                    <Input
                      type="password"
                      value={aiKeyDraft}
                      onChange={(e) => setAiKeyDraft(e.target.value)}
                      placeholder={
                        aiSettings.keyLastFour
                          ? `Saved key ending in ${aiSettings.keyLastFour}`
                          : "sk-or-..."
                      }
                      className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[14px]"
                    />
                  </>
                ) : aiSettings.keyLastFour ? (
                  <p className="text-[13px] text-[var(--creed-text-tertiary)]">
                    Your company uses its own OpenRouter key
                    {` ending in ${aiSettings.keyLastFour}`}.
                  </p>
                ) : null}
              </div>
            )}

            {aiSettings.aiMode === "credits" ? (
              // Visible to everyone; only the owner can actually act, so a
              // member sees the buttons greyed out (they learn where they live
              // in case they are later promoted to owner).
              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                <Button
                  variant="ghost"
                  className={GHOST_BUTTON}
                  onClick={() => setHistoryOpen(true)}
                  disabled={!isOwner}
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
                    disabled={!isOwner}
                  >
                    Add credits
                  </Button>
                </div>
              </div>
            ) : isOwner ? (
              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                <Button
                  variant="ghost"
                  className={GHOST_BUTTON}
                  onClick={() =>
                    aiSettings.keyLastFour
                      ? void clearAiKey()
                      : setAiKeyDraft("")
                  }
                  disabled={
                    aiSaving || (!aiKeyDraft && !aiSettings.keyLastFour)
                  }
                >
                  Clear
                </Button>
                <Button
                  className={PRIMARY_BUTTON}
                  onClick={() => void saveAiKey()}
                  disabled={!canSaveAiKey}
                >
                  Save API key
                  {aiSaving ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : null}
                </Button>
              </div>
            ) : null}
          </div>

          <UsageCard
            usage={usage}
            range={usageRange}
            onRangeChange={setUsageRange}
            mode={aiSettings.aiMode}
          />
        </div>
      </div>
    </section>,
  );

  // ── Version control (managers): the company file's GitHub sync target ────────
  if (isManager) {
    blocks.push(
      <Section key="version-control" title="Version control">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={FIELD_LABEL}>Repo</label>
            <SearchableSelect
              value={selectedRepoFullName}
              onChange={handleRepoChange}
              placeholder={
                !githubConnected
                  ? "Connect GitHub first"
                  : repos.length === 0
                    ? "Loading repos..."
                    : "Select a repo"
              }
              searchPlaceholder="Search repos..."
              disabled={!githubConnected || vcSaving || repos.length === 0}
              options={
                repos.length > 0
                  ? repos.map((repo) => ({
                      key: String(repo.id),
                      value: repo.fullName,
                      label: repo.fullName,
                      description: repo.private
                        ? "Private repo"
                        : "Public repo",
                      search: repo.fullName,
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
            <label className={FIELD_LABEL}>Branch</label>
            <SearchableSelect
              value={state.settings.versionControl.branch}
              onChange={(branch) => void saveVersionControl({ branch })}
              placeholder={
                !githubConnected
                  ? "Connect GitHub first"
                  : !selectedRepoFullName
                    ? "Select a repo first"
                    : "Select a branch"
              }
              searchPlaceholder="Search branches..."
              disabled={
                !githubConnected ||
                vcSaving ||
                branches.length === 0 ||
                !selectedRepoFullName
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
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-[var(--creed-text-secondary)]">
          <span className="font-medium text-[var(--creed-text-secondary)]">
            Last commit
          </span>
          <span aria-hidden className="shrink-0 text-[var(--creed-text-tertiary)]">
            ·
          </span>
          {state.settings.versionControl.lastRemoteMessage ? (
            <span className="inline-flex min-w-0 items-center gap-2">
              {selectedCommitUrl ? (
                <a
                  href={selectedCommitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={state.settings.versionControl.lastRemoteMessage}
                  className="truncate font-medium text-[var(--creed-accent)] transition-colors hover:text-[var(--creed-accent-hover)]"
                >
                  {state.settings.versionControl.lastRemoteMessage}
                </a>
              ) : (
                <span className="truncate text-[var(--creed-text-secondary)]">
                  {state.settings.versionControl.lastRemoteMessage}
                </span>
              )}
            </span>
          ) : (
            <span className="text-[var(--creed-text-tertiary)]">
              no commits yet
            </span>
          )}
        </div>
      </Section>,
    );
  }

  // ── Archived (managers restore / delete archived sections) ──────────────────
  if (isManager) {
    blocks.push(
      <Section key="archived" title="Archived">
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
                        setExpandedArchived((cur) =>
                          cur === section.id ? null : section.id,
                        )
                      }
                      className="group flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-[3px]"
                        style={{
                          backgroundColor: sectionAccent(section.accent),
                        }}
                      />
                      <span className="truncate text-[14px] font-medium text-[var(--creed-text-primary)]">
                        {section.name}
                      </span>
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 shrink-0 text-[var(--creed-text-tertiary)] transition duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-[var(--creed-text-primary)]",
                          expanded && "rotate-90",
                        )}
                      />
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        className="rounded-md border-[var(--creed-border)]"
                        onClick={() => {
                          restoreSection(section.id);
                          toast.success(`Restored "${section.name}".`);
                        }}
                      >
                        Restore
                      </Button>
                      <Button
                        className={DANGER_BUTTON}
                        onClick={() =>
                          setArchivedDeleteTarget({
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
                        transition={{
                          duration: 0.24,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-[var(--creed-border)] px-4 py-4">
                          <RichTextEditor
                            sectionId={section.id}
                            content={section.content}
                            readOnly
                            accentColor={sectionAccent(section.accent)}
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
      </Section>,
    );
  }

  // ── Data (any member; scoped to their visible sections) ──────────────────────
  blocks.push(
    <Section key="data" title="Data">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[14px]">
        <span>
          <span className="font-medium text-[var(--creed-text-primary)]">
            {dataWordCount.toLocaleString()}
          </span>
          <span className="ml-1 text-[var(--creed-text-secondary)]">
            {dataWordCount === 1 ? "word" : "words"}
          </span>
        </span>
        <span aria-hidden className="text-[var(--creed-text-tertiary)]">
          ·
        </span>
        <span>
          <span className="font-medium text-[var(--creed-text-primary)]">
            {liveSections.length.toLocaleString()}
          </span>
          <span className="ml-1 text-[var(--creed-text-secondary)]">
            visible {liveSections.length === 1 ? "section" : "sections"}
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
              "creed.md",
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
              "application/json;charset=utf-8",
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
              "application/json;charset=utf-8",
            )
          }
        >
          Export all data
        </AnimatedIconButton>
      </div>
    </Section>,
  );

  // ── Ownership (owner-only) ───────────────────────────────────────────────────
  if (isOwner) {
    const transferOptions = members.filter((m) => m.role !== "owner");
    blocks.push(
      <Section key="ownership" title="Ownership">
        <p className="mb-4 text-[14px] leading-7 text-[var(--creed-text-secondary)]">
          Choose a member, then confirm in the popup before ownership changes.
        </p>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <SelectMenu<string>
              value={transferTargetId}
              onChange={setTransferTargetId}
              align="start"
              disabled={transferOptions.length === 0}
              placeholder={
                transferOptions.length === 0
                  ? "No eligible members"
                  : "Choose a member"
              }
              options={transferOptions.map((m) => ({
                value: m.userId,
                label: m.name,
                avatar: <MemberAvatar member={m} size="sm" />,
              }))}
            />
          </div>
          <Button
            className="rounded-md"
            disabled={!transferTargetId}
            onClick={() => setTransferOpen(true)}
          >
            Transfer
          </Button>
        </div>
      </Section>,
    );
  }

  // ── Danger zone (owner-only) ─────────────────────────────────────────────────
  if (isOwner) {
    blocks.push(
      <section key="danger" className="scroll-mt-6">
        <h2 className={H2}>Danger zone</h2>
        <div className="mt-4 rounded-[var(--radius-xl)] border border-[#FECACA] bg-[#FEF2F2] p-5 dark:border-[#7F1D1D]/40 dark:bg-[#3F1212]/30">
          <div className="flex items-center justify-between gap-5">
            <div className="min-w-0">
              <div className="text-[15px] font-medium text-[#DC2626]">
                Delete company Creed
              </div>
              <div className="mt-2 hidden text-[14px] leading-7 text-[#DC2626] md:block">
                Permanently deletes the company Creed and all its content for
                every member.
              </div>
            </div>
            <Button
              className={DANGER_BUTTON}
              onClick={() => setDeleteOpen(true)}
            >
              Delete
            </Button>
          </div>
        </div>
      </section>,
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--creed-surface)] creed-scrollbar">
      <div className="mx-auto max-w-3xl px-8 py-10 md:px-14">
        <h1 className="font-heading text-[1.75rem] font-medium tracking-[-0.03em] text-[var(--creed-text-primary)]">
          Settings
        </h1>

        {company.accessState === "frozen" ? (
          <div className="mt-6 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] p-4 text-[13px] leading-6 text-[var(--creed-text-secondary)]">
            This company Creed is read-only until billing is fixed.{" "}
            {isOwner ? (
              <button
                onClick={openPortal}
                className="font-medium text-[var(--creed-text-primary)] underline underline-offset-2"
              >
                Fix billing
              </button>
            ) : (
              "Ask your owner to fix billing."
            )}
          </div>
        ) : company.accessState === "past_due" && isOwner ? (
          <div className="mt-6 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] p-4 text-[13px] leading-6 text-[var(--creed-text-secondary)]">
            A payment did not go through.{" "}
            <button
              onClick={openPortal}
              className="font-medium text-[var(--creed-text-primary)] underline underline-offset-2"
            >
              Fix billing
            </button>
          </div>
        ) : null}

        {blocks.map((block, index) => (
          <div key={index} className={index === 0 ? "mt-10" : undefined}>
            {index > 0 ? (
              <Separator className="my-10 bg-[var(--creed-border)]" />
            ) : null}
            {block}
          </div>
        ))}
      </div>

      <AddCreditsDialog
        open={addCreditsOpen}
        onOpenChange={setAddCreditsOpen}
        currentBalanceUsd={balanceUsd}
        onToppedUp={() => void refreshCredits()}
      />

      {company.billing ? (
        <BuySeatsDialog
          open={buySeatsOpen}
          onOpenChange={setBuySeatsOpen}
          creedId={creedId}
          cadence={seatCadence(
            company.billing.billingMode,
            company.billing.interval,
          )}
          used={seats?.used ?? 0}
          capacity={seats?.capacity ?? 0}
          onPurchased={() => void refreshState()}
        />
      ) : null}

      {company.billing && seats ? (
        <RemoveSeatsDialog
          open={removeSeatsOpen}
          onOpenChange={setRemoveSeatsOpen}
          creedId={creedId}
          cadence={seatCadence(
            company.billing.billingMode,
            company.billing.interval,
          )}
          used={seats.used}
          included={seats.included}
          extra={seats.extra}
          onDone={() => void refreshState()}
        />
      ) : null}

      <CreditsHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        transactions={credits?.transactions ?? []}
        allowanceResets={allowanceResets}
      />

      <Dialog
        open={archivedDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchivedDeleteTarget(null);
        }}
      >
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-[#B91C1C]" />
              Delete archived section
            </DialogTitle>
          </DialogHeader>
          <p className="text-[14px] leading-7 text-[var(--creed-text-secondary)]">
            This permanently deletes &ldquo;{archivedDeleteTarget?.name}&rdquo;.
            This cannot be undone.
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              className="rounded-md"
              onClick={() => setArchivedDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[#DC2626] text-white hover:bg-[#B91C1C]"
              onClick={() => {
                if (archivedDeleteTarget)
                  void deleteArchivedSection(archivedDeleteTarget.id);
              }}
            >
              Delete permanently
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={transferOpen}
        onOpenChange={(open) => {
          setTransferOpen(open);
          if (!open) setTransferTargetId("");
        }}
      >
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>
              Transfer ownership
            </DialogTitle>
          </DialogHeader>
          <p className="text-[14px] leading-7 text-[var(--creed-text-secondary)]">
            {(() => {
              const target = members.find((m) => m.userId === transferTargetId);
              const who = target?.name ?? "this member";
              return `${who} becomes owner and gets billing control. You become an admin.`;
            })()}
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              className="rounded-md"
              onClick={() => {
                setTransferOpen(false);
                setTransferTargetId("");
              }}
            >
              Cancel
            </Button>
            <Button
              className="rounded-md"
              onClick={doTransfer}
              disabled={!transferTargetId}
            >
              Transfer ownership
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-[#B91C1C]" />
              Delete company Creed
            </DialogTitle>
          </DialogHeader>
          <p className="text-[14px] leading-7 text-[var(--creed-text-secondary)]">
            This permanently deletes the company Creed and all its content for
            everyone. This cannot be undone. Type the company name to confirm.
          </p>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={company.creedName}
            className={`${FIELD_INPUT} mt-1`}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              className="rounded-md"
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[#DC2626] text-white hover:bg-[#B91C1C]"
              onClick={doDelete}
              disabled={deleteConfirm !== company.creedName}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
