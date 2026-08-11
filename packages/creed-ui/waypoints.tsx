"use client";

import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import type { Transition, Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";

import { cn } from "@creed/ui/utils";

export interface WaypointsIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface WaypointsIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const PATH_TRANSITION: Transition = {
  duration: 0.62,
  ease: [0.22, 1, 0.36, 1],
  times: [0, 0.28, 1],
};

const PATH_VARIANTS: Variants = {
  normal: {
    pathLength: 1,
  },
  animate: {
    pathLength: [1, 0.68, 1],
  },
};

const DOT_TRANSITION: Transition = {
  duration: 0.64,
  ease: [0.22, 1, 0.36, 1],
};

const DOT_VARIANTS: Variants = {
  normal: {
    scale: 1,
  },
  animate: (index: number) => ({
    scale: [1, 1.24, 1],
    transition: {
      ...DOT_TRANSITION,
      delay: index * 0.045,
    },
  }),
};

const WaypointsIcon = forwardRef<WaypointsIconHandle, WaypointsIconProps>(
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
          <motion.path
            animate={controls}
            d="m10.586 5.414-5.172 5.172"
            initial="normal"
            transition={PATH_TRANSITION}
            variants={PATH_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="m18.586 13.414-5.172 5.172"
            initial="normal"
            transition={PATH_TRANSITION}
            variants={PATH_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M6 12h12"
            initial="normal"
            transition={PATH_TRANSITION}
            variants={PATH_VARIANTS}
          />
          {[
            { cx: 12, cy: 20 },
            { cx: 12, cy: 4 },
            { cx: 20, cy: 12 },
            { cx: 4, cy: 12 },
          ].map((dot, index) => (
            <motion.circle
              key={`${dot.cx}-${dot.cy}`}
              animate={controls}
              custom={index}
              cx={dot.cx}
              cy={dot.cy}
              initial="normal"
              r="2"
              variants={DOT_VARIANTS}
            />
          ))}
        </svg>
      </div>
    );
  },
);

WaypointsIcon.displayName = "WaypointsIcon";

export { WaypointsIcon };
