"use client";

// Module-level Agent run store. The run lives here, not in the panel component,
// so closing the panel never kills it - the fetch keeps streaming, progress
// keeps updating, and reopening the panel re-attaches to the live snapshot.
// Only an explicit Stop aborts it.
//
// Orchestration (the streamed fetch + progress) lives here; the client-side
// application of the result (accepting direct-permission proposals, applying
// archive/restore/permission ops, refreshing state) is handed in as an `apply`
// callback so this pure module never needs the React provider.

import {
  AGENT_STAGE_LABEL,
  type AgentResult,
  type AgentStage,
  type AgentStreamEvent,
} from "@/lib/panel/agent";

export type AgentRunStatus = "idle" | "working" | "applying" | "result" | "error";

export type AgentRunSnapshot = {
  status: AgentRunStatus;
  query: string;
  stage: AgentStage | null;
  tokens: number;
  result: AgentResult | null;
  error: string | null;
};

export { AGENT_STAGE_LABEL };

type Listener = () => void;
type ApplyFn = (result: AgentResult) => Promise<void>;

const listeners = new Set<Listener>();
let controller: AbortController | null = null;

let status: AgentRunStatus = "idle";
let query = "";
let stage: AgentStage | null = null;
let tokens = 0;
let result: AgentResult | null = null;
let error: string | null = null;

let snapshot: AgentRunSnapshot = build();

function build(): AgentRunSnapshot {
  return Object.freeze({ status, query, stage, tokens, result, error });
}

function emit() {
  snapshot = build();
  for (const listener of listeners) listener();
}

export function subscribeAgentRunner(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAgentRunnerSnapshot(): AgentRunSnapshot {
  return snapshot;
}

const SERVER_SNAPSHOT: AgentRunSnapshot = Object.freeze({
  status: "idle",
  query: "",
  stage: null,
  tokens: 0,
  result: null,
  error: null,
});
export function getAgentRunnerServerSnapshot(): AgentRunSnapshot {
  return SERVER_SNAPSHOT;
}

// Reset to idle once the user has reviewed / dismissed a finished run. A no-op
// while a run is in flight so it can't wipe live progress.
export function clearAgentRun() {
  if (status === "working" || status === "applying") return;
  status = "idle";
  query = "";
  stage = null;
  tokens = 0;
  result = null;
  error = null;
  emit();
}

export function stopAgentRun() {
  controller?.abort();
  controller = null;
  if (status === "working" || status === "applying") {
    status = "idle";
    stage = null;
    tokens = 0;
    error = null;
    emit();
  }
}

export function startAgentRun({
  query: nextQuery,
  mentioned,
  apply,
}: {
  query: string;
  mentioned: string[];
  apply: ApplyFn;
}) {
  if (status === "working" || status === "applying") return; // one run at a time
  const localController = new AbortController();
  controller = localController;
  status = "working";
  query = nextQuery;
  stage = "reading";
  tokens = 0;
  result = null;
  error = null;
  emit();

  // True once this run has been superseded (stopped, or a newer run started).
  // Guards every post-stream state write so a cancelled run can't flip the UI
  // back to a result, and guards the finally from nulling a newer controller.
  const superseded = () => controller !== localController;

  void (async () => {
    try {
      const response = await fetch("/api/app/ai/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: nextQuery, mentioned }),
        signal: localController.signal,
      });

      if (!response.ok || !response.body) {
        let message = "That didn't go through. Try again";
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload.error) message = payload.error;
        } catch {
          // non-JSON error body
        }
        status = "error";
        error = message;
        emit();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: AgentResult | null = null;

      const handle = (event: AgentStreamEvent) => {
        if (event.type === "stage") {
          stage = event.stage;
          emit();
        } else if (event.type === "tokens") {
          tokens = event.count;
          emit();
        } else if (event.type === "error") {
          error = event.message;
        } else if (event.type === "result") {
          finalResult = event.result;
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl = buffer.indexOf("\n");
        while (nl !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          nl = buffer.indexOf("\n");
          if (!line) continue;
          try {
            handle(JSON.parse(line) as AgentStreamEvent);
          } catch {
            // ignore a malformed frame
          }
        }
      }

      // The user stopped (or a newer run started) between stream end and here:
      // don't resurrect a result the user cancelled.
      if (superseded()) return;

      // finalResult is mutated inside `handle` (a closure), which TS can't see,
      // so it narrows the outer variable to null. Cast back to its real type.
      const resolved = finalResult as AgentResult | null;
      if (error) {
        status = "error";
        emit();
        return;
      }
      if (!resolved) {
        status = "error";
        error = "That didn't go through. Try again";
        emit();
        return;
      }
      if (!resolved.ok) {
        status = "error";
        error = resolved.reason || "I couldn't do that from here.";
        emit();
        return;
      }

      // Everything was applied + persisted server-side; the client just pulls
      // the fresh state. Runs even if the panel is closed.
      status = "applying";
      result = resolved;
      emit();
      try {
        await apply(resolved);
      } catch {
        // Application is best-effort; the changes are already persisted.
      }
      if (superseded()) return;
      status = "result";
      emit();
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return; // stopped
      status = "error";
      error = cause instanceof Error ? cause.message : "Couldn't reach the server. Try again";
      emit();
    } finally {
      // Only clear the module controller if it's still ours - a newer run may
      // have replaced it while this one was finishing.
      if (controller === localController) controller = null;
    }
  })();
}
