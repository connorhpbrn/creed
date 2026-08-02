"use client";

// Version-history sheet for a company section (owner/admin). Lists the stored
// versions newest-first with who/what/when, and restores one - which writes a
// new version (never destroys history). Read on open; personal Creeds don't use
// this (the affordance is gated to company managers).

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type VersionEntry = {
  id: number;
  revision: number;
  name: string;
  cause: string;
  actorType: string;
  agentName: string | null;
  createdAt: string;
};

const CAUSE_LABEL: Record<string, string> = {
  manual: "Manual edit",
  mcp: "Agent edit",
  proposal: "Accepted proposal",
  restore: "Restore",
  import: "Import",
  onboarding: "Onboarding",
};

function whenLabel(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d`;
  return new Date(then).toLocaleDateString();
}

export function SectionHistorySheet({
  open,
  onOpenChange,
  creedId,
  sectionId,
  sectionName,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creedId: string;
  sectionId: string;
  sectionName: string;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setVersions([]);
    void (async () => {
      try {
        const res = await fetch(
          `/api/app/sections/${sectionId}/versions?creedId=${encodeURIComponent(creedId)}`,
          { cache: "no-store" },
        );
        const data = (await res.json().catch(() => ({}))) as {
          versions?: VersionEntry[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          toast.error(data.error ?? "Could not load history.");
          return;
        }
        setVersions(data.versions ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sectionId, creedId]);

  async function restore(versionId: number) {
    setRestoringId(versionId);
    try {
      const res = await fetch(`/api/app/sections/${sectionId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creedId, versionId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Could not restore that version.");
        return;
      }
      toast.success("Section restored.");
      onRestored();
      onOpenChange(false);
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-hidden rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>{`Versions of ${sectionName}, newest first.`}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-[var(--creed-text-tertiary)]">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </div>
        ) : versions.length === 0 ? (
          <p className="py-8 text-center text-[14px] text-[var(--creed-text-secondary)]">
            No earlier versions yet.
          </p>
        ) : (
          <div className="max-h-[56vh] space-y-2 overflow-y-auto creed-scrollbar pr-1">
            {versions.map((v, index) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--creed-border)] px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[14px] font-medium text-[var(--creed-text-primary)]">
                    <span>Revision {v.revision}</span>
                    {index === 0 ? (
                      <span className="rounded-md bg-[var(--creed-surface-raised)] px-1.5 py-0.5 text-[11px] font-normal text-[var(--creed-text-tertiary)]">
                        current
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-[var(--creed-text-tertiary)]">
                    {CAUSE_LABEL[v.cause] ?? v.cause}
                    {v.actorType === "agent" && v.agentName ? ` · ${v.agentName}` : ""}
                    {` · ${whenLabel(v.createdAt)}`}
                  </div>
                </div>
                {index === 0 ? null : (
                  <Button
                    variant="outline"
                    className="shrink-0 rounded-md border-[var(--creed-border)]"
                    disabled={restoringId !== null}
                    onClick={() => void restore(v.id)}
                  >
                    {restoringId === v.id ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      "Restore"
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
