"use client";

import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import type { Transition, Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";

import { cn } from "@/lib/utils";

export interface AlignLeftIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface AlignLeftIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const LINE_TRANSITION: Transition = {
  duration: 0.82,
  ease: [0.22, 1, 0.36, 1],
  times: [0, 0.52, 1],
};

const MIDDLE_LINE_VARIANTS: Variants = {
  normal: {
    d: "M15 12H3",
  },
  animate: {
    d: ["M15 12H3", "M21 12H3", "M15 12H3"],
    transition: LINE_TRANSITION,
  },
};

const BOTTOM_LINE_VARIANTS: Variants = {
  normal: {
    d: "M17 19H3",
  },
  animate: {
    d: ["M17 19H3", "M21 19H3", "M17 19H3"],
    transition: {
      ...LINE_TRANSITION,
      delay: 0.06,
    },
  },
};

const AlignLeftIcon = forwardRef<AlignLeftIconHandle, AlignLeftIconProps>(
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
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(event);
        } else {
          controls.start("animate");
        }
      },
      [controls, onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(event);
        } else {
          controls.start("normal");
        }
      },
      [controls, onMouseLeave],
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
          <path d="M21 5H3" />
          <motion.path
            animate={controls}
            d="M15 12H3"
            initial="normal"
            variants={MIDDLE_LINE_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M17 19H3"
            initial="normal"
            variants={BOTTOM_LINE_VARIANTS}
          />
        </svg>
      </div>
    );
  },
);

AlignLeftIcon.displayName = "AlignLeftIcon";

export { AlignLeftIcon };
