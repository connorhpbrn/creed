"use client";

import Link from "next/link";
import { SceneryFade, SceneryImage } from "@/components/marketing/scenery-image";
import { BelowHeroSections } from "@/components/marketing/below-hero-sections";
import { CreedAppDemo } from "@/components/marketing/creed-app-demo";
import { MarketingHeader } from "@/components/marketing/site-chrome";
import { useLandingAuthState } from "@/components/marketing/use-landing-auth-state";
import { useEditionContinueHref } from "@creed/edition/ui";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { ArrowRightIcon } from "@creed/ui/arrow-right";
import { useCreedEdition } from "@/components/creed/edition-provider";
import { GITHUB_URL } from "@/lib/branding";

const heroImage = "/assets/landing/scenery/garden.png";

export function LandingHero({ configured }: { configured: boolean }) {
  const { hostedAccounts: hasHostedAccounts, publicSignup } =
    useCreedEdition().capabilities;
  const cloudAuthEnabled = configured && hasHostedAccounts;
  const authState = useLandingAuthState(cloudAuthEnabled);
  const { href: ctaHref, isPaid, canResume } =
    useEditionContinueHref();
  const heroArrow = useAnimatedIconControls(80, undefined, 420);

  const ctaLabel =
    !hasHostedAccounts
      ? "View on GitHub"
      : !publicSignup && authState !== "signed-in"
        ? "View roadmap"
      : authState !== "signed-in"
      ? "Get Started"
      : isPaid
        ? "Go to app"
        : canResume
          ? "Resume"
          : "Get Started";
  // Signed out: account creation then onboarding (paywall). Pricing is a
  // separate deliberate path for buying Cloud without the questionnaire.
  const resolvedHref =
    !hasHostedAccounts
      ? GITHUB_URL
      : !publicSignup && authState !== "signed-in"
        ? "/roadmap"
      : authState === "signed-in"
        ? ctaHref
        : "/signup?next=/onboarding";

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
          {/* SceneryImage self-heals to a labelled placeholder if the source is
              ever missing. */}
          <SceneryImage
            src={heroImage}
            fileName="garden.png"
            label="Garden"
            priority
            hint="landscape, ~16:9"
          />

          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,31,60,0.18)_0%,rgba(15,31,60,0.08)_30%,rgba(15,31,60,0)_60%)] dark:bg-[linear-gradient(180deg,rgba(0,0,0,0.34)_0%,rgba(0,0,0,0.16)_30%,rgba(0,0,0,0)_60%)]" />

          {/* Bottom fade: melt the art into the page background. Eased multi-stop
              gradient (slow onset) so the transition reads smooth, not banded. */}
          <SceneryFade direction="down" className="inset-x-0 bottom-0 top-auto h-1/2" />

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
                  Tell every agent who you are, once.
                </p>

                <div className="mt-7 flex justify-center">
                  <Link
                    href={resolvedHref}
                    target={!hasHostedAccounts ? "_blank" : undefined}
                    rel={!hasHostedAccounts ? "noreferrer" : undefined}
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
      <div className="relative z-20 -mt-[30vh] px-4 md:-mt-[34vh] md:px-10 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <CreedAppDemo />
        </div>
      </div>

      <BelowHeroSections configured={configured} />
    </>
  );
}
