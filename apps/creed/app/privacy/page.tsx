import type { Metadata } from "next";
import { PrivacyPageView } from "@/components/marketing/privacy-page-view";
import { JsonLd } from "@/components/marketing/json-ld";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/structured-data";

const PATH = "/privacy";
const TITLE = "Privacy Policy";
const DESCRIPTION = "How Creed collects, uses, and protects your information.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
};

export default function PrivacyPage() {
  return (
    <>
      <JsonLd
        data={graph(
          webPageSchema({ path: PATH, name: TITLE, description: DESCRIPTION }),
          breadcrumbSchema(PATH, [
            { name: "Creed", path: "/home" },
            { name: "Privacy", path: PATH },
          ])
        )}
      />
      <PrivacyPageView />
    </>
  );
}
