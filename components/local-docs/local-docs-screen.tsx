"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Folder,
  RefreshCw,
  Search,
} from "lucide-react";
import type { LocalDocsPayload, LocalDocSummary } from "@/lib/local-docs";

type LocalDocsScreenProps = {
  initialPayload: LocalDocsPayload;
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function groupByRepo(documents: LocalDocSummary[]) {
  const groups = new Map<string, LocalDocSummary[]>();
  for (const document of documents) {
    groups.set(document.repo, [...(groups.get(document.repo) ?? []), document]);
  }
  return [...groups.entries()];
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function LocalDocsScreen({ initialPayload }: LocalDocsScreenProps) {
  const router = useRouter();
  const [payload, setPayload] = useState(initialPayload);
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedId = payload.selectedDocument?.id ?? payload.documents[0]?.id ?? null;

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return payload.documents;
    return payload.documents.filter((document) =>
      [
        document.title,
        document.repo,
        document.relativePath,
        document.kindLabel,
        document.excerpt,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [payload.documents, query]);

  const groupedDocuments = useMemo(
    () => groupByRepo(filteredDocuments),
    [filteredDocuments],
  );

  const refresh = useCallback(async (docId = selectedId) => {
    const params = new URLSearchParams();
    if (docId) params.set("doc", docId);
    const response = await fetch(`/api/local-docs?${params.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const nextPayload = (await response.json()) as LocalDocsPayload;
    setPayload(nextPayload);
  }, [selectedId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refresh();
    }, 1500);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const selectDocument = (documentId: string) => {
    startTransition(() => {
      router.replace(`/local-docs?doc=${encodeURIComponent(documentId)}`, {
        scroll: false,
      });
      void refresh(documentId);
    });
  };

  return (
    <main className="flex h-screen min-h-0 bg-background text-foreground">
      <aside className="flex w-[380px] shrink-0 flex-col border-r border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-muted-foreground" />
                <h1 className="truncate text-base font-semibold">Local docs</h1>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {payload.documents.length} documents across {payload.sources.length} repos
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Refresh local docs"
            >
              <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="mt-4 flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search documents"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="creed-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {!payload.enabled && (
            <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
              Enable local docs with <code className="font-mono">CREED_LOCAL_DOCS_ENABLED=1</code>.
            </div>
          )}

          {payload.errors.length > 0 && (
            <div className="mb-3 space-y-2">
              {payload.errors.map((error) => (
                <div
                  key={error}
                  className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              ))}
            </div>
          )}

          {groupedDocuments.length === 0 && payload.enabled ? (
            <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
              No matching repo documents found.
            </div>
          ) : (
            <div className="space-y-5">
              {groupedDocuments.map(([repo, documents]) => (
                <section key={repo}>
                  <div className="mb-2 flex items-center gap-2 px-2 text-xs font-medium uppercase text-muted-foreground">
                    <Folder className="h-3.5 w-3.5" />
                    <span className="truncate">{repo}</span>
                  </div>
                  <div className="space-y-1">
                    {documents.map((document) => {
                      const active = document.id === selectedId;
                      return (
                        <button
                          key={document.id}
                          type="button"
                          onClick={() => selectDocument(document.id)}
                          className={`block w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                            active
                              ? "border-primary/20 bg-muted text-foreground"
                              : "border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0" />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {document.title}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs">
                            <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">
                              {document.kindLabel}
                            </span>
                            <span className="min-w-0 truncate">{document.relativePath}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-hidden">
        {payload.selectedDocument ? (
          <div className="flex h-full min-h-0 flex-col">
            <header className="border-b border-border bg-background px-8 py-5">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">
                      {payload.selectedDocument.kindLabel}
                    </span>
                    <span className="truncate">{payload.selectedDocument.relativePath}</span>
                  </div>
                  <h2 className="truncate text-2xl font-semibold">
                    {payload.selectedDocument.title}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>{payload.selectedDocument.repo}</span>
                    <span>{dateFormatter.format(new Date(payload.selectedDocument.modifiedAt))}</span>
                    <span>{formatBytes(payload.selectedDocument.size)}</span>
                    <span className="font-mono">
                      {payload.selectedDocument.contentHash.slice(0, 8)}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  <span>Watching</span>
                </div>
              </div>
            </header>

            <div className="creed-scrollbar min-h-0 flex-1 overflow-y-auto px-8 py-8">
              <article
                className="mx-auto max-w-4xl text-base leading-7 text-foreground [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_h1]:mb-5 [&_h1]:mt-8 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:mb-4 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mb-3 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h4]:mb-2 [&_h4]:mt-5 [&_h4]:text-lg [&_h4]:font-semibold [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-4 [&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-card [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-sm [&_strong]:font-semibold [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6"
                dangerouslySetInnerHTML={{ __html: payload.selectedDocument.html }}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-sm rounded-xl border border-border bg-card p-6">
              <FileText className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
              <h2 className="text-base font-semibold">No document selected</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Add repo document sources locally, then generated audits and reviews will appear here.
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
