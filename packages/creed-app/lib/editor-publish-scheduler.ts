export type EditorPublishScheduler = {
  schedule: () => void;
  flush: () => void;
  cancel: () => void;
};

type TimerHandle = ReturnType<typeof setTimeout>;

export function createEditorPublishScheduler(
  publish: () => void,
  options: {
    delayMs?: number;
    maxWaitMs?: number;
    setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
    clearTimer?: (handle: TimerHandle) => void;
  } = {},
): EditorPublishScheduler {
  const delayMs = options.delayMs ?? 250;
  const maxWaitMs = options.maxWaitMs ?? 1_000;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  let trailingTimer: TimerHandle | null = null;
  let maxTimer: TimerHandle | null = null;
  let pending = false;

  function clearTimers() {
    if (trailingTimer !== null) clearTimer(trailingTimer);
    if (maxTimer !== null) clearTimer(maxTimer);
    trailingTimer = null;
    maxTimer = null;
  }

  function flush() {
    if (!pending) return;
    pending = false;
    clearTimers();
    publish();
  }

  return {
    schedule() {
      pending = true;
      if (trailingTimer !== null) clearTimer(trailingTimer);
      trailingTimer = setTimer(flush, delayMs);
      maxTimer ??= setTimer(flush, maxWaitMs);
    },
    flush,
    cancel() {
      pending = false;
      clearTimers();
    },
  };
}
