import type { Metadata } from "next";
import { PricingPageView } from "@/components/marketing/pricing-page-view";

export const metadata: Metadata = {
  title: "Pricing | Creed",
  description: "Creed pricing information and current access status.",
};

export default function PricingPage() {
  return <PricingPageView />;
}
