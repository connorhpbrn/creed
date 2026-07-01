"use client";

export type RepoOption = {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
};

export type BranchOption = {
  name: string;
};

export type VersionControlStatus = {
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
};

export type AiMode = "credits" | "byok";

export type PublicAiSettings = {
  provider: "openrouter";
  keyStatus: "missing" | "valid" | "invalid";
  aiMode: AiMode;
  keyLastFour?: string;
  lastValidatedAt?: string;
};

export type AiUsageRange = "7d" | "30d" | "90d";

// Spend is tagged by feature (Analysis today; Tab/CMD-K later), not by model,
// and each cost is the amount actually charged.
export type AiUsageSummary = {
  range: AiUsageRange;
  totalCostUsd: number;
  byFeature: Array<{ feature: string; costUsd: number }>;
  days: Array<{
    date: string;
    segments: Array<{ feature: string; costUsd: number }>;
  }>;
};

export type CreditTransaction = {
  id: string;
  type: "topup" | "debit" | "grant";
  amountUsd: number;
  balanceAfterUsd: number;
  feature: string | null;
  modelId: string | null;
  bucket: string | null;
  createdAt: string;
};

export type CreditsState = {
  grantedMicroUsd: number;
  purchasedMicroUsd: number;
  balanceMicroUsd: number;
  grantedUsd: number;
  purchasedUsd: number;
  balanceUsd: number;
  allowanceUsd: number;
  allowanceResets: boolean;
  allTimeSpentUsd: number;
  transactions: CreditTransaction[];
};

export type OpenRouterBalance = {
  usageUsd: number;
  limitUsd: number | null;
  remainingUsd: number | null;
};

type CacheEntry<T> = {
  value: T | null;
  promise: Promise<T> | null;
};

const reposCache: CacheEntry<RepoOption[]> = { value: null, promise: null };
const branchesCache = new Map<string, CacheEntry<BranchOption[]>>();
const aiSettingsCache: CacheEntry<PublicAiSettings | null> = { value: null, promise: null };
const usageCache = new Map<string, CacheEntry<AiUsageSummary | null>>();
const creditsCache: CacheEntry<CreditsState | null> = { value: null, promise: null };
const openRouterBalanceCache: CacheEntry<OpenRouterBalance | null> = { value: null, promise: null };
const versionStatusCache = new Map<string, CacheEntry<VersionControlStatus | null>>();
let activeCacheScope = "";

function clearAllSettingsCaches() {
  reposCache.value = null;
  reposCache.promise = null;
  aiSettingsCache.value = null;
  aiSettingsCache.promise = null;
  branchesCache.clear();
  usageCache.clear();
  creditsCache.value = null;
  creditsCache.promise = null;
  openRouterBalanceCache.value = null;
  openRouterBalanceCache.promise = null;
  versionStatusCache.clear();
}

export function setSettingsCacheScope(scope: string) {
  const nextScope = scope.trim();
  if (activeCacheScope === nextScope) {
    return;
  }

  activeCacheScope = nextScope;
  clearAllSettingsCaches();
}

async function readJson<T>(url: string) {
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "Could not load settings data.");
  }

  return payload;
}

export function loadSettingsRepos() {
  if (reposCache.value) {
    return Promise.resolve(reposCache.value);
  }

  if (!reposCache.promise) {
    reposCache.promise = readJson<{ repos?: RepoOption[] }>("/api/app/github/repos")
      .then((payload) => {
        reposCache.value = payload.repos ?? [];
        return reposCache.value;
      })
      .finally(() => {
        reposCache.promise = null;
      });
  }

  return reposCache.promise;
}

export function clearSettingsRepoCache() {
  reposCache.value = null;
  reposCache.promise = null;
  branchesCache.clear();
  versionStatusCache.clear();
}

export function loadSettingsBranches(owner: string, repo: string) {
  const key = `${owner}/${repo}`;
  const cached = branchesCache.get(key) ?? { value: null, promise: null };
  branchesCache.set(key, cached);

  if (cached.value) {
    return Promise.resolve(cached.value);
  }

  if (!cached.promise) {
    cached.promise = readJson<{ branches?: BranchOption[] }>(
      `/api/app/github/branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
    )
      .then((payload) => {
        cached.value = payload.branches ?? [];
        return cached.value;
      })
      .finally(() => {
        cached.promise = null;
      });
  }

  return cached.promise;
}

export function loadSettingsAiSettings() {
  if (aiSettingsCache.value) {
    return Promise.resolve(aiSettingsCache.value);
  }

  if (!aiSettingsCache.promise) {
    aiSettingsCache.promise = readJson<{ settings?: PublicAiSettings }>("/api/app/ai/settings")
      .then((payload) => {
        aiSettingsCache.value = payload.settings ?? null;
        return aiSettingsCache.value;
      })
      .finally(() => {
        aiSettingsCache.promise = null;
      });
  }

  return aiSettingsCache.promise;
}

export function setCachedSettingsAiSettings(settings: PublicAiSettings) {
  aiSettingsCache.value = settings;
}

export function loadSettingsUsage(range: AiUsageRange, mode: AiMode) {
  const key = `${range}:${mode}`;
  const cached = usageCache.get(key) ?? { value: null, promise: null };
  usageCache.set(key, cached);

  if (!cached.promise) {
    cached.promise = readJson<{ usage?: AiUsageSummary }>(`/api/app/ai/usage?range=${range}&mode=${mode}`)
      .then((payload) => {
        cached.value = payload.usage ?? null;
        return cached.value;
      })
      .finally(() => {
        cached.promise = null;
      });
  }

  return cached.promise;
}

export function clearSettingsUsageCache() {
  usageCache.clear();
}

// Balance is volatile (top-ups, per-call debits), so this refetches on every
// call unless a request is already in flight - same shape as loadSettingsUsage.
export function loadSettingsCredits() {
  if (!creditsCache.promise) {
    creditsCache.promise = readJson<{ credits?: CreditsState }>("/api/app/credits")
      .then((payload) => {
        creditsCache.value = payload.credits ?? null;
        return creditsCache.value;
      })
      .finally(() => {
        creditsCache.promise = null;
      });
  }

  return creditsCache.promise;
}

export function clearSettingsCreditsCache() {
  creditsCache.value = null;
  creditsCache.promise = null;
}

// The BYOK user's live OpenRouter balance. Volatile like credits, so it always
// refetches; returns null when no valid key is saved or the read failed.
export function loadSettingsOpenRouterBalance() {
  if (!openRouterBalanceCache.promise) {
    openRouterBalanceCache.promise = readJson<{ balance?: OpenRouterBalance | null }>(
      "/api/app/ai/openrouter-balance"
    )
      .then((payload) => {
        openRouterBalanceCache.value = payload.balance ?? null;
        return openRouterBalanceCache.value;
      })
      .finally(() => {
        openRouterBalanceCache.promise = null;
      });
  }

  return openRouterBalanceCache.promise;
}

export function clearSettingsOpenRouterBalanceCache() {
  openRouterBalanceCache.value = null;
  openRouterBalanceCache.promise = null;
}

export function loadSettingsVersionStatus(localHash: string) {
  const cached = versionStatusCache.get(localHash) ?? { value: null, promise: null };
  versionStatusCache.set(localHash, cached);

  if (cached.value) {
    return Promise.resolve(cached.value);
  }

  if (!cached.promise) {
    cached.promise = readJson<VersionControlStatus>(`/api/app/github/status?localHash=${localHash}`)
      .then((payload) => {
        cached.value = payload;
        return cached.value;
      })
      .finally(() => {
        cached.promise = null;
      });
  }

  return cached.promise;
}

export async function hashSettingsMarkdown(markdown: string) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(markdown));
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function preloadSettingsData({
  scope,
  githubConnected,
  repoOwner,
  repoName,
  markdown,
}: {
  scope?: string;
  githubConnected: boolean;
  repoOwner?: string;
  repoName?: string;
  markdown?: string;
}) {
  if (scope) {
    setSettingsCacheScope(scope);
  }

  void loadSettingsAiSettings().catch(() => null);
  void loadSettingsUsage("90d", "credits").catch(() => null);
  void loadSettingsCredits().catch(() => null);
  // The OpenRouter balance is only shown for a valid BYOK key (the minority
  // path), so the settings screen fetches it lazily on demand rather than
  // eagerly here where it would be a wasted call for every credits-mode user.

  if (!githubConnected) {
    return;
  }

  void loadSettingsRepos().catch(() => null);

  if (repoOwner && repoName) {
    void loadSettingsBranches(repoOwner, repoName).catch(() => null);
  }

  if (markdown) {
    void hashSettingsMarkdown(markdown)
      .then((localHash) => loadSettingsVersionStatus(localHash))
      .catch(() => null);
  }
}
