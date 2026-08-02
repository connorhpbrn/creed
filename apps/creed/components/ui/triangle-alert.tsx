"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface TriangleAlertIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface TriangleAlertIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

// The exclamation mark blinks twice while the triangle stays still.
const MARK_VARIANTS: Variants = {
  normal: { opacity: 1 },
  animate: {
    opacity: [1, 0.2, 1, 0.2, 1],
    transition: {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      times: [0, 0.25, 0.5, 0.75, 1],
    },
  },
};

const TriangleAlertIcon = forwardRef<
  TriangleAlertIconHandle,
  TriangleAlertIconProps
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
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 20h16a2 2 0 0 0 1.73-2Z" />
        <motion.g animate={controls} initial="normal" variants={MARK_VARIANTS}>
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </motion.g>
      </svg>
    </div>
  );
});

TriangleAlertIcon.displayName = "TriangleAlertIcon";

export { TriangleAlertIcon };
