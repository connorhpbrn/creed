"use client";

import { motion } from "motion/react";

export function AnimatedCheckmark({
  className = "h-3.5 w-3.5",
  size = 14,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <div className={className}>
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
          d="M4 12 9 17L20 6"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            pathLength: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
            opacity: { duration: 0.12 },
          }}
        />
      </svg>
    </div>
  );
}
