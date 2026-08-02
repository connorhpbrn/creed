"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { ArrowRightIcon } from "@/components/ui/arrow-right";

// Small client island for the success page's "Continue" CTA - the rest of
// the page stays a server component (it does Stripe + Supabase work in
// `resolveState`). Animated arrow mirrors the chrome's "Owned" pill so the
// motion language is consistent across the marketing surface. When the
// entitlement is confirmed we auto-advance into the app after a short beat so
// payment feels like a clean redirect; if it isn't confirmed yet (upsert hiccup
// while the webhook catches up) we do NOT auto-advance, so a just-paid user is
// never bounced to the paywall - they click Continue when ready.
export function ContinueButton({
  href,
  autoAdvance = false,
}: {
  href: string;
  autoAdvance?: boolean;
}) {
  const router = useRouter();
  const arrow = useAnimatedIconControls(80, undefined, 420);

  useEffect(() => {
    if (!autoAdvance) return;
    const timer = window.setTimeout(() => router.replace(href), 1100);
    return () => window.clearTimeout(timer);
  }, [autoAdvance, router, href]);

  return (
    <Link
      href={href}
      onMouseEnter={arrow.start}
      onMouseLeave={arrow.settle}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse") {
          arrow.start();
        }
      }}
      className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--creed-accent)] pl-6 pr-5 text-[14px] font-medium text-white transition-colors hover:bg-[var(--creed-accent-hover)]"
    >
      <span className="leading-none">Continue</span>
      <ArrowRightIcon
        ref={arrow.iconRef}
        size={18}
        className="inline-flex shrink-0 items-center justify-center leading-none"
      />
    </Link>
  );
}
