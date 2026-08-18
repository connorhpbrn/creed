"use client";

import { Button } from "@creed/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@creed/ui/dialog";

export function SponsorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
        <DialogHeader>
          <DialogTitle>Contribute</DialogTitle>
          <DialogDescription>
            Sponsorship is handled on the Creed website.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
          <Button
            variant="ghost"
            className="rounded-md"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button asChild className="rounded-md bg-[var(--creed-accent)] text-white hover:bg-[var(--creed-accent-hover)]">
            <a href="https://creed.md/sponsor">Open sponsor page</a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
