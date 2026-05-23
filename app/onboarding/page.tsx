import { redirect } from "next/navigation";
import { OnboardingScreen } from "@/components/creed/onboarding-screen";
import { hasPaidEntitlement } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function OnboardingPage() {
  // /onboarding lives outside the (creed-app) route group so it doesn't
  // inherit the layout gate. Inline the same check here: signed-in +
  // paid required, else bounce back to /pricing.
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/pricing");
    }
    const paid = await hasPaidEntitlement(supabase, user.id);
    if (!paid) {
      redirect("/pricing?reason=not_paid");
    }
  }

  return <OnboardingScreen />;
}
