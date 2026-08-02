"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface DatabaseIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface DatabaseIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

// The top disc lifts slightly while the middle ring dips, like the
// stack breathing apart and settling back together.
const TOP_VARIANTS: Variants = {
  normal: { y: 0 },
  animate: {
    y: [0, -1.2, 0],
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
      times: [0, 0.4, 1],
    },
  },
};

const MIDDLE_VARIANTS: Variants = {
  normal: { y: 0 },
  animate: {
    y: [0, 1, 0],
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
      times: [0, 0.4, 1],
      delay: 0.08,
    },
  },
};

const DatabaseIcon = forwardRef<DatabaseIconHandle, DatabaseIconProps>(
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
          <motion.ellipse
            animate={controls}
            variants={TOP_VARIANTS}
            cx="12"
            cy="5"
            rx="9"
            ry="3"
          />
          <path d="M3 5V19A9 3 0 0 0 21 19V5" />
          <motion.path
            animate={controls}
            variants={MIDDLE_VARIANTS}
            d="M3 12A9 3 0 0 0 21 12"
          />
        </svg>
      </div>
    );
  }
);

DatabaseIcon.displayName = "DatabaseIcon";

export { DatabaseIcon };
