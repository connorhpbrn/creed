"use client";

import Link from "next/link";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { ArrowRightIcon } from "@/components/ui/arrow-right";

// Small client island for the success page's "Continue" CTA — the rest of
// the page stays a server component (it does Stripe + Supabase work in
// `resolveState`). Animated arrow mirrors the chrome's "Owned" pill so the
// motion language is consistent across the marketing surface.
export function ContinueButton({ href }: { href: string }) {
  const arrow = useAnimatedIconControls(80, undefined, 420);

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
      className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#2563EB] pl-6 pr-5 text-[14px] font-medium text-white transition-colors hover:bg-[#1D4ED8]"
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
