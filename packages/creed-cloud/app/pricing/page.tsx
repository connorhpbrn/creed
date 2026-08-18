import type { Metadata } from "next";
import { PricingPageView } from "@creed/cloud/components/marketing/pricing-page-view";
import { PricingReference } from "@creed/cloud/components/marketing/pricing-reference";
import { JsonLd } from "@/components/marketing/json-ld";
import { pricingFaqItems } from "@/lib/marketing/faq";
import {
  breadcrumbSchema,
  faqPageSchema,
  graph,
  softwareApplicationSchema,
  webPageSchema,
} from "@/lib/seo/structured-data";

const PATH = "/pricing";
const TITLE = "Pricing";
// Rides in the meta description, og/twitter descriptions, and the WebPage
// schema, so it is one of the most quotable strings on the site.
const DESCRIPTION =
  "Creed Open is free and MIT licensed for self-hosted Personal Creeds. Creed Cloud is in development and is not available for public purchase.";

const DATE_MODIFIED = "2026-08-10";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
};

export default function PricingPage() {
  return (
    <>
      <JsonLd
        data={graph(
          webPageSchema({
            path: PATH,
            name: "Creed pricing",
            description: DESCRIPTION,
            dateModified: DATE_MODIFIED,
          }),
          breadcrumbSchema(PATH, [
            { name: "Creed", path: "/home" },
            { name: "Pricing", path: PATH },
          ]),
          softwareApplicationSchema(),
          faqPageSchema(pricingFaqItems)
        )}
      />
      <PricingPageView reference={<PricingReference />} />
    </>
  );
}
