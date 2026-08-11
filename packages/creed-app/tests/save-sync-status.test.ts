import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { writeEditorDraft } from "@creed/core/editor-drafts";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function installIndexedDbWrite(options: { abort: boolean }) {
  const original = globalThis.indexedDB;
  const transactionError = new DOMException("Transaction aborted", "AbortError");

  const database = {
    close() {},
    transaction() {
      const transaction: Record<string, unknown> = {
        error: options.abort ? transactionError : null,
        objectStore() {
          return {
            put() {
              const request: Record<string, unknown> = {
                result: "draft-key",
                error: null,
              };
              queueMicrotask(() => {
                (request.onsuccess as (() => void) | undefined)?.();
                queueMicrotask(() => {
                  if (options.abort) {
                    (transaction.onabort as (() => void) | undefined)?.();
                  } else {
                    (transaction.oncomplete as (() => void) | undefined)?.();
                  }
                });
              });
              return request;
            },
          };
        },
      };
      return transaction;
    },
  };

  const fakeIndexedDb = {
    open() {
      const request: Record<string, unknown> = {
        result: database,
        error: null,
      };
      queueMicrotask(() => {
        (request.onsuccess as (() => void) | undefined)?.();
      });
      return request;
    },
  };

  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: fakeIndexedDb,
  });

  return () => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: original,
    });
  };
}

test("local draft acknowledgement waits for transaction commit", async () => {
  const restore = installIndexedDbWrite({ abort: false });
  try {
    await writeEditorDraft({
      key: "creed:section",
      creedId: "creed",
      sectionId: "section",
      content: "<p>Saved</p>",
      baseRevision: 1,
      updatedAt: Date.now(),
    });
  } finally {
    restore();
  }
});

test("local draft acknowledgement rejects an aborted transaction", async () => {
  const restore = installIndexedDbWrite({ abort: true });
  try {
    await assert.rejects(
      writeEditorDraft({
        key: "creed:section",
        creedId: "creed",
        sectionId: "section",
        content: "<p>Not durable</p>",
        baseRevision: 1,
        updatedAt: Date.now(),
      }),
      /Transaction aborted/,
    );
  } finally {
    restore();
  }
});

test("sync status keeps structural failures distinct from local drafts", () => {
  const provider = source("../components/creed/creed-provider.tsx");
  const file = source("../components/creed/file-screen.tsx");

  assert.match(provider, /\| "unsaved";/);
  assert.match(provider, /catch \(error\) \{[\s\S]*?setSyncStatus\("unsaved"\)/);
  assert.match(file, /status === "unsaved"[\s\S]*?"cloud-failed"/);
  assert.match(file, /label: save\.failureLabel/);
  assert.match(file, /`\$\{save\.persistedLabel\}\$\{relativeSaveLabel\(cloudSyncedAt\)\}`/);
  assert.match(source("../../../apps/open/edition/config.ts"), /persistedLabel: "Saved to database"/);
  assert.match(source("../../../apps/cloud/edition/config.ts"), /persistedLabel: "Synced to cloud"/);
  assert.match(file, /label: `Saved locally\$\{relativeSaveLabel\(localSavedAt\)\}`/);
});

test("local saves and retries remain scoped and recoverable", () => {
  const provider = source("../components/creed/creed-provider.tsx");
  const editor = source("../components/creed/rich-text-editor.tsx");
  const file = source("../components/creed/file-screen.tsx");

  assert.match(
    provider,
    /function finishLocalSave\(creedId: string,[\s\S]*?creedId !== latestStateRef\.current\.creedId/,
  );
  assert.match(provider, /SAVE_RETRY_DELAY_MS = 15_000/);
  assert.match(provider, /stateRetryTimerRef\.current = window\.setTimeout/);
  assert.match(provider, /setLocalSaveFailed\(true\)/);
  assert.match(file, /degraded && localSaveFailed/);
  assert.match(editor, /onLocalSaveStartRef\.current\?\.\(draftCreedId\)/);
  assert.match(
    editor,
    /onLocalSaveCompleteRef\.current\?\.\(draftCreedId, Date\.now\(\)\)/,
  );
});

test("cloud acknowledgements cannot cross a Creed switch", () => {
  const provider = source("../components/creed/creed-provider.tsx");

  assert.match(provider, /activeCreedGenerationRef = useRef\(0\)/);
  assert.match(provider, /activeCreedGenerationRef\.current \+= 1/);
  assert.match(
    provider,
    /const isCurrentCreed = \(\) =>[\s\S]*?saveGeneration === activeCreedGenerationRef\.current/,
  );
  assert.match(provider, /await persistState\(snapshot, keepalive\);[\s\S]*?if \(!isCurrentCreed\(\)\) return/);
  assert.match(provider, /finally \{[\s\S]*?if \(isCurrentCreed\(\)\)/);
});

test("only the header subscribes to ephemeral sync state", () => {
  const provider = source("../components/creed/creed-provider.tsx");
  const file = source("../components/creed/file-screen.tsx");
  const useCreedBody = provider.match(
    /export function useCreed\(\) \{([\s\S]*?)\n\}/,
  )?.[1];

  assert.ok(useCreedBody);
  assert.doesNotMatch(useCreedBody, /useCreedSyncStatus/);
  assert.match(file, /function SaveStatus\(\) \{[\s\S]*?useCreedSyncStatus\(\)/);
  assert.match(file, /useCreedStateSelector\([\s\S]*?lastSavedAt/);
});
