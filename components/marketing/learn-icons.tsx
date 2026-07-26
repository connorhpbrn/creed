"use client";

import type { ComponentType, Ref } from "react";
import type { AnimatedIconHandle } from "@/components/creed/animated-icon-controls";
import { ConnectIcon } from "@/components/ui/connect";
import { FileTextIcon } from "@/components/ui/file-text";
import { GitCompareArrowsIcon } from "@/components/ui/git-compare-arrows";
import { RefreshCwIcon } from "@/components/ui/refresh-cw";

export type LearnAnimatedIcon = ComponentType<{
  ref?: Ref<AnimatedIconHandle>;
  size?: number;
  className?: string;
  initialState?: "normal" | "animate";
}>;

export const LEARN_ARTICLE_ICONS: Record<string, LearnAnimatedIcon> = {
  "personal-context-file": FileTextIcon,
  "re-explaining-tax": RefreshCwIcon,
  "memory-vs-context-file": GitCompareArrowsIcon,
  "connect-your-tools": ConnectIcon,
};

export function getLearnArticleIcon(slug: string): LearnAnimatedIcon {
  return LEARN_ARTICLE_ICONS[slug] ?? FileTextIcon;
}
