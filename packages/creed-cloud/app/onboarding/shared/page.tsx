import { redirect } from "next/navigation";
import { SharedOnboardingScreen } from "@creed/cloud/components/creed/shared-onboarding-screen";
import { getRequestAuth } from "@/lib/request-auth";
import { hasActiveEntitlement } from "@creed/cloud/lib/stripe";
import { isSupabaseConfigured } from "@creed/persistence/supabase/env";

export const dynamic = "force-dynamic";

export default async function SharedOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ creedId?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/file");
  const { supabase, user } = await getRequestAuth();
  if (!user) redirect("/login?next=/onboarding/shared");

  const { creedId } = await searchParams;
  if (!creedId) redirect("/file");

  const { data: membership } = await supabase
    .from("creed_members")
    .select("role, creeds!inner(type, onboarding_stage)")
    .eq("creed_id", creedId)
    .eq("user_id", user.id)
    .maybeSingle();
  const joined = membership as {
    role?: string;
    creeds?: { type?: string; onboarding_stage?: string | null };
  } | null;
  if (
    joined?.role !== "owner" ||
    joined.creeds?.type !== "shared" ||
    joined.creeds.onboarding_stage == null
  ) {
    redirect("/file");
  }

  const paid = await hasActiveEntitlement(supabase, user.id);

  return <SharedOnboardingScreen creedId={creedId} paid={paid} />;
}
