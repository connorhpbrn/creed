"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface GripVerticalIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface GripVerticalIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const DOT_VARIANTS: Variants = {
  normal: { y: 0, scale: 1 },
  animate: (direction: number) => ({
    y: direction * 1.25,
    scale: 1.06,
  }),
};

const TRANSITION = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1] as const,
};

const GripVerticalIcon = forwardRef<GripVerticalIconHandle, GripVerticalIconProps>(
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

    const topDots = [5, 12, 19];
    const bottomDots = [5, 12, 19];

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
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          {topDots.map((cy) => (
            <motion.circle
              key={`left-${cy}`}
              animate={controls}
              custom={-1}
              cx="9"
              cy={cy}
              fill="currentColor"
              r="1.6"
              transition={TRANSITION}
              variants={DOT_VARIANTS}
            />
          ))}
          {bottomDots.map((cy) => (
            <motion.circle
              key={`right-${cy}`}
              animate={controls}
              custom={1}
              cx="15"
              cy={cy}
              fill="currentColor"
              r="1.6"
              transition={TRANSITION}
              variants={DOT_VARIANTS}
            />
          ))}
        </svg>
      </div>
    );
  }
);

GripVerticalIcon.displayName = "GripVerticalIcon";

export { GripVerticalIcon };
