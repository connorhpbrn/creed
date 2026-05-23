import type { Metadata } from "next";
import { PrivacyPageView } from "@/components/marketing/privacy-page-view";

export const metadata: Metadata = {
  title: "Privacy Policy | Creed",
  description: "How Creed collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return <PrivacyPageView />;
}
