const DATABASE_NAME = "creed-editor-drafts";
const STORE_NAME = "drafts";
const DATABASE_VERSION = 1;

export type EditorDraft = {
  key: string;
  creedId: string;
  sectionId: string;
  content: string;
  baseRevision: number;
  updatedAt: number;
};

export function editorDraftKey(creedId: string, sectionId: string) {
  return `${creedId}:${sectionId}`;
}

function openDraftDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const database = await openDraftDatabase();
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    let result: T;
    let settled = false;
    const rejectOnce = (error: DOMException | null) => {
      if (settled) return;
      settled = true;
      database.close();
      reject(error ?? new DOMException("IndexedDB transaction failed."));
    };
    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => rejectOnce(request.error);
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      database.close();
      resolve(result);
    };
    transaction.onerror = () => rejectOnce(transaction.error);
    transaction.onabort = () => rejectOnce(transaction.error);
  });
}

export async function readEditorDraft(key: string) {
  return withStore<EditorDraft | undefined>("readonly", (store) =>
    store.get(key),
  );
}

export async function writeEditorDraft(draft: EditorDraft) {
  await withStore<IDBValidKey>("readwrite", (store) => store.put(draft));
}

export async function deleteEditorDraft(key: string) {
  await withStore<undefined>("readwrite", (store) => store.delete(key));
}

export async function clearEditorDrafts() {
  await withStore<undefined>("readwrite", (store) => store.clear());
}
