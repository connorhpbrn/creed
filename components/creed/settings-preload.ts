"use client";

import type { AiModelQuality } from "@/lib/ai/model-catalog";
import type { AiModelCatalogItem } from "@/lib/ai/model-catalog";

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

export type PublicAiSettings = {
  provider: "openrouter";
  selectedModelId: string;
  keyStatus: "missing" | "valid" | "invalid";
  keyLastFour?: string;
  lastValidatedAt?: string;
};

export type AiUsageRange = "24h" | "7d" | "30d" | "1y";

export type AiUsageSummary = {
  range: AiUsageRange;
  totalCostUsd: number;
  byModel: Array<{
    modelId: string;
    modelName: string;
    quality: AiModelQuality;
    costUsd: number;
  }>;
  days: Array<{
    date: string;
    segments: Array<{
      modelId: string;
      modelName: string;
      quality: AiModelQuality;
      costUsd: number;
    }>;
  }>;
};

type CacheEntry<T> = {
  value: T | null;
  promise: Promise<T> | null;
};

const reposCache: CacheEntry<RepoOption[]> = { value: null, promise: null };
const branchesCache = new Map<string, CacheEntry<BranchOption[]>>();
const aiSettingsCache: CacheEntry<PublicAiSettings | null> = { value: null, promise: null };
const aiModelsCache: CacheEntry<AiModelCatalogItem[]> = { value: null, promise: null };
const usageCache = new Map<AiUsageRange, CacheEntry<AiUsageSummary | null>>();
const versionStatusCache = new Map<string, CacheEntry<VersionControlStatus | null>>();
let activeCacheScope = "";

function clearAllSettingsCaches() {
  reposCache.value = null;
  reposCache.promise = null;
  aiSettingsCache.value = null;
  aiSettingsCache.promise = null;
  aiModelsCache.value = null;
  aiModelsCache.promise = null;
  branchesCache.clear();
  usageCache.clear();
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
    aiSettingsCache.promise = readJson<{ settings?: PublicAiSettings; models?: AiModelCatalogItem[] }>("/api/app/ai/settings")
      .then((payload) => {
        aiSettingsCache.value = payload.settings ?? null;
        aiModelsCache.value = payload.models ?? aiModelsCache.value;
        return aiSettingsCache.value;
      })
      .finally(() => {
        aiSettingsCache.promise = null;
      });
  }

  return aiSettingsCache.promise;
}

export function loadSettingsAiModels() {
  if (aiModelsCache.value) {
    return Promise.resolve(aiModelsCache.value);
  }

  if (!aiModelsCache.promise) {
    aiModelsCache.promise = readJson<{ settings?: PublicAiSettings; models?: AiModelCatalogItem[] }>("/api/app/ai/settings")
      .then((payload) => {
        aiSettingsCache.value = payload.settings ?? aiSettingsCache.value;
        aiModelsCache.value = payload.models ?? [];
        return aiModelsCache.value;
      })
      .finally(() => {
        aiModelsCache.promise = null;
      });
  }

  return aiModelsCache.promise;
}

export function setCachedSettingsAiSettings(settings: PublicAiSettings) {
  aiSettingsCache.value = settings;
}

export function loadSettingsUsage(range: AiUsageRange) {
  const cached = usageCache.get(range) ?? { value: null, promise: null };
  usageCache.set(range, cached);

  if (!cached.promise) {
    cached.promise = readJson<{ usage?: AiUsageSummary }>(`/api/app/ai/usage?range=${range}`)
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
  void loadSettingsUsage("7d").catch(() => null);

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
