"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface GitBranchIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface GitBranchIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

// The connecting arc redraws itself toward the branch tip.
const PATH_VARIANTS: Variants = {
  normal: { pathLength: 1 },
  animate: {
    pathLength: [0, 1],
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

// The branch-tip node pops once the arc arrives.
const TIP_VARIANTS: Variants = {
  normal: { scale: 1 },
  animate: {
    scale: [1, 0.6, 1.15, 1],
    transition: {
      duration: 0.45,
      delay: 0.25,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

const GitBranchIcon = forwardRef<GitBranchIconHandle, GitBranchIconProps>(
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
          <line x1="6" x2="6" y1="3" y2="15" />
          <motion.circle
            animate={controls}
            variants={TIP_VARIANTS}
            cx="18"
            cy="6"
            r="3"
            style={{ transformOrigin: "center", transformBox: "fill-box" }}
          />
          <circle cx="6" cy="18" r="3" />
          <motion.path
            animate={controls}
            variants={PATH_VARIANTS}
            d="M18 9a9 9 0 0 1-9 9"
          />
        </svg>
      </div>
    );
  }
);

GitBranchIcon.displayName = "GitBranchIcon";

export { GitBranchIcon };
