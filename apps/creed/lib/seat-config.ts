// Shared seat configuration for the Company plan. No "server-only" and no React,
// so both the Buy-seats dialog (display) and server code can import it. The
// per-seat USD figures are the plan's list prices (spec: +$12/mo, +$99/yr, +$199
// lifetime per extra seat) and are shown to the buyer; the actual charge always
// uses the live Stripe seat price (resolveSeatPriceId), so keep these in step
// with the Stripe seat prices.

export const SEAT_PRESETS = [1, 3, 5, 10] as const;
export const MIN_SEATS = 1;
export const MAX_SEATS = 100;

// Keyed by the company's cadence: a monthly/yearly subscription seat, or a
// one-time lifetime seat.
export type SeatCadence = "month" | "year" | "lifetime";

export const SEAT_PRICE_USD: Record<SeatCadence, number> = {
  month: 12,
  year: 99,
  lifetime: 199,
};

// Short suffix for the price line, e.g. "$12 / seat / mo".
export const SEAT_PRICE_SUFFIX: Record<SeatCadence, string> = {
  month: "/ seat / mo",
  year: "/ seat / yr",
  lifetime: "/ seat, once",
};

/** The billing cadence for seat pricing from a company's billing shape. */
export function seatCadence(
  billingMode: "subscription" | "lifetime",
  interval: "month" | "year" | null,
): SeatCadence {
  if (billingMode === "lifetime") return "lifetime";
  return interval === "year" ? "year" : "month";
}
