import { redirect } from "next/navigation";
import { OnboardingScreen } from "@/components/creed/onboarding-screen";
import { hasPersistedCreed, loadCreedState } from "@/lib/creed-backend";
import { isSupabaseTableMissingError } from "@/lib/creed-backend-errors";
import { hasActiveEntitlement } from "@creed/cloud/lib/stripe";
import { isSupabaseConfigured } from "@creed/persistence/supabase/env";
import { getRequestAuth } from "@/lib/request-auth";
import { hasPrivateCloudAccess } from "@creed/cloud/lib/cloud-access";

// Onboarding is free and lives outside the (creed-app) route group. Anyone
// signed in can run it (answer questions, build with their assistant via a
// copy-paste prompt, preview); the paywall is the hosted app, not onboarding.
// We pass two signals to the screen:
//   - paid: switches the final CTA between the checkout path ("Start for
//     $12/mo") and "Go to my Creed" (straight into the app) once they
//     already have access.
//   - initialStage: resume point. A composed Creed resumes on the preview; a
//     claimed-but-not-composed seed resumes on the prompt step; otherwise the
//     screen starts at step 0.
//   - forceTypePick: Shared onboarding Back returns here with ?pick=1 so the
//     type choice is shown even when a Personal Creed already exists to resume.
export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ pick?: string }>;
}) {
  // Default to paid=true when Supabase isn't configured (local dev) so the
  // screen mirrors the layout, which skips the gate entirely in that mode.
  let paid = true;
  let initialStage: "prompt" | "preview" | undefined;
  const { pick } = await searchParams;
  const forceTypePick = pick === "1";

  if (isSupabaseConfigured()) {
    const { supabase, user } = await getRequestAuth();

    if (!user) {
      redirect("/signup?next=/onboarding");
    }

    paid = hasPrivateCloudAccess(user.email)
      ? true
      : await hasActiveEntitlement(supabase, user.id);

    // A fresh user has no Creed row yet. AuthedProviders supplies the blank
    // onboarding state, so only load persisted state when there is one to
    // resume. Skip resume when the user explicitly returned to the type picker.
    const hasCreed = !forceTypePick && (await hasPersistedCreed(supabase, user.id));
    if (hasCreed) {
      try {
        const result = await loadCreedState(supabase, user);
        if (result.state.sections.length === 0) {
          initialStage = undefined;
        } else {
          const composed = result.state.sections.some(
            (section) => section.lastEditedType === "agent"
          );
          initialStage = composed ? "preview" : "prompt";
        }
      } catch (error) {
        if (!isSupabaseTableMissingError(error)) {
          throw error;
        }
      }
    }
  }

  return (
    <OnboardingScreen
      paid={paid}
      initialStage={initialStage}
      forceTypePick={forceTypePick}
    />
  );
}
