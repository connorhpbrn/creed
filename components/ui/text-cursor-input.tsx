"use client";

// Animated text-cursor-input icon in the lucide-animated.com style (that
// registry does not ship this one, so this matches its forwardRef +
// startAnimation pattern by hand). The centre caret blinks like a typing cursor.
import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface TextCursorInputIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface TextCursorInputIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const CARET_VARIANTS: Variants = {
  normal: { opacity: 1 },
  animate: {
    opacity: [1, 0.15, 1, 0.15, 1],
    transition: { duration: 0.9, ease: "linear" },
  },
};

const TextCursorInputIcon = forwardRef<
  TextCursorInputIconHandle,
  TextCursorInputIconProps
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
        <path d="M5 4h1a3 3 0 0 1 3 3 3 3 0 0 1 3-3h1" />
        <path d="M13 20h-1a3 3 0 0 1-3-3 3 3 0 0 1-3 3H5" />
        <path d="M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1" />
        <path d="M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7" />
        <motion.path
          animate={controls}
          d="M9 7v10"
          initial="normal"
          variants={CARET_VARIANTS}
        />
      </svg>
    </div>
  );
});

TextCursorInputIcon.displayName = "TextCursorInputIcon";

export { TextCursorInputIcon };
