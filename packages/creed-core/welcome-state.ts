// Pure welcome-tour show rules. Kept free of server-only imports so tests
// and client code can share them. Persistence lives in lib/stripe.ts.

export type WelcomeVariant = "personal" | "shared";

/**
 * Should the welcome pop-up show for this entitlement + Creed type? True when
 * that type's tour has never been dismissed, or was dismissed before the
 * current entitlement `paid_at` (cancel + re-buy counts as fresh).
 */
export function shouldShowWelcome(
  paidAt: string | null,
  welcomedAt: string | null,
): boolean {
  if (!paidAt) return false;
  if (!welcomedAt) return true;
  const paid = Date.parse(paidAt);
  const welcomed = Date.parse(welcomedAt);
  if (Number.isNaN(paid) || Number.isNaN(welcomed)) return false;
  return welcomed < paid;
}
