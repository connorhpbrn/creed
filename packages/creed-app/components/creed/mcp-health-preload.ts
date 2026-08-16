"use client";

// Client-side cache + preloader for the MCP health dashboard. Mirrors the
// settings-preload pattern: the shell warms this on mount so /connections
// renders the dashboard from cache instantly, then revalidates in the
// background. Also the single source of truth for the dashboard's data types.
import type { AgentIconKind } from "@creed/core/creed-data";

export type McpHealthRange = "7d" | "30d" | "90d";

export type McpHealthAgent = {
  clientId: string;
  name: string;
  icon: AgentIconKind;
  firstSeen?: string;
  lastSeen?: string;
  reads: number;
  directs: number;
  proposals: number;
  accepted: number;
  rejected: number;
  pending: number;
};

export type McpHealthDay = {
  date: string;
  reads: number;
  directs: number;
  proposals: number;
  accepted: number;
  rejected: number;
  pending: number;
  readsByAgent: Record<string, number>;
  directsByAgent: Record<string, number>;
  proposalsByAgent: Record<string, number>;
  acceptedByAgent: Record<string, number>;
  rejectedByAgent: Record<string, number>;
  pendingByAgent: Record<string, number>;
};

export type McpHealthSection = {
  sectionId: string;
  sectionName: string;
  accent: string;
  count: number;
  byAgent: Record<string, number>;
};

export type McpHealthSummary = {
  range: McpHealthRange;
  totals: {
    agents: number;
    newAgents: number;
    reads: number;
    directs: number;
    proposals: number;
    accepted: number;
    rejected: number;
    pending: number;
    acceptRate: number | null;
  };
  days: McpHealthDay[];
  agents: McpHealthAgent[];
  sections: McpHealthSection[];
};

type CacheEntry = {
  value: McpHealthSummary | null;
  promise: Promise<McpHealthSummary | null> | null;
};

// Keyed by Creed so switching between a personal and a shared Creed never
// serves the previous Creed's cached dashboard. The server scopes the response
// to the active Creed via its cookie; the key here just keeps the client cache
// buckets separate. Empty creedKey = the active/personal Creed.
const cache = new Map<string, CacheEntry>();

function cacheKey(creedKey: string, range: McpHealthRange): string {
  return `${creedKey}::${range}`;
}

/** Synchronous read of an already-loaded range, for instant first render. */
export function getCachedMcpHealth(range: McpHealthRange, creedKey = ""): McpHealthSummary | null {
  return cache.get(cacheKey(creedKey, range))?.value ?? null;
}

/** Fetch and cache a health range. Pass force only for an explicit revalidation. */
export function loadMcpHealth(
  range: McpHealthRange,
  creedKey = "",
  force = false,
): Promise<McpHealthSummary | null> {
  const key = cacheKey(creedKey, range);
  const entry = cache.get(key) ?? { value: null, promise: null };
  cache.set(key, entry);

  if (!force && entry.value) {
    return Promise.resolve(entry.value);
  }

  if (!entry.promise) {
    entry.promise = fetch(`/api/app/mcp/health?range=${range}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Could not load MCP health."))))
      .then((data: { health: McpHealthSummary }) => {
        entry.value = data.health;
        return entry.value;
      })
      .finally(() => {
        entry.promise = null;
      });
  }

  return entry.promise;
}

/** Warm the default range in the background (called from the app shell). */
export function preloadMcpHealth(range: McpHealthRange = "30d", creedKey = "") {
  void loadMcpHealth(range, creedKey).catch(() => null);
}
