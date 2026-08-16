import type { CreedEdition } from "@/lib/edition";
import { isPrivateCloud } from "@creed/cloud/lib/cloud-access";

const privateCloud = isPrivateCloud();

export const edition = {
  kind: "cloud",
  capabilities: {
    hostedAccounts: true,
    sharedCreeds: true,
    managedBilling: !privateCloud,
    managedCredits: true,
    feedback: true,
    cli: false,
    publicSignup: !privateCloud,
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
