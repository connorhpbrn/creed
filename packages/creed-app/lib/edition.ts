export type CreedEditionKind = "open" | "cloud";

export type CreedEdition = Readonly<{
  kind: CreedEditionKind;
  capabilities: Readonly<{
    hostedAccounts: boolean;
    sharedCreeds: boolean;
    managedBilling: boolean;
    managedCredits: boolean;
    feedback: boolean;
    cli: boolean;
    publicSignup: boolean;
  }>;
  routes: Readonly<{
    unauthenticated: string;
    connectAuthentication: string;
  }>;
  save: Readonly<{
    persistedLabel: string;
    persistedTone: string;
    pendingLabel: string;
    pendingTone: string;
    failureLabel: string;
    icon: "cloud" | "database";
  }>;
}>;
