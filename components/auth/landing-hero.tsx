"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { BelowHeroSections } from "@/components/marketing/below-hero-sections";
import { MarketingHeader } from "@/components/marketing/site-chrome";
import { useLandingAuthState } from "@/components/marketing/use-landing-auth-state";
import { usePaidStatus } from "@/components/marketing/use-paid-status";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { ArrowRightIcon } from "@/components/ui/arrow-right";
import { splitPreservingLigatures } from "@/lib/landing-text";
import { cn } from "@/lib/utils";

const lightApostlesImage = "/assets/landing/backgrounds/light-apostles.avif";
const darkApostlesImage = "/assets/landing/backgrounds/dark-apostles.avif";

export function LandingHero({ configured }: { configured: boolean }) {
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = Boolean(prefersReducedMotion);
  const [animationReady, setAnimationReady] = useState(false);
  const authState = useLandingAuthState(configured);
  const paidStatus = usePaidStatus(configured);
  const isPaid = authState === "signed-in" && paidStatus === "paid";
  const heroArrow = useAnimatedIconControls(80, undefined, 420);

  useEffect(() => {
    if (reduceMotion) {
      setAnimationReady(true);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setAnimationReady(true);
    });

    function handlePageShow() {
      setAnimationReady(false);
      window.requestAnimationFrame(() => {
        setAnimationReady(true);
      });
    }

    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [reduceMotion]);

  return (
    <>
      <section className="relative min-h-screen overflow-hidden bg-[#e9e5de] dark:bg-[#0e0e0d]">
        {/* Theme-paired hero artwork. Both images render to the DOM but only
            the active theme's image is shown — keeps Next/Image priority +
            CDN caching while flipping cleanly with `.dark`. */}
        <Image
          src={lightApostlesImage}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center dark:hidden"
        />
        <Image
          src={darkApostlesImage}
          alt=""
          fill
          sizes="100vw"
          className="hidden object-cover object-center dark:block"
        />

        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,31,60,0.16)_0%,rgba(15,31,60,0.08)_28%,rgba(15,31,60,0.05)_56%,rgba(255,255,255,0)_76%)] dark:bg-[linear-gradient(180deg,rgba(0,0,0,0.32)_0%,rgba(0,0,0,0.18)_28%,rgba(0,0,0,0.08)_56%,rgba(0,0,0,0)_76%)]" />
        <div className="absolute -bottom-[17%] left-[-12%] h-[42%] w-[42%] rounded-[100%] bg-white/88 blur-[56px] dark:bg-[#0e0e0d]/88" />
        <div className="absolute -bottom-[17%] right-[-12%] h-[42%] w-[42%] rounded-[100%] bg-white/88 blur-[56px] dark:bg-[#0e0e0d]/88" />
        <div className="absolute left-1/2 bottom-[-10%] h-[18%] w-[54%] -translate-x-1/2 rounded-[100%] bg-white/38 blur-[72px] dark:bg-[#0e0e0d]/40" />
        <div className="absolute inset-x-0 bottom-0 h-[20%] bg-[linear-gradient(180deg,rgba(255,255,255,0),rgba(249,249,248,0.92)_72%,#f9f9f8_100%)] dark:bg-[linear-gradient(180deg,rgba(14,14,13,0),rgba(14,14,13,0.92)_72%,#0e0e0d_100%)]" />

        <div className="relative z-10 flex min-h-screen flex-col px-4 py-4 md:px-10 md:py-7">
          <MarketingHeader configured={configured} scrolled={false} />

          <div className="flex flex-1 items-start justify-center pt-[16vh] text-center md:pt-[13vh]">
            <div className="w-full max-w-3xl">
              <AnimatedLandingHeadline
                animate={animationReady}
                simplifyMotion={reduceMotion}
                text={"One file for your\nown context"}
                className="t-hero justify-center text-white"
              />

              <motion.div
                initial={false}
                animate={
                  animationReady
                    ? { opacity: 1, scaleX: 1, transformOrigin: "center" }
                    : { opacity: 0, scaleX: 0, transformOrigin: "center" }
                }
                transition={{ delay: 1.55, duration: 0.54, ease: [0.16, 1, 0.3, 1] }}
                className="mx-auto mt-7 h-px w-80 transform-gpu bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.34)_18%,rgba(255,255,255,0.34)_82%,rgba(255,255,255,0))]"
                style={{ willChange: "transform, opacity" }}
              />

              <AnimatedFadeIn
                animate={animationReady}
                delay={1.95}
                simplifyMotion={reduceMotion}
                className="hero-subtext-sheen t-lede-hero mx-auto mt-6 max-w-[21rem] font-medium text-white/90 md:mt-7 md:max-w-2xl"
              >
                Your personal context, written once and kept polished by your agents. Every AI knows
                you instantly.
              </AnimatedFadeIn>

              <AnimatedFadeIn
                animate={animationReady}
                delay={2.18}
                simplifyMotion={reduceMotion}
                className="mt-7 flex justify-center"
              >
                {isPaid ? (
                  <Link
                    href="/file"
                    onMouseEnter={heroArrow.start}
                    onMouseLeave={heroArrow.settle}
                    onPointerDown={(event) => {
                      if (event.pointerType !== "mouse") heroArrow.start();
                    }}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white pl-4 pr-3 text-[14px] font-medium text-[#19345f] transition-colors hover:bg-[#f6f7fb]"
                  >
                    <span className="leading-none">Go to app</span>
                    <ArrowRightIcon
                      ref={heroArrow.iconRef}
                      size={16}
                      className="inline-flex shrink-0 items-center justify-center leading-none"
                    />
                  </Link>
                ) : (
                  <Link
                    href="/pricing"
                    onMouseEnter={heroArrow.start}
                    onMouseLeave={heroArrow.settle}
                    onPointerDown={(event) => {
                      if (event.pointerType !== "mouse") heroArrow.start();
                    }}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white pl-4 pr-3 text-[14px] font-medium text-[#19345f] transition-colors hover:bg-[#f6f7fb]"
                  >
                    <span className="leading-none">Get Started</span>
                    <ArrowRightIcon
                      ref={heroArrow.iconRef}
                      size={16}
                      className="inline-flex shrink-0 items-center justify-center leading-none"
                    />
                  </Link>
                )}
              </AnimatedFadeIn>
            </div>
          </div>
        </div>
      </section>

      <BelowHeroSections configured={configured} />
    </>
  );
}

function AnimatedLandingHeadline({
  animate,
  simplifyMotion,
  text,
  className,
}: {
  animate: boolean;
  simplifyMotion?: boolean;
  text: string;
  className?: string;
}) {
  const lines = useMemo(() => text.split("\n"), [text]);

  if (simplifyMotion) {
    return <h1 className={cn(className)}>{text.split("\n").map((line, index) => <span key={`${line}-${index}`} className="block whitespace-nowrap">{line}</span>)}</h1>;
  }

  return (
    <motion.h1
      initial={false}
      animate={animate ? "visible" : "hidden"}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: 0.042,
          },
        },
      }}
      className={cn("flex flex-wrap transform-gpu", className)}
      style={{ willChange: "transform, opacity" }}
    >
      {lines.map((line, lineIndex) => (
        <span key={`${line}-${lineIndex}`} className="basis-full whitespace-nowrap">
          {splitPreservingLigatures(line).map((glyph, index) => (
            <motion.span
              key={`${glyph}-${lineIndex}-${index}`}
              variants={{
                hidden: { opacity: 0, filter: "blur(10px)", y: 10 },
                visible: { opacity: 1, filter: "blur(0px)", y: 0 },
              }}
              transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
              className="inline-block whitespace-pre"
              style={{ willChange: "transform, opacity, filter" }}
            >
              {glyph === " " ? "\u00A0" : glyph}
            </motion.span>
          ))}
        </span>
      ))}
    </motion.h1>
  );
}

function AnimatedFadeIn({
  animate,
  children,
  className,
  delay,
  simplifyMotion,
}: {
  animate: boolean;
  children: ReactNode;
  className?: string;
  delay: number;
  simplifyMotion?: boolean;
}) {
  if (simplifyMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={false}
      animate={
        animate
          ? { opacity: 1, filter: "blur(0px)", y: 0 }
          : { opacity: 0, filter: "blur(10px)", y: 10 }
      }
      transition={{ delay, duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
      className={className}
      style={{ willChange: "transform, opacity, filter" }}
    >
      {children}
    </motion.div>
  );
}
