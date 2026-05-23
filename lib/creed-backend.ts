import { randomBytes } from "node:crypto";
import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import {
  buildAgentReadPayload,
  inferSectionTemplate,
  legacyPayloadToRichTextContent,
  normalizeLegacyAccent,
  normalizeLegacyProposalDraft,
  normalizeLegacySectionId,
  type AgentIconKind,
  type ActivityStatus,
  type GitHubSyncStatus,
  initialCreedState,
  initialOnboardingState,
  type AccentKey,
  type ActivityEntry,
  type ActorType,
  type ConnectionItem,
  type CreedSection,
  type CreedState,
  type McpClient,
  type Proposal,
  type SectionTemplate,
} from "@/lib/creed-data";
import { getSiteUrl } from "@/lib/supabase/env";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, hashSecret } from "@/lib/secret-crypto";
import { log } from "@/lib/observability";
import type { SupabaseLikeClient } from "@/lib/supabase/types";

type SectionRow = {
  user_id: string;
  section_id: string;
  position: number;
  // The DB has legacy kinds (chips, rules, decisions, focus) on older rows;
  // hydrateSection migrates them all to "rich-text" for the in-memory model.
  kind: string;
  name: string;
  accent: AccentKey;
  payload: Record<string, unknown>;
  last_edited_by: string;
  last_edited_type: ActorType;
  last_edited_at: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

type ProposalRow = {
  id: string;
  user_id: string;
  section_id: Proposal["sectionId"];
  section_name: string;
  accent: AccentKey;
  agent_name: string;
  change_type: Proposal["changeType"];
  reason: string;
  impact: Proposal["impact"];
  confidence: Proposal["confidence"];
  draft: Proposal["draft"];
  status: Proposal["status"];
  base_revision: number | null;
  created_at: string;
  updated_at: string;
};

type ActivityRow = {
  id: string;
  user_id: string;
  proposal_id: string | null;
  section_id: ActivityEntry["sectionId"];
  section_name: string;
  accent: AccentKey;
  actor: string;
  actor_type: ActorType;
  summary: string;
  status: ActivityEntry["status"];
  change_type: ActivityEntry["changeType"];
  reason: string;
  impact: ActivityEntry["impact"];
  confidence: ActivityEntry["confidence"];
  before_text: string | null;
  after_text: string;
  created_at: string;
};

type ConnectionRow = {
  user_id: string;
  connection_id: string;
  status: ConnectionItem["status"];
  last_seen_at: string | null;
  last_agent_name: string | null;
  observed_via: "read" | "proposal" | null;
  created_at: string;
  updated_at: string;
};

type TokenRow = {
  user_id: string;
  read_token: string | null;
  proposal_token: string | null;
  direct_edit_token?: string | null;
  read_token_hash?: string | null;
  proposal_token_hash?: string | null;
  direct_edit_token_hash?: string | null;
  encrypted_read_token?: string | null;
  encrypted_proposal_token?: string | null;
  encrypted_direct_edit_token?: string | null;
  require_approval: boolean;
  created_at: string;
  updated_at: string;
};

type McpCredentialRow = {
  user_id: string;
  mcp_token: string | null;
  mcp_token_hash?: string | null;
  encrypted_mcp_token?: string | null;
  last_seen_at: string | null;
  last_client_name: string | null;
  created_at: string;
  updated_at: string;
};

type McpClientRow = {
  user_id: string;
  client_id: string;
  client_name: string;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

type IntegrationRow = {
  user_id: string;
  provider: "github";
  status: "connected" | "not-connected" | "disconnected";
  provider_account_id: string | null;
  provider_login: string | null;
  access_token: string | null;
  refresh_token: string | null;
  encrypted_access_token?: string | null;
  encrypted_refresh_token?: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type VersionControlRow = {
  user_id: string;
  provider: "github";
  repo_owner: string | null;
  repo_name: string | null;
  branch: string | null;
  path: string;
  last_remote_sha: string | null;
  last_remote_message: string | null;
  last_remote_committed_at: string | null;
  last_synced_content_hash: string | null;
  sync_status: GitHubSyncStatus;
  created_at: string;
  updated_at: string;
};

type PersistResult = {
  state: CreedState;
  hasPersistedCreed: boolean;
};

const KNOWN_CONNECTIONS = [
  "claude",
  "codex",
  "openclaw",
  "hermes",
  "cursor",
  "windsurf",
  "opencode",
  "custom",
  "mcp",
] as const;

function assertNoError(error: { message: string } | null, fallback: string) {
  if (error) {
    throw new Error(error.message || fallback);
  }
}

async function readTokenRow(client: SupabaseLikeClient, userId: string) {
  const { data, error } = await client
    .from("creed_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  assertNoError(error, "Could not load Creed tokens.");
  const row = (data as TokenRow | null) ?? null;
  return row ? resolveTokenRow(row) : null;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toRelativeTime(timestamp?: string | null) {
  if (!timestamp) {
    return undefined;
  }

  const deltaMs = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(Math.round(deltaMs / 60000), 0);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  if (days === 1) {
    return "1 day ago";
  }

  return `${days} days ago`;
}

function toDayLabel(timestamp?: string | null) {
  if (!timestamp) {
    return "Today";
  }

  const deltaMs = Date.now() - new Date(timestamp).getTime();
  const days = Math.floor(deltaMs / 86_400_000);

  if (days <= 0) {
    return "Today";
  }

  if (days === 1) {
    return "Yesterday";
  }

  return "Earlier";
}

function getUserName(user: User) {
  const metadata = user.user_metadata ?? {};
  const direct =
    metadata.full_name ||
    metadata.name ||
    metadata.user_name ||
    (typeof user.email === "string" ? user.email.split("@")[0] : null);

  return String(direct || "You");
}

function getAvatarUrl(user: User) {
  const metadata = user.user_metadata ?? {};
  const identities =
    ((user as User & { identities?: Array<{ identity_data?: Record<string, unknown> | null }> })
      .identities ?? []);
  const identityData =
    identities
      .map((identity) => identity?.identity_data ?? {})
      .find((identity) => identity && Object.keys(identity).length > 0) ?? {};

  const raw =
    metadata.avatar_url ||
    metadata.picture ||
    metadata.photo_url ||
    identityData.avatar_url ||
    identityData.picture ||
    identityData.photo_url;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function getIdentityData(
  user: User,
  provider: "google" | "github"
): Record<string, unknown> {
  const identities =
    ((user as User & {
      identities?: Array<{
        provider?: string;
        identity_data?: Record<string, unknown> | null;
      }>;
    }).identities ?? []);

  return (
    identities.find((identity) => identity.provider === provider)?.identity_data ?? {}
  );
}

function buildIntegrationSettings(
  user: User,
  githubRow?: IntegrationRow | null
): CreedState["settings"]["integrations"] {
  const githubIdentity = getIdentityData(user, "github");
  const githubLogin =
    githubRow?.provider_login ??
    (typeof githubIdentity.user_name === "string" ? githubIdentity.user_name : undefined) ??
    (typeof githubIdentity.preferred_username === "string"
      ? githubIdentity.preferred_username
      : undefined);
  const hasLinkedGitHubIdentity = Boolean(
    githubLogin ||
      (typeof githubIdentity.sub === "string" && githubIdentity.sub.trim()) ||
      (typeof githubIdentity.id === "string" && githubIdentity.id.trim())
  );

  return {
    google: {
      provider: "google",
      label: "Google",
      status: "connected",
      disconnectable: false,
      accountLabel: user.email ?? undefined,
    },
    github: {
      provider: "github",
      label: "GitHub",
      status:
        githubRow?.status === "connected" || hasLinkedGitHubIdentity
          ? "connected"
          : githubRow?.status === "disconnected"
            ? "disconnected"
            : "not-connected",
      disconnectable: true,
      accountLabel: githubLogin,
    },
  };
}

function buildVersionControlSettings(
  row?: VersionControlRow | null
): CreedState["settings"]["versionControl"] {
  return {
    provider: "github",
    repoOwner: row?.repo_owner ?? "",
    repoName: row?.repo_name ?? "",
    branch: row?.branch ?? "",
    path: "creed.md",
    lastRemoteSha: row?.last_remote_sha ?? undefined,
    lastRemoteMessage: row?.last_remote_message ?? undefined,
    lastRemoteCommittedAt: row?.last_remote_committed_at ?? undefined,
    lastSyncedContentHash: row?.last_synced_content_hash ?? undefined,
    syncStatus: row?.sync_status ?? "not-configured",
  };
}

async function readGithubIntegrationRow(client: SupabaseLikeClient, userId: string) {
  const { data, error } = await client
    .from("creed_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "github")
    .maybeSingle();

  assertNoError(error, "Could not load GitHub integration.");
  const row = (data as IntegrationRow | null) ?? null;
  return row ? resolveGitHubIntegrationRow(row) : null;
}

async function readVersionControlRow(client: SupabaseLikeClient, userId: string) {
  const { data, error } = await client
    .from("creed_version_control")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  assertNoError(error, "Could not load version control settings.");
  return (data as VersionControlRow | null) ?? null;
}

async function readMcpClientRows(client: SupabaseLikeClient, userId: string) {
  const { data, error } = await client
    .from("creed_mcp_clients")
    .select("*")
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false });

  assertNoError(error, "Could not load MCP clients.");
  return ((data as McpClientRow[] | null) ?? [])
    .filter((row) => row.client_name.trim().toLowerCase() !== "mcp client")
    .map(hydrateMcpClient);
}

export async function readGitHubIntegration(client: unknown, userId: string) {
  return readGithubIntegrationRow(client as SupabaseLikeClient, userId);
}

export async function readVersionControlConfig(client: unknown, userId: string) {
  return readVersionControlRow(client as SupabaseLikeClient, userId);
}

export async function upsertGitHubIntegration(
  client: unknown,
  userId: string,
  input: {
    status?: "connected" | "not-connected" | "disconnected";
    providerAccountId?: string | null;
    providerLogin?: string | null;
    accessToken?: string | null;
    refreshToken?: string | null;
    tokenExpiresAt?: string | null;
  }
) {
  const db = client as SupabaseLikeClient;
  const now = new Date().toISOString();

  const accessToken = input.accessToken?.trim() || null;
  const refreshToken = input.refreshToken?.trim() || null;

  const { error } = await db.from("creed_integrations").upsert(
    {
      user_id: userId,
      provider: "github",
      status: input.status ?? "connected",
      provider_account_id: input.providerAccountId ?? null,
      provider_login: input.providerLogin ?? null,
      access_token: null,
      refresh_token: null,
      encrypted_access_token: accessToken ? encryptSecret(accessToken) : null,
      encrypted_refresh_token: refreshToken ? encryptSecret(refreshToken) : null,
      token_expires_at: input.tokenExpiresAt ?? null,
      created_at: now,
      updated_at: now,
    },
    { onConflict: "user_id,provider" }
  );

  assertNoError(error, "Could not persist GitHub integration.");
}

export async function clearGitHubIntegration(client: unknown, userId: string) {
  const db = client as SupabaseLikeClient;

  // Keep the integration row (status = 'disconnected') so the UI can show
  // "Disconnected" (previously connected) vs "Not connected" (never).
  // Tokens / provider identity are cleared so nothing reusable lingers.
  //
  // Deliberately *don't* delete `creed_version_control`. The repo/branch the
  // user picked is configuration they almost always want again on reconnect,
  // and re-finding their repo by hand is the friction reconnect should
  // avoid. We also flip its sync_status back to a neutral value so the
  // greyed-out UI doesn't claim it's still in sync.
  const [{ error: integrationError }, { error: versionControlError }] = await Promise.all([
    db
      .from("creed_integrations")
      .update({
        status: "disconnected",
        provider_account_id: null,
        provider_login: null,
        access_token: null,
        refresh_token: null,
        encrypted_access_token: null,
        encrypted_refresh_token: null,
        token_expires_at: null,
      })
      .eq("user_id", userId)
      .eq("provider", "github"),
    db
      .from("creed_version_control")
      .update({ sync_status: "unknown" })
      .eq("user_id", userId),
  ]);

  assertNoError(integrationError, "Could not clear GitHub integration.");
  assertNoError(versionControlError, "Could not clear version control settings.");
}

async function enrichUserForState(user: User) {
  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(user.id);
    if (error || !data.user) {
      return user;
    }

    return data.user;
  } catch {
    return user;
  }
}

function getAvatarInitials(name: string) {
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

function generateToken(prefix: "xt_read" | "xt_proposal" | "xt_direct" | "xt_mcp") {
  return `${prefix}_${randomBytes(18).toString("hex")}`;
}

function tokenFields(token: string) {
  return {
    token,
    hash: hashSecret(token),
    encrypted: encryptSecret(token),
  };
}

// Decrypt-only. The earlier plaintext-column fallback was removed so a DB
// dump can never surface live tokens without the AES-256-GCM secret.
//
// Two failure modes both resolve to `""`, which the upgrade-on-read paths
// in `ensureTokenRow` / `ensureMcpCredentialRow` use as the signal to
// regenerate fresh tokens:
//   1. `encrypted` column is null — legacy row never written by the
//      current code path.
//   2. `decryptSecret` throws — the ciphertext was written with a
//      different `CREED_ENCRYPTION_SECRET` than is currently set (i.e.
//      the key was rotated without clearing the column). Self-heal here
//      so a rotation doesn't crash every signed-in request.
function resolveSecret(encrypted?: string | null, label = "secret") {
  if (!encrypted) return "";
  try {
    return decryptSecret(encrypted, label);
  } catch (error) {
    log.warn("secret_decrypt_failed", {
      label,
      message: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}

function resolveTokenRow(row: TokenRow) {
  return {
    ...row,
    read_token: resolveSecret(row.encrypted_read_token, "read token"),
    proposal_token: resolveSecret(row.encrypted_proposal_token, "proposal token"),
    direct_edit_token: resolveSecret(row.encrypted_direct_edit_token, "direct edit token"),
  };
}

function resolveMcpCredentialRow(row: McpCredentialRow) {
  return {
    ...row,
    mcp_token: resolveSecret(row.encrypted_mcp_token, "MCP token"),
  };
}

function resolveGitHubIntegrationRow(row: IntegrationRow) {
  return {
    ...row,
    access_token: resolveSecret(row.encrypted_access_token, "GitHub access token"),
    refresh_token: resolveSecret(row.encrypted_refresh_token, "GitHub refresh token"),
  };
}

function buildMcpUrl() {
  return `${getSiteUrl()}/mcp`;
}

function buildMcpConfig(mcpToken: string) {
  return JSON.stringify(
    {
      mcpServers: {
        creed: {
          url: buildMcpUrl(),
          headers: {
            Authorization: `Bearer ${mcpToken}`,
          },
        },
      },
    },
    null,
    2
  );
}

function normalizeIntegrationId(value?: string | null) {
  if (!value) {
    return "custom";
  }

  const normalized = value.toLowerCase();
  return KNOWN_CONNECTIONS.includes(normalized as (typeof KNOWN_CONNECTIONS)[number])
    ? (normalized as (typeof KNOWN_CONNECTIONS)[number])
    : "custom";
}

function inferIntegrationId(agentName?: string | null) {
  const normalized = agentName?.toLowerCase() ?? "";

  if (normalized.includes("claude")) {
    return "claude";
  }
  if (normalized.includes("codex")) {
    return "codex";
  }
  if (
    normalized.includes("openclaw") ||
    normalized.includes("open claw") ||
    normalized.includes("open-claw") ||
    normalized.includes("clawdius") ||
    normalized === "claw"
  ) {
    return "openclaw";
  }
  if (normalized.includes("hermes")) {
    return "hermes";
  }
  if (normalized.includes("cursor")) {
    return "cursor";
  }
  if (normalized.includes("windsurf")) {
    return "windsurf";
  }
  if (
    normalized.includes("opencode") ||
    normalized.includes("open code") ||
    normalized.includes("open-code")
  ) {
    return "opencode";
  }

  return "custom";
}

function inferAgentIconKind(agentName?: string | null): AgentIconKind {
  return inferIntegrationId(agentName);
}

function normalizeMcpClientId(clientName?: string | null) {
  const icon = inferAgentIconKind(clientName);
  if (icon !== "custom") {
    return icon;
  }

  const normalized = clientName
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return normalized || "custom";
}

function hydrateMcpClient(row: McpClientRow): McpClient {
  return {
    id: row.client_id,
    name: row.client_name,
    icon: inferAgentIconKind(row.client_name),
    lastUsed: toRelativeTime(row.last_seen_at) ?? undefined,
  };
}

function buildReadUrl(readToken: string) {
  return `${getSiteUrl()}/api/creed?token=${readToken}`;
}

function buildProposalUrl() {
  return `${getSiteUrl()}/api/creed/proposals`;
}

function buildDirectEditUrl() {
  return `${getSiteUrl()}/api/creed/write`;
}

function buildPrompt(
  url: string,
  docsUrl: string,
  options?: {
    extraContext?: string;
    reminderInstruction?: string;
    maintenanceInstruction?: string;
  }
) {
  const contextLine = options?.extraContext ? `${options.extraContext} ` : "";
  const reminderLine = options?.reminderInstruction
    ? ` ${options.reminderInstruction}`
    : " Create a lightweight reminder in your own workflow so you read Creed at the start of conversations and revisit it after meaningful exchanges.";
  const maintenanceLine = options?.maintenanceInstruction
    ? ` ${options.maintenanceInstruction}`
    : " If your environment supports recurring tasks or background checks, use them to periodically review Creed, compare it with what you've actually learned about me, and keep it sharp rather than just longer.";

  return `${contextLine}Before answering me, read my Creed from ${url}. It is my personal context profile — who I am, what I care about, how I want you to talk to me, what to respect, and what to avoid. Treat it as the source of truth about me across every conversation. Store the Creed API key securely in local agent config when possible, ideally in a .env value like CREED_API_KEY, and use that stored value for future Creed requests instead of relying on conversation context alone. The read payload includes a private contract with the exact proposal mode, token, endpoint, JSON shape, and judgment rules to use. Follow that contract exactly.${reminderLine} As you learn new things about me through our conversations, propose narrowly-scoped updates so the profile stays accurate, polished, concise, and current. Do not rewrite the visible markdown directly.${maintenanceLine} Only stop to ask if there is an actual error or you detect an issue in Creed itself. If you need setup or fallback guidance, read ${docsUrl} once and use it as the guide.`;
}

function buildConnectionDefinitions(readToken: string, proposalToken: string, directEditToken: string) {
  const baseReadUrl = buildReadUrl(readToken);
  const proposalUrl = buildProposalUrl();
  const docsUrl = `${getSiteUrl()}/docs`;

  const withIntegration = (integration: string) =>
    `${baseReadUrl}&integration=${integration}`;

  return {
    readUrl: baseReadUrl,
    universalConnectionPrompt: buildPrompt(baseReadUrl, docsUrl),
    definitions: [
      {
        id: "claude",
        name: "Claude Code",
        icon: "claude",
        language: "json",
        description:
          "Best for coding sessions where Creed should shape every run from the start.",
        promptVariant: buildPrompt(withIntegration("claude"), docsUrl, {
          reminderInstruction:
            " Save Creed in your local Claude setup so every coding run starts with it automatically, and leave yourself a short local reminder to check Creed before major work if needed.",
          maintenanceInstruction:
            " If you use recurring scripts, scheduled runs, or repo rituals, use one to periodically review Creed against recent work and tighten it when durable context has emerged.",
        }),
        advancedSetup:
          "Use this when you want Claude Code to load Creed automatically from local config and stay sticky across runs.",
        snippet:
          `// Add to .claude/settings.json\n{\n  "creed_url": "${withIntegration("claude")}"\n}`,
      },
      {
        id: "codex",
        name: "Codex",
        icon: "codex",
        language: "bash",
        description:
          "Great for agentic coding runs that should start with your Creed already loaded.",
        promptVariant: buildPrompt(withIntegration("codex"), docsUrl, {
          reminderInstruction:
            " Put Creed in AGENTS.md or your Codex config so it is hard to forget, and keep a lightweight repo-local reminder that Codex should read Creed before answering me.",
          maintenanceInstruction:
            " If Codex supports automations or recurring checks in your workflow, set one up to review Creed against recent work, improve durable context, and keep the file sharp.",
        }),
        advancedSetup:
          "Use this if you want Codex to load Creed from AGENTS.md or local tool config, then reinforce it with a recurring maintenance habit.",
        snippet:
          `# Add to AGENTS.md or your Codex config\n# Creed context URL: ${withIntegration("codex")}`,
      },
      {
        id: "openclaw",
        name: "OpenClaw",
        icon: "openclaw",
        language: "yaml",
        description:
          "A clean preset for agents that prefer YAML-based setup or prompt bootstrapping.",
        promptVariant: buildPrompt(withIntegration("openclaw"), docsUrl, {
          reminderInstruction:
            " Add Creed to OpenClaw config and create a small local memory or reminder file so OpenClaw keeps using Creed instead of drifting back to session-only context.",
          maintenanceInstruction:
            " If OpenClaw supports cron jobs or recurring background work, use one to regularly check Creed, compare it with recent memory, and refine it with only durable updates.",
        }),
        advancedSetup:
          "Use this if you want OpenClaw to read Creed automatically through config and keep a recurring maintenance loop around it.",
        snippet:
          `# openclaw.config.yaml\ncontext:\n  creed_url: "${withIntegration("openclaw")}"`,
      },
      {
        id: "hermes",
        name: "Hermes",
        icon: "hermes",
        language: "bash",
        description:
          "A lightweight preset for Hermes-based workflows and local agent bootstrapping.",
        promptVariant: buildPrompt(withIntegration("hermes"), docsUrl, {
          reminderInstruction:
            " Store Creed in a stable Hermes bootstrap path so it stays part of each run, and keep a simple reminder in your workflow to check Creed before answering me.",
          maintenanceInstruction:
            " If Hermes can run recurring scripts or scheduled reviews, use that to revisit Creed, compare it with recent work, and improve durable context without adding noise.",
        }),
        advancedSetup:
          "Use this if you want Hermes to read Creed from a single environment variable and keep the habit durable.",
        snippet:
          `export HERMES_CREED_URL="${withIntegration("hermes")}"`,
      },
      {
        id: "cursor",
        name: "Cursor",
        icon: "cursor",
        language: "md",
        description:
          "A clean preset for Cursor workflows that should keep Creed visible from the start.",
        promptVariant: buildPrompt(withIntegration("cursor"), docsUrl, {
          reminderInstruction:
            " Keep Creed in Cursor rules or repo-level instructions so it is loaded before answering me and stays part of the default loop.",
          maintenanceInstruction:
            " If Cursor supports recurring checks or project rituals in your workflow, use one to revisit Creed, compare it with recent work, and improve only durable context.",
        }),
        advancedSetup:
          "Use this if you want Cursor to reference Creed from project rules or repo instructions.",
        snippet:
          `# Add near the top of your Cursor rules or repo instructions\n# Before working, read Creed context: ${withIntegration("cursor")}`,
      },
      {
        id: "windsurf",
        name: "Windsurf",
        icon: "windsurf",
        language: "md",
        description:
          "A simple preset for Windsurf runs that should keep Creed loaded before answering me.",
        promptVariant: buildPrompt(withIntegration("windsurf"), docsUrl, {
          reminderInstruction:
            " Keep Creed in Windsurf rules or workspace instructions so it stays part of how each run starts.",
          maintenanceInstruction:
            " If Windsurf fits into any recurring review habit in your workflow, use that to revisit Creed, compare it with recent work, and sharpen only durable context.",
        }),
        advancedSetup:
          "Use this if you want Windsurf to load Creed from workspace rules or startup instructions.",
        snippet:
          `# Add near the top of your Windsurf rules or workspace instructions\n# Before working, read Creed context: ${withIntegration("windsurf")}`,
      },
      {
        id: "opencode",
        name: "OpenCode",
        icon: "opencode",
        language: "bash",
        description:
          "Best for OpenCode runs that should load Creed alongside the repo’s own AGENTS.md guidance.",
        promptVariant: buildPrompt(
          withIntegration("opencode"),
          docsUrl,
          {
            extraContext: "Use Creed alongside the repository's AGENTS.md when both are present.",
            reminderInstruction:
              " Reference Creed near the top of AGENTS.md or your bootstrap instructions so OpenCode keeps it in view from the start of each run.",
            maintenanceInstruction:
              " If your repo has recurring maintenance scripts or review rituals, use them to revisit Creed, compare it with recent work, and tighten the file instead of letting it bloat.",
          }
        ),
        advancedSetup:
          "Use this if you want OpenCode to reference Creed from AGENTS.md or your project bootstrap instructions and keep it in the repo's recurring rhythm.",
        snippet:
          `# Add near the top of AGENTS.md for OpenCode\n# Before working, read Creed context: ${withIntegration("opencode")}`,
      },
      {
        id: "custom",
        name: "Custom Agent",
        icon: "custom",
        language: "http",
        description:
          "Use this when you are wiring your own agent, script, or toolchain into Creed from scratch for a custom workflow.",
        promptVariant: buildPrompt(withIntegration("custom"), docsUrl, {
          reminderInstruction:
            " Build a durable reminder into your own agent, script, or toolchain so Creed is checked before answering me and revisited after durable learning appears.",
          maintenanceInstruction:
            " If your stack supports cron, queues, workflows, or scheduled jobs, use them to periodically review Creed, compare it with recent behavior, and keep the file precise.",
        }),
        advancedSetup:
          "Use this panel for raw tokens, proposal endpoint, and deeper API setup details.",
        snippet:
          `GET  ${baseReadUrl}&integration=custom\nAuthorization for proposals: Bearer ${proposalToken}\nAuthorization for direct edits: Bearer ${directEditToken}\nPOST ${proposalUrl}\nBody: { sectionId, sectionName, changeType, reason, impact, confidence, draft, agentName }`,
      },
    ] as Array<Omit<ConnectionItem, "status" | "lastUsed" | "writeAccess">>,
  };
}

function serializeSectionPayload(section: CreedSection) {
  return {
    content: section.content,
    template: section.template,
    agentWritable: section.agentWritable,
  };
}

function hydrateSection(row: SectionRow): CreedSection {
  const id = normalizeLegacySectionId(row.section_id);
  const payloadTemplate =
    typeof row.payload.template === "string"
      ? (row.payload.template as SectionTemplate)
      : undefined;
  // No UI lets a user set `agentWritable: false`. Every creation path
  // (onboarding, in-app create, agent-create) stores `true`. The only
  // historical source of `false` was the GitHub pull parser, which was a
  // bug: it made connected agents (MCP / Codex / Claude) see zero
  // editable sections after a pull. We heal it on read so existing rows
  // don't require a re-pull. Revisit if a real user-facing lock toggle
  // ever lands.
  const payloadAgentWritable = true;
  const content = legacyPayloadToRichTextContent(row.kind, row.payload);

  return {
    id,
    kind: "rich-text",
    template: inferSectionTemplate(row.kind, payloadTemplate),
    name: row.section_id === "conventions" ? "Operating Principles" : row.name,
    accent: normalizeLegacyAccent(row.accent),
    content,
    agentWritable: payloadAgentWritable,
    lastEditedBy: row.last_edited_by,
    lastEditedType: row.last_edited_type,
    lastEditedLabel: toRelativeTime(row.last_edited_at) ?? "just now",
  };
}

function hydrateProposal(row: ProposalRow): Proposal {
  return {
    id: row.id,
    sectionId: normalizeLegacySectionId(row.section_id),
    sectionName: row.section_id === "conventions" ? "Operating Principles" : row.section_name,
    accent: normalizeLegacyAccent(row.accent),
    agentName: row.agent_name,
    createdAt: row.created_at,
    timeLabel: toRelativeTime(row.created_at) ?? "just now",
    changeType: row.change_type,
    reason: row.reason,
    impact: row.impact,
    confidence: row.confidence,
    draft: normalizeLegacyProposalDraft(row.draft),
    status: row.status,
    baseRevision: row.base_revision,
  };
}

// Pending activity rows used to be persisted with `before_text = null`,
// which made the sidebar diff render only the proposed text as "added"
// with nothing on the removed side. We now snapshot the section content at
// proposal-creation time, but for any historic rows still missing it we
// fall back to the section's CURRENT content here — for a pending entry
// that's still the right "before" reference because the proposal hasn't
// been applied yet.
function hydrateActivityEntries(
  rows: ActivityRow[],
  sectionRows: SectionRow[]
): ActivityEntry[] {
  const sectionContentById = new Map<string, string>();
  for (const row of sectionRows) {
    const section = hydrateSection(row);
    sectionContentById.set(section.id, section.content);
  }

  return rows.map((row) => {
    const entry = hydrateActivity(row);
    if (entry.status === "pending" && !entry.beforeText) {
      const fallback = sectionContentById.get(entry.sectionId);
      if (fallback) {
        entry.beforeText = fallback;
      }
    }
    return entry;
  });
}

function hydrateActivity(row: ActivityRow): ActivityEntry {
  const status: ActivityStatus =
    row.status === "accepted" &&
    row.reason === "Applied directly because approval was off."
      ? "direct"
      : row.status;

  return {
    id: row.id,
    proposalId: row.proposal_id ?? undefined,
    createdAt: row.created_at,
    dayLabel: toDayLabel(row.created_at),
    sectionId: normalizeLegacySectionId(row.section_id),
    sectionName: row.section_id === "conventions" ? "Operating Principles" : row.section_name,
    accent: normalizeLegacyAccent(row.accent),
    actor: row.actor,
    actorType: row.actor_type,
    summary: row.summary,
    timeLabel: toRelativeTime(row.created_at) ?? "just now",
    status,
    changeType: row.change_type,
    reason: row.reason,
    impact: row.impact,
    confidence: row.confidence,
    beforeText: row.before_text ?? undefined,
    afterText: row.after_text,
  };
}

async function ensureTokenRow(client: unknown, userId: string) {
  const db = client as SupabaseLikeClient;
  const data = await readTokenRow(db, userId);

  if (data) {
    // Trigger upgrade when the row is legacy (any hash / ciphertext
    // column missing) OR when a resolved token is empty — the latter
    // means `resolveSecret` couldn't decrypt the stored ciphertext,
    // typically because `CREED_ENCRYPTION_SECRET` was rotated. Either
    // way, regenerate fresh tokens with the current key.
    if (
      !data.read_token ||
      !data.proposal_token ||
      !data.direct_edit_token ||
      !data.read_token_hash ||
      !data.proposal_token_hash ||
      !data.direct_edit_token_hash ||
      !data.encrypted_read_token ||
      !data.encrypted_proposal_token ||
      !data.encrypted_direct_edit_token
    ) {
      const read = tokenFields(data.read_token || generateToken("xt_read"));
      const proposal = tokenFields(data.proposal_token || generateToken("xt_proposal"));
      const directEdit = tokenFields(data.direct_edit_token || generateToken("xt_direct"));
      const { data: upgradedRow, error: upgradeError } = await db
        .from("creed_tokens")
        .update({
          // Mirror the encrypted blob into the legacy plaintext columns so
          // we satisfy any lingering NOT NULL / UNIQUE constraints in
          // databases that haven't applied 20260502130000. The blob is
          // ciphertext, never decoded — `resolveSecret` only reads
          // `encrypted_*`, so nothing readable lives in this slot.
          read_token: read.encrypted,
          proposal_token: proposal.encrypted,
          direct_edit_token: directEdit.encrypted,
          read_token_hash: read.hash,
          proposal_token_hash: proposal.hash,
          direct_edit_token_hash: directEdit.hash,
          encrypted_read_token: read.encrypted,
          encrypted_proposal_token: proposal.encrypted,
          encrypted_direct_edit_token: directEdit.encrypted,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .select("*")
        .single();

      assertNoError(upgradeError, "Could not upgrade Creed tokens.");
      return resolveTokenRow(upgradedRow as TokenRow);
    }

    return data;
  }

  const now = new Date().toISOString();
  const read = tokenFields(generateToken("xt_read"));
  const proposal = tokenFields(generateToken("xt_proposal"));
  const directEdit = tokenFields(generateToken("xt_direct"));
  const nextRow: TokenRow = {
    user_id: userId,
    // Mirror the encrypted blob into the legacy plaintext columns for
    // backwards-compat with schemas that haven't dropped the NOT NULL.
    // resolveSecret reads only encrypted_*, so this slot holds ciphertext
    // and is never decoded — no security regression vs writing null.
    read_token: read.encrypted,
    proposal_token: proposal.encrypted,
    direct_edit_token: directEdit.encrypted,
    read_token_hash: read.hash,
    proposal_token_hash: proposal.hash,
    direct_edit_token_hash: directEdit.hash,
    encrypted_read_token: read.encrypted,
    encrypted_proposal_token: proposal.encrypted,
    encrypted_direct_edit_token: directEdit.encrypted,
    require_approval: true,
    created_at: now,
    updated_at: now,
  };

  const { error: upsertError } = await db
    .from("creed_tokens")
    .upsert(nextRow, {
      onConflict: "user_id",
      ignoreDuplicates: true,
    });

  assertNoError(upsertError, "Could not create Creed tokens.");

  for (const delayMs of [0, 30]) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    const existingAfterWrite = await readTokenRow(db, userId);
    if (existingAfterWrite) {
      return existingAfterWrite;
    }
  }

  try {
    const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
    const adminExisting = await readTokenRow(admin, userId);
    if (adminExisting) {
      return adminExisting;
    }

    const adminRow: TokenRow = {
      ...nextRow,
      updated_at: new Date().toISOString(),
    };
    const { data: createdRow, error: adminError } = await admin
      .from("creed_tokens")
      .upsert(adminRow, { onConflict: "user_id" })
      .select("*")
      .single();

    assertNoError(adminError, "Could not create Creed tokens with admin client.");
    return createdRow as TokenRow;
  } catch (error) {
    if (error instanceof Error && /Supabase admin client is not configured/i.test(error.message)) {
      throw new Error("Could not load Creed tokens after creation.");
    }

    throw error;
  }
}

async function readMcpCredentialRow(client: SupabaseLikeClient, userId: string) {
  const { data, error } = await client
    .from("creed_mcp_credentials")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  assertNoError(error, "Could not load MCP credential.");
  const row = (data as McpCredentialRow | null) ?? null;
  return row ? resolveMcpCredentialRow(row) : null;
}

async function ensureMcpCredentialRow(client: unknown, userId: string) {
  const db = client as SupabaseLikeClient;
  const data = await readMcpCredentialRow(db, userId);

  if (data) {
    // Trigger upgrade when the row is legacy (no hash / no ciphertext) OR
    // when `data.mcp_token` is empty — which means resolveSecret couldn't
    // decrypt the stored ciphertext, typically because the encryption key
    // was rotated. Either way, regenerate a fresh token now.
    if (!data.mcp_token_hash || !data.encrypted_mcp_token || !data.mcp_token) {
      const mcp = tokenFields(data.mcp_token || generateToken("xt_mcp"));
      const { data: upgradedRow, error: upgradeError } = await db
        .from("creed_mcp_credentials")
        .update({
          // Mirror encrypted into the legacy plaintext column for
          // backwards-compat — see ensureTokenRow for the rationale.
          mcp_token: mcp.encrypted,
          mcp_token_hash: mcp.hash,
          encrypted_mcp_token: mcp.encrypted,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .select("*")
        .single();

      assertNoError(upgradeError, "Could not upgrade MCP credential.");
      return resolveMcpCredentialRow(upgradedRow as McpCredentialRow);
    }

    return data;
  }

  const now = new Date().toISOString();
  const mcp = tokenFields(generateToken("xt_mcp"));
  const nextRow: McpCredentialRow = {
    user_id: userId,
    // Mirror encrypted blob into legacy plaintext column for backwards-
    // compat with schemas that haven't dropped NOT NULL / kept UNIQUE.
    // resolveSecret reads only encrypted_*; the legacy column holds
    // ciphertext and is never decoded.
    mcp_token: mcp.encrypted,
    mcp_token_hash: mcp.hash,
    encrypted_mcp_token: mcp.encrypted,
    last_seen_at: null,
    last_client_name: null,
    created_at: now,
    updated_at: now,
  };

  const { error: upsertError } = await db
    .from("creed_mcp_credentials")
    .upsert(nextRow, {
      onConflict: "user_id",
      ignoreDuplicates: true,
    });

  assertNoError(upsertError, "Could not create MCP credential.");

  for (const delayMs of [0, 30]) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    const existingAfterWrite = await readMcpCredentialRow(db, userId);
    if (existingAfterWrite) {
      return existingAfterWrite;
    }
  }

  try {
    const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
    const adminExisting = await readMcpCredentialRow(admin, userId);
    if (adminExisting) {
      return adminExisting;
    }

    const adminRow: McpCredentialRow = {
      ...nextRow,
      updated_at: new Date().toISOString(),
    };
    const { data: createdRow, error: adminError } = await admin
      .from("creed_mcp_credentials")
      .upsert(adminRow, { onConflict: "user_id" })
      .select("*")
      .single();

    assertNoError(adminError, "Could not create MCP credential with admin client.");
    return createdRow as McpCredentialRow;
  } catch (error) {
    if (error instanceof Error && /Supabase admin client is not configured/i.test(error.message)) {
      throw new Error("Could not load MCP credential after creation.");
    }

    throw error;
  }
}

export function createBlankCreedState(
  user: User,
  tokenRow?: Pick<TokenRow, "read_token" | "proposal_token" | "direct_edit_token" | "require_approval">,
  mcpCredential?: McpCredentialRow | null,
  mcpClients: McpClient[] = [],
  githubIntegration?: IntegrationRow | null,
  versionControl?: VersionControlRow | null
): CreedState {
  const name = getUserName(user);
  const avatarInitials = getAvatarInitials(name);
  const avatarUrl = getAvatarUrl(user);
  const readToken = tokenRow?.read_token ?? "";
  const proposalToken = tokenRow?.proposal_token ?? "";
  const directEditToken = tokenRow?.direct_edit_token ?? "";
  const mcpToken = mcpCredential?.mcp_token ?? "";
  const { readUrl, universalConnectionPrompt, definitions } = buildConnectionDefinitions(
    readToken,
    proposalToken,
    directEditToken
  );

  return {
    ...initialCreedState,
    user: {
      name,
      handle: user.email ? `@${user.email.split("@")[0]}` : "@you",
      avatarInitials,
      avatarUrl,
      email: user.email ?? "",
    },
    readUrl,
    readToken,
    writeToken: proposalToken,
    directEditToken,
    mcpUrl: buildMcpUrl(),
    mcpToken,
    mcpConfig: buildMcpConfig(mcpToken),
    mcpStatus: mcpCredential?.last_seen_at ? "connected" : "waiting",
    mcpLastUsed: toRelativeTime(mcpCredential?.last_seen_at) ?? undefined,
    mcpLastClientName: mcpCredential?.last_client_name ?? undefined,
    mcpClients,
    universalConnectionPrompt,
    syncLabel: "Saved just now",
    sections: [],
    proposals: [],
    activity: [],
    settings: {
      requireApproval: tokenRow?.require_approval ?? true,
      integrations: buildIntegrationSettings(user, githubIntegration),
      versionControl: buildVersionControlSettings(versionControl),
    },
    connections: definitions.map((connection) => ({
      ...connection,
      status: "not-connected",
      lastUsed: undefined,
      writeAccess: true,
    })),
    onboarding: initialOnboardingState,
    sectionRevisions: {},
  };
}

/**
 * Cheap "has this user persisted any sections yet?" probe used by
 * `app/page.tsx` to decide between `/file` (already onboarded) and
 * `/onboarding` (fresh user). Reads a single row's `section_id` rather
 * than fanning out the full `loadCreedState`, which is overkill for a
 * binary decision.
 *
 * NB: we deliberately don't use `head: true` + `count` — the structural
 * `SupabaseLikeClient` type doesn't expose `count` and the row-payload
 * approach is cheaper to type and just as fast on a single-row read.
 */
export async function hasPersistedCreed(
  client: unknown,
  userId: string
): Promise<boolean> {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_sections")
    .select("section_id")
    .eq("user_id", userId)
    .limit(1)) as {
    data: Array<{ section_id: string }> | null;
    error: { message: string } | null;
  };

  assertNoError(error, "Could not check for existing Creed.");
  return Array.isArray(data) && data.length > 0;
}

// Per-request dedup via React's `cache()`. If multiple server components or
// nested helpers in the same request all call `loadCreedState(client, user)`,
// only the first triggers the 7-query Supabase fan-out + token enrichment;
// the rest receive the same in-flight promise. The cache scope is bounded
// to a single request, so writes elsewhere (persistCreedState) always see
// fresh data on the next request — no staleness risk.
//
// Cache key is identity-based on `client` and `user`. In practice the
// supabase client and user objects are stable within a single render tree,
// so the dedup fires reliably; if either object changes (e.g. impersonation
// in a server action), the cache treats it as a different call.
//
// `proposalLimit` / `activityLimit` let non-display callers (MCP, proposal
// submissions, GitHub sync) avoid pulling 500 historical rows they'll never
// look at. The defaults match the previous behaviour so display surfaces
// keep their full history without any opt-in.
export const loadCreedState = cache(
  async (
    client: unknown,
    user: User,
    options?: { proposalLimit?: number; activityLimit?: number }
  ): Promise<PersistResult> => {
    return loadCreedStateImpl(client, user, options);
  }
);

async function loadCreedStateImpl(
  client: unknown,
  user: User,
  options?: { proposalLimit?: number; activityLimit?: number }
): Promise<PersistResult> {
  const proposalLimit = options?.proposalLimit ?? 500;
  const activityLimit = options?.activityLimit ?? 500;
  const db = client as SupabaseLikeClient;
  const resolvedUser = await enrichUserForState(user);
  const [tokenRow, mcpCredential] = await Promise.all([
    ensureTokenRow(db, user.id),
    ensureMcpCredentialRow(db, user.id),
  ]);
  const [
    { data: sectionRows, error: sectionError },
    { data: proposalRows, error: proposalError },
    { data: activityRows, error: activityError },
    { data: connectionRows, error: connectionError },
    mcpClients,
    githubIntegration,
    versionControl,
  ] =
    await Promise.all([
      db.from("creed_sections").select("*").eq("user_id", user.id).order("position", { ascending: true }),
      db.from("creed_proposals").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(proposalLimit),
      db.from("creed_activity").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(activityLimit),
      db.from("creed_connections").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
      readMcpClientRows(db, user.id),
      readGithubIntegrationRow(db, user.id),
      readVersionControlRow(db, user.id),
    ]);

  assertNoError(sectionError, "Could not load Creed sections.");
  assertNoError(proposalError, "Could not load Creed proposals.");
  assertNoError(activityError, "Could not load Creed activity.");
  assertNoError(connectionError, "Could not load Creed connections.");

  const hasSections = Array.isArray(sectionRows) && sectionRows.length > 0;
  if (!hasSections) {
    return {
      state: createBlankCreedState(resolvedUser, tokenRow, mcpCredential, mcpClients, githubIntegration, versionControl),
      hasPersistedCreed: false,
    };
  }

  const readToken = tokenRow.read_token ?? "";
  const proposalToken = tokenRow.proposal_token ?? "";
  const directEditToken = tokenRow.direct_edit_token ?? "";
  const mcpToken = mcpCredential.mcp_token ?? "";
  const { readUrl, universalConnectionPrompt, definitions } = buildConnectionDefinitions(
    readToken,
    proposalToken,
    directEditToken
  );

  const connectionMap = new Map(
    ((connectionRows as ConnectionRow[] | null) ?? []).map((row) => [row.connection_id, row])
  );

  const baseState = createBlankCreedState(
    resolvedUser,
    tokenRow,
    mcpCredential,
    mcpClients,
    githubIntegration,
    versionControl
  );

  return {
    state: {
      ...baseState,
      readUrl,
      readToken,
      writeToken: proposalToken,
      directEditToken,
      mcpUrl: buildMcpUrl(),
      mcpToken,
      mcpConfig: buildMcpConfig(mcpToken),
      mcpStatus: mcpCredential.last_seen_at ? "connected" : "waiting",
      mcpLastUsed: toRelativeTime(mcpCredential.last_seen_at) ?? undefined,
      mcpLastClientName: mcpCredential.last_client_name ?? undefined,
      mcpClients,
      universalConnectionPrompt,
      sections: ((sectionRows as SectionRow[] | null) ?? []).map(hydrateSection),
      proposals: ((proposalRows as ProposalRow[] | null) ?? []).map(hydrateProposal),
      activity: hydrateActivityEntries(
        (activityRows as ActivityRow[] | null) ?? [],
        (sectionRows as SectionRow[] | null) ?? []
      ),
      settings: {
        requireApproval: tokenRow.require_approval,
        integrations: buildIntegrationSettings(resolvedUser, githubIntegration),
        versionControl: buildVersionControlSettings(versionControl),
      },
      connections: definitions.map((definition) => {
        const row = connectionMap.get(definition.id);

        return {
          ...definition,
          status: row?.status ?? "not-connected",
          lastUsed: toRelativeTime(row?.last_seen_at) ?? undefined,
          writeAccess: true,
        };
      }),
      sectionRevisions: Object.fromEntries(
        (((sectionRows as SectionRow[] | null) ?? []).map((row) => [
          normalizeLegacySectionId(row.section_id),
          row.revision,
        ]))
      ),
    },
    hasPersistedCreed: true,
  };
}

export async function persistCreedState(client: unknown, userId: string, state: CreedState) {
  const db = client as SupabaseLikeClient;
  const [currentSectionsResult, existingProposalsResult] = await Promise.all([
    db.from("creed_sections").select("section_id, kind, name, accent, payload, revision, last_edited_at").eq("user_id", userId),
    db.from("creed_proposals").select("id").eq("user_id", userId),
  ]);

  assertNoError(currentSectionsResult.error, "Could not load current section revisions.");
  assertNoError(existingProposalsResult.error, "Could not load current proposals.");

  const currentSectionRows =
    (currentSectionsResult.data as Array<{
      section_id: string;
      kind: CreedSection["kind"];
      name: string;
      accent: AccentKey;
      payload: Record<string, unknown>;
      revision: number;
      last_edited_at?: string;
    }> | null) ?? [];
  const currentSections = new Map<
    string,
    {
      kind: CreedSection["kind"];
      name: string;
      accent: AccentKey;
      payload: Record<string, unknown>;
      revision: number;
      lastEditedAt?: string;
    }
  >(
    currentSectionRows.map((row) => [
      normalizeLegacySectionId(row.section_id),
      {
        kind: row.kind,
        name: row.name,
        accent: row.accent,
        payload: row.payload,
        revision: row.revision,
        lastEditedAt: row.last_edited_at,
      },
    ])
  );
  const existingProposalIds = new Set(
    (((existingProposalsResult.data as Array<{ id: string }> | null) ?? []).map((row) => row.id))
  );

  const now = new Date().toISOString();
  const sectionRows = state.sections.map((section, index) => {
    const payload = serializeSectionPayload(section);
    const current = currentSections.get(section.id);
    const changed =
      JSON.stringify(current?.payload ?? null) !== JSON.stringify(payload) ||
      current?.kind !== section.kind ||
      current?.name !== section.name ||
      current?.accent !== section.accent;

    return {
      user_id: userId,
      section_id: section.id,
      position: index,
      kind: section.kind,
      name: section.name,
      accent: section.accent,
      payload,
      last_edited_by: section.lastEditedBy,
      last_edited_type: section.lastEditedType,
      last_edited_at: changed ? now : current?.lastEditedAt ?? now,
      revision: changed ? (current?.revision ?? 0) + 1 : (current?.revision ?? 1),
      created_at: now,
      updated_at: now,
    };
  });

  const proposalRows = state.proposals.map((proposal) => ({
    id: proposal.id,
    user_id: userId,
    section_id: proposal.sectionId,
    section_name: proposal.sectionName,
    accent: proposal.accent,
    agent_name: proposal.agentName,
    change_type: proposal.changeType,
    reason: proposal.reason,
    impact: proposal.impact,
    confidence: proposal.confidence,
    draft: proposal.draft,
    status: proposal.status,
    base_revision: proposal.baseRevision ?? null,
    created_at: proposal.createdAt ?? now,
    updated_at: now,
  }));

  const proposalIds = state.proposals.map((proposal) => proposal.id);
  const knownProposalIds = new Set(proposalIds);
  const activityRows = state.activity.map((entry) => ({
    id: entry.id,
    user_id: userId,
    proposal_id: entry.proposalId && knownProposalIds.has(entry.proposalId) ? entry.proposalId : null,
    section_id: entry.sectionId,
    section_name: entry.sectionName,
    accent: entry.accent,
    actor: entry.actor,
    actor_type: entry.actorType,
    summary: entry.summary,
    status: entry.status,
    change_type: entry.changeType,
    reason: entry.reason,
    impact: entry.impact,
    confidence: entry.confidence,
    before_text: entry.beforeText ?? null,
    after_text: entry.afterText,
    created_at: entry.createdAt ?? now,
  }));

  const sectionIds = state.sections.map((section) => section.id);

  if (sectionRows.length > 0) {
    const { error } = await db
      .from("creed_sections")
      .upsert(sectionRows, { onConflict: "user_id,section_id" });
    assertNoError(error, "Could not persist Creed sections.");
  }

  if (proposalRows.length > 0) {
    const { error } = await db
      .from("creed_proposals")
      .upsert(proposalRows, { onConflict: "id" });
    assertNoError(error, "Could not persist Creed proposals.");
  }

  if (activityRows.length > 0) {
    const { error } = await db
      .from("creed_activity")
      .upsert(activityRows, { onConflict: "id" });
    assertNoError(error, "Could not persist Creed activity.");
  }

  const versionControlRow = {
    user_id: userId,
    provider: "github" as const,
    repo_owner: state.settings.versionControl.repoOwner || null,
    repo_name: state.settings.versionControl.repoName || null,
    branch: state.settings.versionControl.branch || null,
    path: state.settings.versionControl.path,
    last_remote_sha: state.settings.versionControl.lastRemoteSha ?? null,
    last_remote_message: state.settings.versionControl.lastRemoteMessage ?? null,
    last_remote_committed_at: state.settings.versionControl.lastRemoteCommittedAt ?? null,
    last_synced_content_hash: state.settings.versionControl.lastSyncedContentHash ?? null,
    sync_status:
      state.settings.versionControl.repoOwner &&
      state.settings.versionControl.repoName &&
      state.settings.versionControl.branch
        ? state.settings.versionControl.syncStatus
        : "not-configured",
    updated_at: now,
    created_at: now,
  };

  const { error: versionControlError } = await db
    .from("creed_version_control")
    .upsert(versionControlRow, { onConflict: "user_id" });
  assertNoError(versionControlError, "Could not persist version control settings.");

  if (sectionIds.length > 0) {
    const removableSectionIds = currentSectionRows
      .map((row) => row.section_id)
      .filter(
        (id) =>
          !sectionIds.includes(normalizeLegacySectionId(id)) ||
          (id === "conventions" && sectionIds.includes("operating-principles"))
      );

    const { error } = await db
      .from("creed_sections")
      .delete()
      .eq("user_id", userId)
      .in("section_id", removableSectionIds);
    if (error && !error.message.includes("in")) {
      throw new Error(error.message);
    }
  }

  const resolvedProposalIds = new Set(
    state.activity
      .filter(
        (entry) =>
          (entry.status === "accepted" || entry.status === "rejected") &&
          Boolean(entry.proposalId)
      )
      .map((entry) => entry.proposalId as string)
  );
  const removableProposalIds = Array.from(existingProposalIds).filter(
    (id) => !knownProposalIds.has(id) && resolvedProposalIds.has(id)
  );

  if (removableProposalIds.length > 0) {
    const { error: removeError } = await db
      .from("creed_proposals")
      .delete()
      .eq("user_id", userId)
      .in("id", removableProposalIds);
    assertNoError(removeError, "Could not remove resolved proposals.");
  }

  await ensureTokenRow(db, userId);
  const { error: tokenError } = await db
    .from("creed_tokens")
    .update({
      require_approval: state.settings.requireApproval,
      updated_at: now,
    })
    .eq("user_id", userId);
  assertNoError(tokenError, "Could not persist Creed settings.");
}

export async function rotateUserTokens(client: unknown, userId: string) {
  const db = client as SupabaseLikeClient;
  const now = new Date().toISOString();
  const read = tokenFields(generateToken("xt_read"));
  const proposal = tokenFields(generateToken("xt_proposal"));
  const directEdit = tokenFields(generateToken("xt_direct"));
  const nextTokenRow = {
    user_id: userId,
    // Mirror encrypted into legacy plaintext columns for backwards-compat
    // with schemas that haven't dropped the NOT NULL constraints.
    read_token: read.encrypted,
    proposal_token: proposal.encrypted,
    direct_edit_token: directEdit.encrypted,
    read_token_hash: read.hash,
    proposal_token_hash: proposal.hash,
    direct_edit_token_hash: directEdit.hash,
    encrypted_read_token: read.encrypted,
    encrypted_proposal_token: proposal.encrypted,
    encrypted_direct_edit_token: directEdit.encrypted,
    updated_at: now,
  };

  const { data, error } = await db
    .from("creed_tokens")
    .upsert(nextTokenRow, { onConflict: "user_id" })
    .select("*")
    .single();

  assertNoError(error, "Could not rotate Creed tokens.");
  return resolveTokenRow(data as TokenRow);
}

export async function rotateUserMcpCredential(client: unknown, userId: string) {
  const db = client as SupabaseLikeClient;
  const now = new Date().toISOString();
  const mcp = tokenFields(generateToken("xt_mcp"));
  const nextRow: McpCredentialRow = {
    user_id: userId,
    // Mirror encrypted blob into legacy plaintext column for backwards-
    // compat with schemas that haven't dropped NOT NULL / kept UNIQUE.
    // resolveSecret reads only encrypted_*; the legacy column holds
    // ciphertext and is never decoded.
    mcp_token: mcp.encrypted,
    mcp_token_hash: mcp.hash,
    encrypted_mcp_token: mcp.encrypted,
    last_seen_at: null,
    last_client_name: null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await db
    .from("creed_mcp_credentials")
    .upsert(nextRow, { onConflict: "user_id" })
    .select("*")
    .single();

  assertNoError(error, "Could not rotate MCP credential.");
  const { error: clientError } = await db.from("creed_mcp_clients").delete().eq("user_id", userId);
  assertNoError(clientError, "Could not clear MCP client history.");
  return resolveMcpCredentialRow(data as McpCredentialRow);
}

export async function recordConnectionUsage(
  client: unknown,
  userId: string,
  integrationId?: string | null,
  agentName?: string | null,
  observedVia: "read" | "proposal" = "read"
) {
  const db = client as SupabaseLikeClient;
  const connectionId = normalizeIntegrationId(integrationId ?? inferIntegrationId(agentName));
  const now = new Date().toISOString();

  const { error } = await db.from("creed_connections").upsert(
    {
      user_id: userId,
      connection_id: connectionId,
      status: "connected",
      last_seen_at: now,
      last_agent_name: agentName ?? null,
      observed_via: observedVia,
      created_at: now,
      updated_at: now,
    },
    { onConflict: "user_id,connection_id" }
  );

  assertNoError(error, "Could not record Creed connection usage.");
}

async function findUserIdByTokenHash(
  db: SupabaseLikeClient,
  table: string,
  hashColumn: string,
  token: string,
  errorMessage: string
): Promise<string | null> {
  const tokenHash = hashSecret(token);
  const { data, error } = await db
    .from(table)
    .select("user_id")
    .eq(hashColumn, tokenHash)
    .maybeSingle();

  assertNoError(error, errorMessage);
  return (data as { user_id: string } | null)?.user_id ?? null;
}

export async function findUserIdByReadToken(client: unknown, token: string) {
  return findUserIdByTokenHash(
    client as SupabaseLikeClient,
    "creed_tokens",
    "read_token_hash",
    token,
    "Could not verify read token."
  );
}

export async function findUserIdByProposalToken(client: unknown, token: string) {
  return findUserIdByTokenHash(
    client as SupabaseLikeClient,
    "creed_tokens",
    "proposal_token_hash",
    token,
    "Could not verify proposal token."
  );
}

export async function findUserIdByDirectEditToken(client: unknown, token: string) {
  return findUserIdByTokenHash(
    client as SupabaseLikeClient,
    "creed_tokens",
    "direct_edit_token_hash",
    token,
    "Could not verify direct edit token."
  );
}

export async function findUserIdByMcpToken(client: unknown, token: string) {
  return findUserIdByTokenHash(
    client as SupabaseLikeClient,
    "creed_mcp_credentials",
    "mcp_token_hash",
    token,
    "Could not verify MCP credential."
  );
}

export async function recordMcpCredentialUsage(
  client: unknown,
  userId: string,
  clientName?: string | null
) {
  const db = client as SupabaseLikeClient;
  const now = new Date().toISOString();
  const normalizedClientName = clientName?.trim() || null;
  const hasSpecificClientName =
    normalizedClientName !== null && normalizedClientName.toLowerCase() !== "mcp client";

  const { error } = await db
    .from("creed_mcp_credentials")
    .update({
      last_seen_at: now,
      last_client_name: hasSpecificClientName ? normalizedClientName : null,
      updated_at: now,
    })
    .eq("user_id", userId);

  assertNoError(error, "Could not record MCP credential usage.");
  if (hasSpecificClientName) {
    const { error: clientError } = await db.from("creed_mcp_clients").upsert(
      {
        user_id: userId,
        client_id: normalizeMcpClientId(normalizedClientName),
        client_name: normalizedClientName,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      },
      { onConflict: "user_id,client_id" }
    );

    assertNoError(clientError, "Could not record MCP client usage.");
  }

  await recordConnectionUsage(
    db,
    userId,
    "mcp",
    hasSpecificClientName ? normalizedClientName : null,
    "read"
  );
}

export async function buildAgentPayloadForToken(
  client: unknown,
  token: string,
  integrationId?: string | null
) {
  const db = client as SupabaseLikeClient;
  const userId = await findUserIdByReadToken(db, token);
  if (!userId) {
    return null;
  }

  if (!db.auth?.admin?.getUserById) {
    throw new Error("Supabase admin getUserById is not available.");
  }

  const { data: userData, error: userError } = await db.auth.admin.getUserById(userId);

  if (userError || !userData?.user) {
    throw new Error(userError?.message || "Could not load token owner.");
  }

  const { state } = await loadCreedState(db, userData.user);
  await recordConnectionUsage(db, userId, integrationId, integrationId ?? "Custom Agent", "read");

  return {
    userId,
    state,
    payload: buildAgentReadPayload(state, {
      proposalUrl: buildProposalUrl(),
      directEditUrl: buildDirectEditUrl(),
      docsUrl: `${getSiteUrl()}/docs`,
    }),
  };
}
