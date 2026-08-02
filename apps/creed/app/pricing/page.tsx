import type { Metadata } from "next";
import { PricingPageView } from "@/components/marketing/pricing-page-view";
import { PricingReference } from "@/components/marketing/pricing-reference";
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
const DESCRIPTION =
  "Creed pricing: free to self-host, Personal hosting from $12/mo ($99/yr, $199 lifetime), and the Company plan from $129/mo ($999/yr, $1,999 lifetime) for 10 seats. All hosted plans support BYOK.";

const DATE_MODIFIED = "2026-07-07";

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
