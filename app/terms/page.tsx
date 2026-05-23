import type { Metadata } from "next";
import { TermsPageView } from "@/components/marketing/terms-page-view";

export const metadata: Metadata = {
  title: "Terms and Conditions | Creed",
  description: "The rules that govern your use of Creed.",
};

export default function TermsPage() {
  return <TermsPageView />;
}
