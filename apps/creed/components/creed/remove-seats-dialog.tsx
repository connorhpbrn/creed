"use client";

// Remove-seats modal for a subscription company Creed. Set a new (lower) number
// of extra seats; the bill drops from the next cycle (Stripe credits the
// proration, no mid-cycle refund). Capacity model: removing a member keeps the
// seat open, so seats are only released when the owner reduces them here.
// Owner-only (the caller gates on role). Not shown for lifetime plans (their
// seats are purchased capacity and can't be removed).

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SEAT_PRICE_SUFFIX, SEAT_PRICE_USD, type SeatCadence } from "@/lib/seat-config";

type RemoveSeatsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creedId: string;
  cadence: SeatCadence;
  used: number;
  included: number;
  extra: number;
  onDone: () => void;
};

export function RemoveSeatsDialog({
  open,
  onOpenChange,
  creedId,
  cadence,
  used,
  included,
  extra,
  onDone,
}: RemoveSeatsDialogProps) {
  const [value, setValue] = useState(String(extra));
  const [busy, setBusy] = useState(false);

  // The lowest allowed extra count: capacity can't drop below what's in use.
  const floor = Math.max(0, used - included);

  useEffect(() => {
    if (open) {
      setValue(String(extra));
      setBusy(false);
    }
  }, [open, extra]);

  const parsed = value.trim() === "" ? Number.NaN : Number(value);
  const valid =
    Number.isInteger(parsed) && parsed >= floor && parsed < extra;
  const unit = SEAT_PRICE_USD[cadence];

  async function handleSet() {
    if (!valid) return;
    setBusy(true);
    try {
      const res = await fetch("/api/app/company/seats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creedId, mode: "set", quantity: parsed }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't update seats.");
      toast.success("Seats updated.");
      onDone();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update seats.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
        <DialogHeader>
          <DialogTitle>Remove seats</DialogTitle>
          <DialogDescription>
            {`You have ${extra} extra seat${extra === 1 ? "" : "s"} at $${unit} ${SEAT_PRICE_SUFFIX[cadence]}. Removing a member keeps the seat open for a re-invite; lower it here to reduce your bill from the next cycle.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-[12px] font-medium text-[var(--creed-text-secondary)]">
            New number of extra seats
          </label>
          <Input
            inputMode="numeric"
            value={value}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === "" || /^\d{0,3}$/.test(raw)) setValue(raw);
            }}
            placeholder={String(floor)}
            className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[14px]"
          />
          {value.trim() !== "" && !valid ? (
            <p className="text-[12px] text-[#DC2626]">
              {parsed >= extra
                ? "Enter a lower number to remove seats."
                : `You can't go below ${floor} - remove members or revoke invites first.`}
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
          <Button variant="ghost" className="rounded-md" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-md"
            onClick={() => void handleSet()}
            disabled={!valid || busy}
          >
            {busy ? "Working" : "Update seats"}
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
