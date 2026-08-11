// Shared credit configuration. Deliberately has neither "server-only" nor
// "use client" so the server-side billing (lib/ai/credits, lib/ai/persistence,
// the credits routes) and the client UI (settings, add-credits dialog) read one
// source of truth.

// Markup applied to the real OpenRouter token cost when billing prepaid credits.
// BYOK is at-cost. Applied prospectively at deduction time, and every usage row
// stores the amount actually charged, so changing this never re-prices an
// existing balance or the historical spend chart.
export const CREDIT_MARKUP = 2;

// Top-up bounds, in whole USD. $5 is the floor; the presets nudge toward $10+ so
// Stripe's fixed per-charge fee doesn't dominate a small top-up. $5 stays
// reachable via the custom-amount field.
export const MIN_TOPUP_USD = 5;
export const MAX_TOPUP_USD = 500;
export const PRESET_TOPUPS_USD = [10, 25, 50, 100] as const;

// Included AI allowance per plan, in MARKED-UP dollars (what the user can spend).
// At the 2x markup, $5 marked-up is ~$2.50 of real model cost. Monthly and
// yearly both grant $5 on a monthly cadence (yearly is a monthly drip, not an
// annual lump). Open deployments do not grant managed credits.
export const GRANT_MONTHLY_USD = 5;
export const GRANT_YEARLY_USD = 5;

// UTC year-month key ("YYYY-MM") that resets the monthly allowance. Shared by the
// Cloud grant path.
export function monthlyAllowancePeriodKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// The granted allowance is "running low" once 80% of it is spent (<= 20% left).
// Used by in-app credit toasts; there is never a hard wall while any granted or
// purchased credit remains.
export const LOW_ALLOWANCE_RATIO = 0.2;
