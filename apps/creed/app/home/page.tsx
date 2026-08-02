import type { Metadata } from "next";
import { LandingHeroEntry } from "@/components/auth/landing-hero-entry";
import { JsonLd } from "@/components/marketing/json-ld";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { homeFaqItems } from "@/lib/marketing/faq";
import {
  faqPageSchema,
  graph,
  organizationSchema,
  softwareApplicationSchema,
  websiteSchema,
} from "@/lib/seo/structured-data";

// /home is the canonical public landing (the root `/` redirects here for
// signed-out visitors). It inherits the brand title.default and the full
// openGraph card from the root layout; we only pin the canonical so search
// and AI engines treat /home, not the redirecting root, as the indexable
// page. (Don't set a partial openGraph here - Next replaces the object
// rather than deep-merging, which would drop the inherited share image.)
export const metadata: Metadata = {
  alternates: { canonical: "/home" },
};

export default function HomeLandingPage() {
  return (
    <>
      <JsonLd
        data={graph(
          organizationSchema(),
          websiteSchema(),
          softwareApplicationSchema(),
          faqPageSchema(homeFaqItems)
        )}
      />
      <LandingHeroEntry configured={isSupabaseConfigured()} />
    </>
  );
}
