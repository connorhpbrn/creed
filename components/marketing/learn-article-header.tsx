"use client";

import { useRef } from "react";
import type { AnimatedIconHandle } from "@/components/creed/animated-icon-controls";
import {
  getLearnArticleIcon,
  type LearnAnimatedIcon,
} from "@/components/marketing/learn-icons";

export function LearnArticleHeader({
  title,
  slug,
  icon: IconProp,
}: {
  title: string;
  slug: string;
  icon?: LearnAnimatedIcon;
}) {
  const Icon = IconProp ?? getLearnArticleIcon(slug);
  // Attaching a ref puts the icon in controlled mode, which disables its
  // built-in hover animation. Cards still drive animation via start/settle.
  const iconRef = useRef<AnimatedIconHandle | null>(null);

  return (
    <header className="border-b border-[var(--creed-border)] pb-8">
      {/*
        Same proportions as LearnArticleCard: 18px icon on 16px type (~1.125em).
        Gap tightened slightly vs the card so the header reads as one unit.
      */}
      <div className="t-section flex items-center gap-[0.4em] text-[var(--creed-text-primary)]">
        <Icon
          ref={iconRef}
          size={64}
          className="pointer-events-none inline-flex h-[1.125em] w-[1.125em] shrink-0 items-center justify-center [&>svg]:h-full! [&>svg]:w-full!"
        />
        <h1 className="min-w-0 text-[1em] leading-[inherit] tracking-[inherit]">
          {title}
        </h1>
      </div>
    </header>
  );
}
