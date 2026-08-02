"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useEffect, useImperativeHandle } from "react";

import { cn } from "@/lib/utils";

export interface MenuIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface MenuIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  // When provided, the icon tracks this state declaratively: true morphs the
  // hamburger into an X, false morphs it back. Survives every close path
  // (tap-outside, scroll, link click), not just the trigger click.
  open?: boolean;
}

// The lucide-animated "menu" icon, verbatim: the top and bottom bars rotate
// to cross and the middle bar fades, morphing into an X. No custom
// transform-origin - motion auto-applies fill-box/center for SVG transforms,
// which is what makes the X land perfectly centered. Mobile-first: no hover.
const LINE_VARIANTS: Variants = {
  normal: {
    rotate: 0,
    y: 0,
    opacity: 1,
  },
  animate: (custom: number) => ({
    rotate: custom === 1 ? 45 : custom === 3 ? -45 : 0,
    y: custom === 1 ? 6 : custom === 3 ? -6 : 0,
    opacity: custom === 2 ? 0 : 1,
    transition: {
      type: "spring",
      stiffness: 260,
      damping: 20,
    },
  }),
};

const MenuIcon = forwardRef<MenuIconHandle, MenuIconProps>(
  ({ className, size = 28, open, ...props }, ref) => {
    const controls = useAnimation();

    useImperativeHandle(ref, () => ({
      startAnimation: () => controls.start("animate"),
      stopAnimation: () => controls.start("normal"),
    }));

    useEffect(() => {
      if (open === undefined) return;
      void controls.start(open ? "animate" : "normal");
    }, [open, controls]);

    return (
      <div className={cn("inline-flex", className)} {...props}>
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.line animate={controls} custom={1} variants={LINE_VARIANTS} x1="4" x2="20" y1="6" y2="6" />
          <motion.line animate={controls} custom={2} variants={LINE_VARIANTS} x1="4" x2="20" y1="12" y2="12" />
          <motion.line animate={controls} custom={3} variants={LINE_VARIANTS} x1="4" x2="20" y1="18" y2="18" />
        </svg>
      </div>
    );
  }
);

MenuIcon.displayName = "MenuIcon";

export { MenuIcon };
