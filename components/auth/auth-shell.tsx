"use client";

// Shared split-screen chrome for the auth surface: the branded left column
// (wordmark, optional top-right link, centred content, footer) and the framed
// image panel on the right. /login, /signup and /reset-password all render
// inside it so they stay visually identical.

import Link from "next/link";
import type { ReactNode } from "react";
import { SceneryImage } from "@/components/marketing/scenery-image";
import { CreedWordmark } from "@/components/creed/brand";
import { CONTACT_MAILTO } from "@/lib/branding";

const lightPanelImage = "/assets/landing/scenery/light-auth.png";
const darkPanelImage = "/assets/landing/scenery/dark-auth.png";

export function AuthShell({ topRight, children }: { topRight?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <div className="flex w-full flex-col px-6 py-6 md:w-1/2 md:px-12 md:py-8 lg:px-20">
        <div className="flex items-center justify-between">
          <Link
            href="/home"
            aria-label="Creed home"
            className="-ml-1 inline-flex shrink-0 items-center transition-opacity duration-200 hover:opacity-60"
          >
            <CreedWordmark className="ml-0" />
          </Link>
          {topRight ? <div>{topRight}</div> : null}
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[380px]">{children}</div>
        </div>

        <div className="flex items-center justify-between text-[13px] text-[var(--creed-text-tertiary)]">
          <span>© 2026 Creed</span>
          <div className="flex items-center gap-5">
            <a href={CONTACT_MAILTO} className="transition-colors hover:text-[#2563EB]">
              Contact
            </a>
            <Link href="/docs" className="transition-colors hover:text-[#2563EB]">
              Docs
            </Link>
          </div>
        </div>
      </div>

      {/* Image panel (hidden on mobile). No framed card - the page background
          fades over the inner edge so the art blends into the form column. */}
      <div className="relative hidden w-1/2 md:block">
        <SceneryImage
          src={lightPanelImage}
          fileName="light-auth.png"
          label="Light auth"
          priority
          className="dark:hidden"
        />
        <SceneryImage
          src={darkPanelImage}
          fileName="dark-auth.png"
          label="Dark auth"
          hint="portrait"
          className="hidden dark:block"
        />
        {/* Smooth, eased fade from the page bg on the inner (left) edge into
            the image so it melts in rather than cutting off. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: "var(--scenery-fade-in-x)" }}
        />
      </div>
    </div>
  );
}
