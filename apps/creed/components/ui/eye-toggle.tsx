"use client";

// Password visibility toggle icon. Shakes on hover (controlled via the usual
// AnimatedIconHandle pattern) and, as the `off` prop flips, cross-fades the
// open eye to the eye-off glyph while its diagonal strike draws in / out - so
// toggling show/hide animates rather than swapping two static glyphs.

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes, MouseEvent } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface EyeToggleIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface EyeToggleIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  // True when the password is currently visible (eye-off glyph + strike shown).
  off?: boolean;
}

const SHAKE_VARIANTS: Variants = {
  normal: { rotate: 0 },
  animate: {
    rotate: [0, -10, 10, -7, 7, 0],
    transition: { duration: 0.5, ease: "easeInOut" },
  },
};

const FADE = { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };

const EyeToggleIcon = forwardRef<EyeToggleIconHandle, EyeToggleIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, off = false, ...props }, ref) => {
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
      (e: MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else {
          controls.start("animate");
        }
      },
      [controls, onMouseEnter]
    );

    const handleMouseLeave = useCallback(
      (e: MouseEvent<HTMLDivElement>) => {
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
          width={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.g
            animate={controls}
            variants={SHAKE_VARIANTS}
            style={{ transformOrigin: "center", transformBox: "fill-box" }}
          >
            {/* Open eye - shown when the password is hidden. */}
            <motion.g initial={false} animate={{ opacity: off ? 0 : 1 }} transition={FADE}>
              <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
              <circle cx="12" cy="12" r="3" />
            </motion.g>

            {/* Eye-off glyph - shown when the password is visible. */}
            <motion.g initial={false} animate={{ opacity: off ? 1 : 0 }} transition={FADE}>
              <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
              <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
              <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
            </motion.g>

            {/* Diagonal strike - draws in / retracts on toggle. */}
            <motion.path
              d="m2 2 20 20"
              initial={false}
              animate={{ pathLength: off ? 1 : 0, opacity: off ? 1 : 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            />
          </motion.g>
        </svg>
      </div>
    );
  }
);

EyeToggleIcon.displayName = "EyeToggleIcon";

export { EyeToggleIcon };
