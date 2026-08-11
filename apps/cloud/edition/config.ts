import type { CreedEdition } from "@/lib/edition";

export const edition = {
  kind: "cloud",
  capabilities: {
    hostedAccounts: true,
    sharedCreeds: true,
    managedBilling: true,
    managedCredits: true,
    feedback: true,
    cli: false,
  },
  routes: {
    unauthenticated: "/home",
    connectAuthentication: "/login",
  },
  save: {
    persistedLabel: "Synced to cloud",
    persistedTone: "text-[var(--creed-accent)]",
    pendingLabel: "Syncing…",
    pendingTone: "text-[var(--creed-accent)]",
    failureLabel: "Sync failed",
    icon: "cloud",
  },
} as const satisfies CreedEdition;
