import { redirect } from "next/navigation";
import { CompanyOnboardingScreen } from "@/components/creed/company-onboarding-screen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseLikeClient } from "@/lib/supabase/types";

// Company onboarding. The owner lands here after buying Company (payment/success
// routes here when the Creed still has onboarding_stage set). Gated: signed-in
// owner of a company Creed that is still being set up.
export const dynamic = "force-dynamic";

export default async function CompanyOnboardingPage() {
  if (!isSupabaseConfigured()) redirect("/pricing");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding/company");

  // Find a company Creed this user owns that is still in onboarding.
  const admin = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const { data: owned } = (await admin
    .from("creeds")
    .select("id, onboarding_stage")
    .eq("owner_user_id", user.id)
    .eq("type", "company")) as { data: Array<{ id: string; onboarding_stage: string | null }> | null };

  const pending = (owned ?? []).find((c) => c.onboarding_stage != null);
  if (!pending) {
    // Nothing to set up (already done, or not an owner). Go to the app.
    redirect("/file");
  }

  return <CompanyOnboardingScreen creedId={pending.id} />;
}
