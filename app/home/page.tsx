import { LandingHeroEntry } from "@/components/auth/landing-hero-entry";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function HomeLandingPage() {
  return <LandingHeroEntry configured={isSupabaseConfigured()} />;
}
