"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface ChartColumnIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ChartColumnIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

// Each bar redraws from the baseline upward, staggered left to right.
const BAR_VARIANTS: Variants = {
  normal: { pathLength: 1 },
  animate: (delay: number) => ({
    pathLength: [0, 1],
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1], delay },
  }),
};

const ChartColumnIcon = forwardRef<ChartColumnIconHandle, ChartColumnIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
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
          <path d="M3 3v16a2 2 0 0 0 2 2h16" />
          <motion.path
            animate={controls}
            custom={0}
            d="M8 17v-3"
            initial="normal"
            variants={BAR_VARIANTS}
          />
          <motion.path
            animate={controls}
            custom={0.08}
            d="M13 17V9"
            initial="normal"
            variants={BAR_VARIANTS}
          />
          <motion.path
            animate={controls}
            custom={0.16}
            d="M18 17V5"
            initial="normal"
            variants={BAR_VARIANTS}
          />
        </svg>
      </div>
    );
  }
);

ChartColumnIcon.displayName = "ChartColumnIcon";

export { ChartColumnIcon };
