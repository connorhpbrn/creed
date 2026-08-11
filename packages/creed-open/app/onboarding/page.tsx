import { redirect } from "next/navigation";
import { OnboardingScreen } from "@/components/creed/onboarding-screen";
import { hasPersistedCreed, loadCreedState } from "@/lib/creed-backend";
import { isSupabaseTableMissingError } from "@/lib/creed-backend-errors";
import { getRequestAuth } from "@/lib/request-auth";
import { isSupabaseConfigured } from "@creed/persistence/supabase/env";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  let initialStage: "prompt" | "preview" | undefined;

  if (isSupabaseConfigured()) {
    const { supabase, user } = await getRequestAuth();
    if (!user) redirect("/claim?next=/onboarding");

    if (await hasPersistedCreed(supabase, user.id)) {
      try {
        const result = await loadCreedState(supabase, user);
        initialStage = result.state.sections.some(
          (section) => section.lastEditedType === "agent",
        )
          ? "preview"
          : "prompt";
      } catch (error) {
        if (!isSupabaseTableMissingError(error)) throw error;
      }
    }
  }

  return <OnboardingScreen paid initialStage={initialStage} forceTypePick={false} />;
}
