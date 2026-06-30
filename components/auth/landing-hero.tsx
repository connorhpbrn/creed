"use client";

import Link from "next/link";
import { SceneryImage } from "@/components/marketing/scenery-image";
import { BelowHeroSections } from "@/components/marketing/below-hero-sections";
import { CreedAppDemo } from "@/components/marketing/creed-app-demo";
import { MarketingHeader } from "@/components/marketing/site-chrome";
import { useLandingAuthState } from "@/components/marketing/use-landing-auth-state";
import { usePaidStatus } from "@/components/marketing/use-paid-status";
import { useOnboardingResume } from "@/components/marketing/use-onboarding-resume";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { ArrowRightIcon } from "@/components/ui/arrow-right";

const lightHeroImage = "/assets/landing/scenery/light-hero.png";
const darkHeroImage = "/assets/landing/scenery/dark-hero.png";

export function LandingHero({ configured }: { configured: boolean }) {
  const authState = useLandingAuthState(configured);
  const paidStatus = usePaidStatus(configured);
  const isPaid = authState === "signed-in" && paidStatus === "paid";
  // Signed-in, unpaid, with an unfinished onboarding in this browser -> resume
  // straight into /onboarding rather than the generic "Get Started".
  const canResume = useOnboardingResume(configured) && !isPaid;
  const heroArrow = useAnimatedIconControls(80, undefined, 420);

  const ctaHref = isPaid ? "/file" : canResume ? "/onboarding" : "/pricing";
  const ctaLabel = isPaid ? "Go to app" : canResume ? "Resume" : "Get Started";

  return (
    <>
      {/* Header rendered at the page root (not inside the hero section) so its
          fixed z-50 sits above the app-demo bridge's z-20 - otherwise the demo,
          a root-level sibling, paints over the header trapped in the hero's
          z-10 stacking context. */}
      <MarketingHeader configured={configured} scrolled={false} />
      <section className="relative bg-[var(--creed-background)]">
        {/* Full-bleed hero art (no framed card). The page background fades over
            the lower edge so the app demo below reads as crossing the seam. */}
        <div className="relative flex min-h-[94svh] flex-col overflow-hidden">
          {/* Theme-paired hero art (light/dark). SceneryImage still self-heals to
              a labelled placeholder if a file is ever missing. */}
          <SceneryImage
            src={lightHeroImage}
            fileName="light-hero.png"
            label="Light hero"
            priority
            className="dark:hidden"
          />
          <SceneryImage
            src={darkHeroImage}
            fileName="dark-hero.png"
            label="Dark hero"
            hint="landscape, ~16:9"
            className="hidden dark:block"
          />

          {/* Top wash keeps the header + headline legible over the art. */}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,31,60,0.18)_0%,rgba(15,31,60,0.08)_30%,rgba(15,31,60,0)_60%)] dark:bg-[linear-gradient(180deg,rgba(0,0,0,0.34)_0%,rgba(0,0,0,0.16)_30%,rgba(0,0,0,0)_60%)]" />

          {/* Bottom fade: melt the art into the page background. Eased multi-stop
              gradient (slow onset) so the transition reads smooth, not banded. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
            style={{ backgroundImage: "var(--scenery-fade-down)" }}
          />

          <div className="relative z-10 flex flex-1 flex-col px-6 py-5 md:px-10 md:py-7">
            <div className="flex flex-1 items-start justify-center pt-[13vh] text-center md:pt-[12vh]">
              <div className="w-full max-w-3xl">
                <h1 className="t-hero justify-center text-white">
                  {["Your context file", "for all agents"].map((line) => (
                    <span key={line} className="block whitespace-nowrap">
                      {line}
                    </span>
                  ))}
                </h1>

                <p className="mx-auto mt-5 max-w-xl text-[15px] font-semibold text-white/90 md:mt-6 md:whitespace-nowrap md:text-[18px]">
                  One markdown file every AI reads before it answers.
                </p>

                <div className="mt-7 flex justify-center">
                  <Link
                    href={ctaHref}
                    onMouseEnter={heroArrow.start}
                    onMouseLeave={heroArrow.settle}
                    onPointerDown={(event) => {
                      if (event.pointerType !== "mouse") heroArrow.start();
                    }}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white pl-4 pr-3 text-[14px] font-medium text-[#19345f] transition-colors hover:bg-[#f6f7fb]"
                  >
                    <span className="leading-none">{ctaLabel}</span>
                    <ArrowRightIcon
                      ref={heroArrow.iconRef}
                      size={16}
                      className="inline-flex shrink-0 items-center justify-center leading-none"
                    />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The app demo bridges the hero and the first content section: pulled up
          so its top overlaps the faded hero art and its body extends into the
          page below (like a hero product shot crossing the seam). */}
      <div className="relative z-20 -mt-[42vh] px-4 md:-mt-[34vh] md:px-10 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <CreedAppDemo />
        </div>
      </div>

      <BelowHeroSections configured={configured} />
    </>
  );
}
