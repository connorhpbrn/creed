import type { Metadata } from "next";
import { CompanyPageView } from "@/components/marketing/company-page-view";
import { JsonLd } from "@/components/marketing/json-ld";
import { companyFaqItems } from "@/lib/marketing/faq";
import {
  breadcrumbSchema,
  faqPageSchema,
  graph,
  softwareApplicationSchema,
  webPageSchema,
} from "@/lib/seo/structured-data";

const PATH = "/company";
const TITLE = "Company plan";
const DESCRIPTION =
  "The Creed Company plan: one shared Company Creed every member's agents read, with roles, section permissions, an activity view, and admin controls. From $129/mo for 10 seats.";
const DATE_MODIFIED = "2026-07-07";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
};

export default function CompanyPage() {
  return (
    <>
      <JsonLd
        data={graph(
          webPageSchema({
            path: PATH,
            name: "Creed Company plan",
            description: DESCRIPTION,
            dateModified: DATE_MODIFIED,
          }),
          breadcrumbSchema(PATH, [
            { name: "Creed", path: "/home" },
            { name: "Company", path: PATH },
          ]),
          softwareApplicationSchema(),
          faqPageSchema(companyFaqItems)
        )}
      />
      <CompanyPageView />
    </>
  );
}
