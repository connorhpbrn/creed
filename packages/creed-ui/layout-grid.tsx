"use client";

// Animated layout grid from lucide-animated.com. The imperative handle lets
// the surrounding menu row drive the animation across its full hover target.
import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@creed/ui/utils";

export interface LayoutGridIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface LayoutGridIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const RECT_1_VARIANTS: Variants = {
  normal: { translateX: 0, translateY: 0 },
  animate: {
    translateX: [0, 11, 11, 0],
    translateY: [0, 0, 0, 0],
    transition: {
      duration: 0.8,
      ease: "easeInOut",
      times: [0, 0.4, 0.6, 1],
    },
  },
};

const RECT_2_VARIANTS: Variants = {
  normal: { translateX: 0, translateY: 0 },
  animate: {
    translateX: [0, 0, 0, 0],
    translateY: [0, 11, 11, 0],
    transition: {
      duration: 0.8,
      ease: "easeInOut",
      times: [0, 0.4, 0.6, 1],
    },
  },
};

const RECT_3_VARIANTS: Variants = {
  normal: { translateX: 0, translateY: 0 },
  animate: {
    translateX: [0, -11, -11, 0],
    translateY: [0, 0, 0, 0],
    transition: {
      duration: 0.8,
      ease: "easeInOut",
      times: [0, 0.4, 0.6, 1],
    },
  },
};

const RECT_4_VARIANTS: Variants = {
  normal: { translateX: 0, translateY: 0 },
  animate: {
    translateX: [0, 0, 0, 0],
    translateY: [0, -11, -11, 0],
    transition: {
      duration: 0.8,
      ease: "easeInOut",
      times: [0, 0.4, 0.6, 1],
    },
  },
};

const RECTANGLES = [
  { x: 3, y: 3, variants: RECT_1_VARIANTS },
  { x: 14, y: 3, variants: RECT_2_VARIANTS },
  { x: 14, y: 14, variants: RECT_3_VARIANTS },
  { x: 3, y: 14, variants: RECT_4_VARIANTS },
] as const;

const LayoutGridIcon = forwardRef<LayoutGridIconHandle, LayoutGridIconProps>(
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
          {RECTANGLES.map((rectangle) => (
            <motion.rect
              key={`${rectangle.x}-${rectangle.y}`}
              animate={controls}
              height="7"
              initial="normal"
              rx="1"
              variants={rectangle.variants}
              width="7"
              x={rectangle.x}
              y={rectangle.y}
            />
          ))}
        </svg>
      </div>
    );
  },
);

LayoutGridIcon.displayName = "LayoutGridIcon";

export { LayoutGridIcon };
