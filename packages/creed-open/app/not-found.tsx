import Link from "next/link";
import { SceneryImage } from "@/components/marketing/scenery-image";

// 404 for any unmatched route under the app router. Stays branded so it
// reads as part of Creed rather than a Next.js default page.
export default function NotFound() {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[var(--creed-background)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[56svh] min-h-[24rem] overflow-hidden md:h-[58svh]"
      >
        <SceneryImage
          src="/assets/landing/scenery/garden.png"
          fileName="garden.png"
          label="Garden"
          className="object-bottom"
        />

        <div
          className="absolute inset-0 rotate-180"
          style={{ backgroundImage: "var(--scenery-fade-down)" }}
        />
        <div className="absolute inset-x-0 top-0 h-0.5 bg-[var(--creed-background)]" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 px-6 pb-10 pt-[12svh] text-center md:pt-[11svh]">
        <h1 className="t-section text-[var(--creed-text-primary)]">
          Page not found
        </h1>
        <p className="max-w-md text-[15px] leading-7 text-[var(--creed-text-secondary)]">
          That URL doesn&apos;t resolve to anything on Creed. Double-check the
          link, or jump back to a page we know exists.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <Link
            href="/home"
            className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--creed-accent)] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[var(--creed-accent-hover)]"
          >
            Back home
          </Link>
          <Link
            href="/roadmap"
            className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--creed-border)] bg-transparent px-5 text-[14px] font-medium text-[var(--creed-text-primary)] transition-colors hover:bg-[var(--creed-surface-raised)]"
          >
            View roadmap
          </Link>
        </div>
      </div>
    </div>
  );
}
