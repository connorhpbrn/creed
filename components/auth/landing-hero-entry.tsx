"use client";

import { LandingHero } from "@/components/auth/landing-hero";

export function LandingHeroEntry({ configured }: { configured: boolean }) {
  return <LandingHero configured={configured} />;
}
