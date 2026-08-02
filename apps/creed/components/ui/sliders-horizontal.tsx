"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface SlidersHorizontalIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface SlidersHorizontalIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

// Each knob nudges along its track and settles back, like adjusting mixer sliders.
const knobVariants = (offset: number, delay: number): Variants => ({
  normal: { x: 0 },
  animate: {
    x: [0, offset, 0],
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      times: [0, 0.4, 1],
      delay,
    },
  },
});

const KNOB_1_VARIANTS = knobVariants(-3, 0);
const KNOB_2_VARIANTS = knobVariants(3, 0.05);
const KNOB_3_VARIANTS = knobVariants(-4, 0.1);

const SlidersHorizontalIcon = forwardRef<
  SlidersHorizontalIconHandle,
  SlidersHorizontalIconProps
>(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
  const controls = useAnimation();
  const isControlledRef = useRef(false);

  useImperativeHandle(ref, () => {
    isControlledRef.current = true;

    return {
      startAnimation: () => controls.start("animate"),
      stopAnimation: () => controls.start("normal"),
    };
  });

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) {
        onMouseEnter?.(e);
      } else {
        controls.start("animate");
      }
    },
    [controls, onMouseEnter]
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) {
        onMouseLeave?.(e);
      } else {
        controls.start("normal");
      }
    },
    [controls, onMouseLeave]
  );

  return (
    <div
      className={cn(className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
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
        <line x1="21" x2="14" y1="4" y2="4" />
        <line x1="10" x2="3" y1="4" y2="4" />
        <motion.line
          animate={controls}
          initial="normal"
          variants={KNOB_1_VARIANTS}
          x1="14"
          x2="14"
          y1="2"
          y2="6"
        />
        <line x1="21" x2="12" y1="12" y2="12" />
        <line x1="8" x2="3" y1="12" y2="12" />
        <motion.line
          animate={controls}
          initial="normal"
          variants={KNOB_2_VARIANTS}
          x1="8"
          x2="8"
          y1="10"
          y2="14"
        />
        <line x1="21" x2="16" y1="20" y2="20" />
        <line x1="12" x2="3" y1="20" y2="20" />
        <motion.line
          animate={controls}
          initial="normal"
          variants={KNOB_3_VARIANTS}
          x1="16"
          x2="16"
          y1="18"
          y2="22"
        />
      </svg>
    </div>
  );
});

SlidersHorizontalIcon.displayName = "SlidersHorizontalIcon";

export { SlidersHorizontalIcon };
