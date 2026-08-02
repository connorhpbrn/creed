import { notFound } from "next/navigation";
import { CompanyOnboardingScreen } from "@/components/creed/company-onboarding-screen";

export const dynamic = "force-dynamic";

export default function CompanyOnboardingPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <CompanyOnboardingScreen creedId="dev-company-onboarding-preview" previewMode />;
}
