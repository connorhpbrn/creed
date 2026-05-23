import type { Metadata } from "next";
import { DocsPageView } from "@/components/marketing/docs-page-view";

export const metadata: Metadata = {
  title: "Docs | Creed",
  description: "How to set up Creed, connect agents, and keep your context useful over time.",
};

export default function DocsPage() {
  return <DocsPageView />;
}
