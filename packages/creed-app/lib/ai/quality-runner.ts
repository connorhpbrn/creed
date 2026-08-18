"use client";

// Module-level quality analysis runner.
//
// Why this exists:
// - The /file screen kicks off long-running AI quality analysis via fetch.
// - If the user navigates away mid-analysis, we don't want to throw away the
//   in-flight work - the server already persists the result, but the client
//   should keep showing the loading state and pick up the result on return.
// - Holding the in-flight promises at module scope (instead of inside the
//   component) means the work survives unmounts. Re-mounts re-attach to the
//   same promise via fingerprint dedup; they don't cancel or restart it.
//
// Contract:
// - `runFullQuality` and `runSectionQuality` are the only entry points.
// - A run with the same fingerprint that is already in flight returns the
//   same promise - it is never re-issued.
// - State changes (running flags, latest report) fan out via a tiny pub-sub
//   so any mounted screen can stay in sync via `useSyncExternalStore`.
// - This module never aborts a fetch; the server is the source of truth and
//   persists the report on completion regardless of the client's state.

import type { CreedQualityReport } from "@/lib/ai/quality-types";
import type { CreedSection } from "@creed/core/creed-data";
import { GRANT_MONTHLY_USD, LOW_ALLOWANCE_RATIO } from "@creed/edition/credit-config";

// A completed analysis nudges the user to top up once the combined balance
// falls below ~20% of a monthly allowance (about $1). The richer per-bucket
// warning lives on the settings card, which knows the exact allowance.
const LOW_BALANCE_THRESHOLD_USD = GRANT_MONTHLY_USD * LOW_ALLOWANCE_RATIO;

type Listener = () => void;

// One completion of a user-initiated full analysis. `id` bumps each time so a
// shell-level subscriber can fire exactly one toast per completion.
export type QualityOutcome = {
  id: number;
  ok: boolean;
  message: string | null;
  lowCredits: boolean;
};

type RunnerSnapshot = {
  report: CreedQualityReport | null;
  fullRunning: boolean;
  sectionRunning: ReadonlySet<string>;
  error: string | null;
  lastOutcome: QualityOutcome | null;
};

type FullRunResult = {
  report: CreedQualityReport | null;
  sectionHashes?: Record<string, string>;
  storedContentHash?: string | null;
  storedSectionHashes?: Record<string, string>;
  current?: boolean;
  creditBalanceUsd?: number | null;
  run?: QualityRun;
};

type QualityRun = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  error: string | null;
  creditBalanceUsd: number | null;
};

const listeners = new Set<Listener>();
const QUALITY_RUN_CHANNEL = "creed:quality-runs";

// Mutable internals - never expose directly. We hand out frozen snapshots so
// `useSyncExternalStore` can compare references safely.
let report: CreedQualityReport | null = null;
let error: string | null = null;
let activeScopeKey = "";
const reportsByScope = new Map<string, CreedQualityReport>();
const sectionRunning = new Map<string, string>();

let lastOutcome: QualityOutcome | null = null;
let outcomeCounter = 0;

function recordOutcome(next: Omit<QualityOutcome, "id">) {
  lastOutcome = { id: ++outcomeCounter, ...next };
}

const inFlightFull = new Map<string, Promise<FullRunResult>>();
const inFlightSection = new Map<string, Promise<CreedQualityReport["sections"][number] | null>>();

let snapshot: RunnerSnapshot = freezeSnapshot();

function freezeSnapshot(): RunnerSnapshot {
  const activePrefix = `${activeScopeKey}::`;
  return Object.freeze({
    report,
    fullRunning: [...inFlightFull.keys()].some((key) => key.startsWith(activePrefix)),
    sectionRunning: new Set(
      [...sectionRunning.entries()]
        .filter(([key]) => key.startsWith(activePrefix))
        .map(([, sectionId]) => sectionId),
    ),
    error,
    lastOutcome,
  });
}

function emit() {
  snapshot = freezeSnapshot();
  for (const listener of listeners) listener();
}

export function subscribeQualityRunner(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getQualityRunnerSnapshot(): RunnerSnapshot {
  return snapshot;
}

// SSR-safe server snapshot - quality state is purely client-side, but
// useSyncExternalStore demands a stable server snapshot reference.
const SERVER_SNAPSHOT: RunnerSnapshot = Object.freeze({
  report: null,
  fullRunning: false,
  sectionRunning: new Set<string>(),
  error: null,
  lastOutcome: null,
});

export function getQualityRunnerServerSnapshot(): RunnerSnapshot {
  return SERVER_SNAPSHOT;
}

function announceQualityRun(scopeKey: string) {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(QUALITY_RUN_CHANNEL);
  channel.postMessage({ scopeKey });
  channel.close();
}

export function subscribeQualityRunAnnouncements(scopeKey: string, listener: Listener) {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(QUALITY_RUN_CHANNEL);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (
      event.data &&
      typeof event.data === "object" &&
      (event.data as { scopeKey?: unknown }).scopeKey === scopeKey
    ) {
      listener();
    }
  };
  return () => channel.close();
}

export function setBaselineReport(next: CreedQualityReport | null) {
  if (report === next) return;
  report = next;
  if (next) reportsByScope.set(activeScopeKey, next);
  else reportsByScope.delete(activeScopeKey);
  error = null;
  emit();
}

export function setQualityRunnerScope(scopeKey: string) {
  if (activeScopeKey === scopeKey) return;
  activeScopeKey = scopeKey;
  report = reportsByScope.get(scopeKey) ?? null;
  error = null;
  emit();
}

export function getInFlightFull(scopeKey: string, fingerprint: string) {
  return inFlightFull.get(`${scopeKey}::${fingerprint}`) ?? null;
}

type FullRunArgs = {
  scopeKey: string;
  sections: CreedSection[];
  fingerprint: string;
  force?: boolean;
  readOnly?: boolean;
};

async function waitForQualityRun(run: QualityRun): Promise<QualityRun> {
  let current = run;
  const deadline = Date.now() + 295_000;
  while (current.status === "queued" || current.status === "running") {
    if (Date.now() >= deadline) {
      throw new Error("Analysis is still running. Its result will appear when it finishes.");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1_000));
    const response = await fetch(`/api/app/ai/quality?runId=${encodeURIComponent(current.id)}`, {
      method: "GET",
      cache: "no-store",
    });
    const payload = (await response.json()) as { run?: QualityRun; error?: string };
    if (!response.ok || !payload.run) {
      throw new Error(payload.error || "Could not load analysis status.");
    }
    current = payload.run;
  }
  if (current.status === "failed") {
    throw new Error(current.error || "Analysis failed. Try again.");
  }
  return current;
}

async function requestQuality(args: FullRunArgs): Promise<FullRunResult> {
  const response = await fetch("/api/app/ai/quality", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sections: args.sections,
      force: args.force,
      readOnly: args.readOnly,
    }),
  });
  const payload = (await response.json()) as FullRunResult & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Could not analyze Creed quality.");
  }
  return payload;
}

export function runFullQuality(args: FullRunArgs): Promise<FullRunResult> {
  const key = `${args.scopeKey}::${args.fingerprint}`;
  const existing = inFlightFull.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      let payload = await requestQuality(args);
      if (payload.run?.status === "queued" || payload.run?.status === "running") {
        if (!args.readOnly) announceQualityRun(args.scopeKey);
        const completed = await waitForQualityRun(payload.run);
        payload = await requestQuality({ ...args, force: false, readOnly: true });
        payload.creditBalanceUsd = completed.creditBalanceUsd;
        if (!args.readOnly) announceQualityRun(args.scopeKey);
      }

      if (payload.report) {
        reportsByScope.set(args.scopeKey, payload.report);
        if (activeScopeKey === args.scopeKey) {
          report = payload.report;
          error = null;
        }
      }
      // Only user-initiated analyses (not the silent baseline read) toast.
      if (!args.readOnly && activeScopeKey === args.scopeKey) {
        const balance = payload.creditBalanceUsd;
        recordOutcome({
          ok: true,
          message: null,
          lowCredits: typeof balance === "number" && balance < LOW_BALANCE_THRESHOLD_USD,
        });
      }
      return payload;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not analyze Creed quality.";
      if (activeScopeKey === args.scopeKey) error = message;
      if (!args.readOnly && activeScopeKey === args.scopeKey) {
        recordOutcome({ ok: false, message, lowCredits: false });
      }
      throw cause;
    } finally {
      inFlightFull.delete(key);
      emit();
    }
  })();

  inFlightFull.set(key, promise);
  emit();
  return promise;
}

type SectionRunArgs = {
  scopeKey: string;
  // The whole file goes up so the model can judge this section in context
  // (contradictions, overall fit); only `section` is re-scored server-side.
  sections: CreedSection[];
  section: CreedSection;
  fingerprint: string;
};

export function runSectionQuality(
  args: SectionRunArgs
): Promise<CreedQualityReport["sections"][number] | null> {
  const key = `${args.scopeKey}::${args.section.id}::${args.fingerprint}`;
  const existing = inFlightSection.get(key);
  if (existing) return existing;

  sectionRunning.set(key, args.section.id);
  emit();

  const promise = (async () => {
    try {
      const response = await fetch("/api/app/ai/quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: args.sections,
          force: true,
          targetSectionIds: [args.section.id],
        }),
      });
      const payload = (await response.json()) as {
        report?: CreedQualityReport;
        run?: QualityRun;
        creditBalanceUsd?: number | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Could not analyze this section.");
      }

      if (!payload.run) {
        throw new Error("Could not start section analysis.");
      }
      announceQualityRun(args.scopeKey);
      const completed = await waitForQualityRun(payload.run);
      const baseline = await requestQuality({
        scopeKey: args.scopeKey,
        sections: args.sections,
        fingerprint: `baseline:${args.fingerprint}`,
        readOnly: true,
      });
      payload.report = baseline.report ?? undefined;
      payload.creditBalanceUsd = completed.creditBalanceUsd;
      announceQualityRun(args.scopeKey);

      // The server returns the full merged report (this section re-scored,
      // the rest carried forward, overall recomputed). Adopt it whole so the
      // headline stays in sync with the section that just changed.
      if (payload.report) {
        reportsByScope.set(args.scopeKey, payload.report);
        if (activeScopeKey === args.scopeKey) {
          report = payload.report;
          error = null;
        }
      }
      // Report the outcome so the shell toasts on success / low credits, the
      // same as a full analysis.
      if (activeScopeKey === args.scopeKey) {
        recordOutcome({
          ok: true,
          message: null,
          lowCredits:
            typeof payload.creditBalanceUsd === "number" &&
            payload.creditBalanceUsd < LOW_BALANCE_THRESHOLD_USD,
        });
      }
      return payload.report?.sections.find((entry) => entry.sectionId === args.section.id) ?? null;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not analyze this section.";
      if (activeScopeKey === args.scopeKey) {
        error = message;
        recordOutcome({ ok: false, message, lowCredits: false });
      }
      throw cause;
    } finally {
      sectionRunning.delete(key);
      inFlightSection.delete(key);
      emit();
    }
  })();

  inFlightSection.set(key, promise);
  return promise;
}
