"use client";

import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";

export interface LogOutIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface LogOutIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const LogOutIcon = forwardRef<LogOutIconHandle, LogOutIconProps>(
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
      [controls, onMouseEnter]
    );

    const handleMouseLeave = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(event);
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
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <motion.path
            animate={controls}
            d="M16 17l5-5-5-5"
            variants={{
              normal: { x: 0 },
              animate: {
                x: 1.8,
                transition: { type: "spring", stiffness: 280, damping: 22 },
              },
            }}
          />
          <motion.path
            animate={controls}
            d="M21 12H9"
            variants={{
              normal: { x: 0 },
              animate: {
                x: 1.8,
                transition: { type: "spring", stiffness: 280, damping: 22 },
              },
            }}
          />
        </svg>
      </div>
    );
  }
);

LogOutIcon.displayName = "LogOutIcon";

export { LogOutIcon };
