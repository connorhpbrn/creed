import type { ReactNode } from "react";
import { AuthedProviders } from "@/components/creed/authed-providers";

// Onboarding uses CreedProvider (the screen claims and previews a Creed), so it
// gets the same dynamic, user-state boundary as the app shell. It lives outside
// (creed-app) because it has no app chrome and no entitlement gate.
export const dynamic = "force-dynamic";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <AuthedProviders>{children}</AuthedProviders>;
}
