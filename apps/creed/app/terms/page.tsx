import type { Metadata } from "next";
import { TermsPageView } from "@/components/marketing/terms-page-view";
import { JsonLd } from "@/components/marketing/json-ld";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/structured-data";

const PATH = "/terms";
const TITLE = "Terms and Conditions";
const DESCRIPTION = "The rules that govern your use of Creed.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
};

export default function TermsPage() {
  return (
    <>
      <JsonLd
        data={graph(
          webPageSchema({ path: PATH, name: TITLE, description: DESCRIPTION }),
          breadcrumbSchema(PATH, [
            { name: "Creed", path: "/home" },
            { name: "Terms", path: PATH },
          ])
        )}
      />
      <TermsPageView />
    </>
  );
}
