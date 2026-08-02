"use client";

// Buy-seats modal for a company Creed. Pick a preset or custom number of extra
// seats, see the price, and buy. Subscription plans are charged the prorated
// amount immediately (card on file) and the capacity updates in place; lifetime
// plans redirect to a one-time Checkout. Owner-only (the caller gates on role).

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
import {
  MAX_SEATS,
  MIN_SEATS,
  SEAT_PRESETS,
  SEAT_PRICE_SUFFIX,
  SEAT_PRICE_USD,
  type SeatCadence,
} from "@/lib/seat-config";
import { PurchasePresetButton } from "@/components/creed/purchase-preset-button";

type BuySeatsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creedId: string;
  cadence: SeatCadence;
  used: number;
  capacity: number;
  onPurchased: () => void;
};

export function BuySeatsDialog({
  open,
  onOpenChange,
  creedId,
  cadence,
  used,
  capacity,
  onPurchased,
}: BuySeatsDialogProps) {
  const [quantity, setQuantity] = useState<number>(1);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setQuantity(1);
      setCustom("");
      setBusy(false);
    }
  }, [open]);

  const customValue = custom.trim() ? Number(custom) : null;
  const effective =
    customValue !== null && Number.isInteger(customValue) ? customValue : quantity;
  const valid = Number.isInteger(effective) && effective >= MIN_SEATS && effective <= MAX_SEATS;

  const unit = SEAT_PRICE_USD[cadence];
  const total = valid ? unit * effective : 0;

  async function handleBuy() {
    if (!valid) return;
    setBusy(true);
    try {
      const res = await fetch("/api/app/company/seats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creedId, quantity: effective }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Couldn't buy seats.");
      }
      // Lifetime: a one-time Checkout redirect.
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      toast.success(
        effective === 1 ? "1 seat added." : `${effective} seats added.`,
      );
      onPurchased();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't buy seats.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
        <DialogHeader>
          <DialogTitle>Buy seats</DialogTitle>
          <DialogDescription>
            {`${used} of ${capacity} seats in use. $${unit} ${SEAT_PRICE_SUFFIX[cadence]}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            {SEAT_PRESETS.map((preset) => {
              const active = customValue === null && quantity === preset;
              return (
                <PurchasePresetButton
                  key={preset}
                  active={active}
                  onClick={() => {
                    setQuantity(preset);
                    setCustom("");
                  }}
                >
                  {`+${preset}`}
                </PurchasePresetButton>
              );
            })}
          </div>
          <div>
            <label className="mb-2 block text-[12px] font-medium text-[var(--creed-text-secondary)]">
              Or enter a number of seats
            </label>
            <Input
              inputMode="numeric"
              value={custom}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === "" || /^\d{0,3}$/.test(raw)) setCustom(raw);
              }}
              placeholder={`${MIN_SEATS} - ${MAX_SEATS}`}
              className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 text-[14px]"
            />
            {custom.trim() && !valid ? (
              <p className="mt-2 text-[12px] text-[#DC2626]">
                {`Enter a whole number between ${MIN_SEATS} and ${MAX_SEATS}.`}
              </p>
            ) : null}
          </div>
          {valid ? (
            <p className="text-[13px] text-[var(--creed-text-secondary)]">
              {cadence === "lifetime"
                ? `${effective} extra seat${effective === 1 ? "" : "s"} - $${total} once.`
                : `${effective} extra seat${effective === 1 ? "" : "s"} - $${total} ${SEAT_PRICE_SUFFIX[cadence].replace("/ seat ", "")}, prorated today.`}
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
          <Button variant="ghost" className="rounded-md" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-md bg-[var(--creed-accent)] text-white hover:bg-[var(--creed-accent-hover)]"
            onClick={() => void handleBuy()}
            disabled={!valid || busy}
          >
            {busy ? "Working" : cadence === "lifetime" ? `Buy for $${total}` : `Buy ${effective} seat${effective === 1 ? "" : "s"}`}
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
