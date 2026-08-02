// Shared response-header constants. Kept in a zero-import leaf module so any
// route can use them without pulling in extra dependencies.

// Per-user, uncacheable responses (account/billing/credits/onboarding status,
// etc.). A CDN or browser back-cache must never serve one user another's data.
export const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;
