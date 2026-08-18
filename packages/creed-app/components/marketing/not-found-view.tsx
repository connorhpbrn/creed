"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@creed/ui/arrow-right";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { SceneryImage } from "@/components/marketing/scenery-image";

export function NotFoundView() {
  const arrow = useAnimatedIconControls(80, undefined, 420);

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#0e0e0d] px-6 py-16 text-center">
      <SceneryImage
        src="/assets/landing/scenery/garden.png"
        fileName="garden.png"
        label="Garden"
        priority
      />
      <div className="relative z-10 flex flex-col items-center text-white">
        <h1 className="text-[clamp(5rem,15vw,11rem)] font-medium leading-[0.82] tracking-[-0.07em]">
          404
        </h1>
        <p className="mt-7 text-[16px] font-medium tracking-[-0.015em] text-white md:text-[18px]">
          You&apos;re lost, go home
        </p>
        <Link
          href="/home"
          onMouseEnter={arrow.start}
          onMouseLeave={arrow.settle}
          onPointerDown={(event) => {
            if (event.pointerType !== "mouse") arrow.start();
          }}
          className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white pl-4 pr-3 text-[14px] font-medium text-[#19345f] transition-colors hover:bg-[#f6f7fb]"
        >
          <span className="leading-none">Return back home</span>
          <ArrowRightIcon
            ref={arrow.iconRef}
            size={16}
            className="inline-flex shrink-0 items-center justify-center leading-none"
          />
        </Link>
      </div>
    </main>
  );
}
