"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@creed/ui/dialog";
import { RoadmapLabelTag } from "@/components/marketing/roadmap-status";
import type { RoadmapTask } from "@/lib/marketing/roadmap";

export function RoadmapTaskDialog({
  task,
  open,
  onOpenChange,
  trigger,
}: {
  task: RoadmapTask;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[min(80vh,42rem)] overflow-y-auto rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)] sm:max-w-lg">
        <DialogHeader className="gap-3 pr-8">
          <DialogTitle className="text-[20px] leading-snug tracking-[-0.01em]">
            {task.title}
          </DialogTitle>
          <DialogDescription className="t-body whitespace-pre-wrap text-[var(--creed-text-secondary)]">
            {task.description ?? "No additional details yet."}
          </DialogDescription>
        </DialogHeader>

        {task.labels.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {task.labels.map((label) => (
              <RoadmapLabelTag key={label} label={label} />
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
