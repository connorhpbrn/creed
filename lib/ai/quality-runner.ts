"use client";

// Module-level quality analysis runner.
//
// Why this exists:
// - The /file screen kicks off long-running AI quality analysis via fetch.
// - If the user navigates away mid-analysis, we don't want to throw away the
//   in-flight work — the server already persists the result, but the client
//   should keep showing the loading state and pick up the result on return.
// - Holding the in-flight promises at module scope (instead of inside the
//   component) means the work survives unmounts. Re-mounts re-attach to the
//   same promise via fingerprint dedup; they don't cancel or restart it.
//
// Contract:
// - `runFullQuality` and `runSectionQuality` are the only entry points.
// - A run with the same fingerprint that is already in flight returns the
//   same promise — it is never re-issued.
// - State changes (running flags, latest report) fan out via a tiny pub-sub
//   so any mounted screen can stay in sync via `useSyncExternalStore`.
// - This module never aborts a fetch; the server is the source of truth and
//   persists the report on completion regardless of the client's state.

import type { CreedQualityReport } from "@/components/creed/file-quality-ui";
import type { CreedSection } from "@/lib/creed-data";

type Listener = () => void;

type RunnerSnapshot = {
  report: CreedQualityReport | null;
  fullRunning: boolean;
  sectionRunning: ReadonlySet<string>;
  error: string | null;
};

type FullRunResult = {
  report: CreedQualityReport | null;
  sectionHashes?: Record<string, string>;
  storedContentHash?: string | null;
  storedSectionHashes?: Record<string, string>;
  current?: boolean;
};

const listeners = new Set<Listener>();

// Mutable internals — never expose directly. We hand out frozen snapshots so
// `useSyncExternalStore` can compare references safely.
let report: CreedQualityReport | null = null;
let error: string | null = null;
const sectionRunning = new Set<string>();

const inFlightFull = new Map<string, Promise<FullRunResult>>();
const inFlightSection = new Map<string, Promise<CreedQualityReport["sections"][number] | null>>();

let snapshot: RunnerSnapshot = freezeSnapshot();

function freezeSnapshot(): RunnerSnapshot {
  return Object.freeze({
    report,
    fullRunning: inFlightFull.size > 0,
    sectionRunning: new Set(sectionRunning),
    error,
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

// SSR-safe server snapshot — quality state is purely client-side, but
// useSyncExternalStore demands a stable server snapshot reference.
const SERVER_SNAPSHOT: RunnerSnapshot = Object.freeze({
  report: null,
  fullRunning: false,
  sectionRunning: new Set<string>(),
  error: null,
});

export function getQualityRunnerServerSnapshot(): RunnerSnapshot {
  return SERVER_SNAPSHOT;
}

export function setBaselineReport(next: CreedQualityReport | null) {
  if (report === next) return;
  report = next;
  error = null;
  emit();
}

export function clearQualityRunnerError() {
  if (error === null) return;
  error = null;
  emit();
}

export function getInFlightFull(fingerprint: string) {
  return inFlightFull.get(fingerprint) ?? null;
}

export function getInFlightSection(sectionFingerprint: string) {
  return inFlightSection.get(sectionFingerprint) ?? null;
}

type FullRunArgs = {
  sections: CreedSection[];
  fingerprint: string;
  force?: boolean;
  readOnly?: boolean;
};

export function runFullQuality(args: FullRunArgs): Promise<FullRunResult> {
  const existing = inFlightFull.get(args.fingerprint);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const response = await fetch("/api/app/ai/quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: args.sections,
          force: args.force,
          readOnly: args.readOnly,
          scope: "full",
        }),
      });
      const payload = (await response.json()) as FullRunResult & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Could not analyze Creed quality.");
      }

      if (payload.report) {
        report = payload.report;
        error = null;
      }
      return payload;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Could not analyze Creed quality.";
      throw cause;
    } finally {
      inFlightFull.delete(args.fingerprint);
      emit();
    }
  })();

  inFlightFull.set(args.fingerprint, promise);
  emit();
  return promise;
}

type SectionRunArgs = {
  section: CreedSection;
  fingerprint: string;
};

export function runSectionQuality(
  args: SectionRunArgs
): Promise<CreedQualityReport["sections"][number] | null> {
  const key = `${args.section.id}::${args.fingerprint}`;
  const existing = inFlightSection.get(key);
  if (existing) return existing;

  sectionRunning.add(args.section.id);
  emit();

  const promise = (async () => {
    try {
      const response = await fetch("/api/app/ai/quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: [args.section],
          force: true,
          scope: "section",
        }),
      });
      const payload = (await response.json()) as {
        report?: CreedQualityReport;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Could not analyze this section.");
      }

      const sectionReport = payload.report?.sections[0] ?? null;
      if (sectionReport && report) {
        // Splice the refreshed section into the cached overall report so any
        // mounted screen sees the update without an extra round trip.
        report = {
          ...report,
          sections: report.sections.map((entry) =>
            entry.sectionId === sectionReport.sectionId ? sectionReport : entry
          ),
        };
      }
      return sectionReport;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Could not analyze this section.";
      throw cause;
    } finally {
      sectionRunning.delete(args.section.id);
      inFlightSection.delete(key);
      emit();
    }
  })();

  inFlightSection.set(key, promise);
  return promise;
}
