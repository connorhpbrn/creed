import type { CreedEdition } from "@/lib/edition";

export const edition = {
  kind: "open",
  capabilities: {
    hostedAccounts: false,
    sharedCreeds: false,
    managedBilling: false,
    managedCredits: false,
    feedback: false,
    cli: false,
    publicSignup: false,
  },
  routes: {
    unauthenticated: "/claim",
    connectAuthentication: "/claim",
  },
  save: {
    persistedLabel: "Saved to database",
    persistedTone: "text-[#16A34A] dark:text-[#4ADE80]",
    pendingLabel: "Saving…",
    pendingTone: "text-[var(--creed-text-secondary)]",
    failureLabel: "Couldn’t save",
    icon: "database",
  },
} as const satisfies CreedEdition;
