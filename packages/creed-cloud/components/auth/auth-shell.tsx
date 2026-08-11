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

const panelImage = "/assets/landing/scenery/garden.png";

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
            <a href={CONTACT_MAILTO} className="transition-colors hover:text-[var(--creed-accent)]">
              Contact
            </a>
            <Link href="/docs" className="transition-colors hover:text-[var(--creed-accent)]">
              Docs
            </Link>
          </div>
        </div>
      </div>

      <div className="relative hidden overflow-hidden rounded-[28px] md:my-4 md:mr-4 md:block md:flex-1">
        <SceneryImage
          src={panelImage}
          fileName="garden.png"
          label="Garden"
          sizes="(min-width: 768px) 50vw, 100vw"
          priority
          hint="portrait"
        />
      </div>
    </div>
  );
}
