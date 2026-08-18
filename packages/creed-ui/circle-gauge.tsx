"use client";

// Animated circle gauge from lucide-animated.com. The imperative handle lets
// the surrounding menu row drive the animation across its full hover target.
import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@creed/ui/utils";

export interface CircleGaugeIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface CircleGaugeIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const VARIANTS: Variants = {
  normal: { rotate: 0 },
  animate: {
    rotate: [0, 72, 0],
    transition: {
      duration: 0.62,
      ease: [0.22, 1, 0.36, 1],
      times: [0, 0.55, 1],
    },
  },
};

const CircleGaugeIcon = forwardRef<CircleGaugeIconHandle, CircleGaugeIconProps>(
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
          void controls.start("animate");
        }
      },
      [controls, onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(event);
        } else {
          void controls.start("normal");
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
        <motion.svg
          animate={controls}
          fill="none"
          height={size}
          initial="normal"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          variants={VARIANTS}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M15.6 2.7a10 10 0 1 0 5.7 5.7" />
          <circle cx="12" cy="12" r="2" />
          <path d="M13.4 10.6 19 5" />
        </motion.svg>
      </div>
    );
  },
);

CircleGaugeIcon.displayName = "CircleGaugeIcon";

export { CircleGaugeIcon };
