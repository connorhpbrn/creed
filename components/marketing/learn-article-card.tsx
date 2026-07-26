"use client";

import Link from "next/link";
import { useRef } from "react";
import type { AnimatedIconHandle } from "@/components/creed/animated-icon-controls";
import type { LearnAnimatedIcon } from "@/components/marketing/learn-icons";

export function LearnArticleCard({
  href,
  title,
  description,
  icon: Icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: LearnAnimatedIcon;
}) {
  const iconRef = useRef<AnimatedIconHandle | null>(null);

  return (
    <Link
      href={href}
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
      className="flex h-full flex-col rounded-xl bg-[var(--creed-surface)] p-5 transition-colors hover:bg-[var(--creed-surface-raised)]"
    >
      <span className="flex items-center gap-2.5">
        <Icon
          ref={iconRef}
          size={18}
          className="pointer-events-none inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center text-[var(--creed-text-primary)]"
        />
        <span className="text-[16px] font-medium leading-6 text-[var(--creed-text-primary)]">
          {title}
        </span>
      </span>
      <span className="mt-2 text-[14px] leading-6 text-[var(--creed-text-secondary)]">
        {description}
      </span>
    </Link>
  );
}
