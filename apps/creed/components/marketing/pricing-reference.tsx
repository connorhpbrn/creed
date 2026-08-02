import { FaqSection } from "@/components/marketing/faq-section";
import { pricingFaqItems } from "@/lib/marketing/faq";

// Pricing FAQ that ships in the initial HTML and backs the page's FAQ schema.
export function PricingReference() {
  return (
    <section className="border-t border-[var(--creed-border)] py-14 md:py-16">
      <FaqSection
        heading="Common questions"
        items={pricingFaqItems}
      />
    </section>
  );
}
