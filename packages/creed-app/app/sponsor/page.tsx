import type { Metadata } from "next";
import { SponsorPageView } from "@/components/marketing/sponsor-page-view";
import { JsonLd } from "@/components/marketing/json-ld";
import { breadcrumbSchema, graph, webPageSchema } from "@/lib/seo/structured-data";

const PATH = "/sponsor";
const TITLE = "Sponsor";
const DESCRIPTION = "Support the continued development of Creed.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
};

export default function SponsorPage() {
  return (
    <>
      <JsonLd
        data={graph(
          webPageSchema({ path: PATH, name: TITLE, description: DESCRIPTION }),
          breadcrumbSchema(PATH, [
            { name: "Creed", path: "/home" },
            { name: TITLE, path: PATH },
          ])
        )}
      />
      <SponsorPageView />
    </>
  );
}
