import type { FaqItem } from "@/lib/marketing/faq";
import { FaqAccordion } from "@/components/marketing/faq-accordion";

export function FaqSection({
  heading = "Common questions",
  items,
  className,
}: {
  heading?: string;
  items: FaqItem[];
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="text-[22px] font-medium tracking-[-0.01em] text-[var(--creed-text-primary)] md:text-[26px]">
        {heading}
      </h2>
      <div className="mt-6">
        <FaqAccordion items={items} />
      </div>
    </section>
  );
}
