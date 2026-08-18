"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@creed/ui/utils";

/**
 * "Locked" and "Unlocked" are different widths, so toggling the header lock
 * used to jolt every button beside it. Both labels render stacked in one grid
 * cell, get measured once, and the wrapper animates between the two widths -
 * so the neighbouring pills glide instead of snapping.
 */
export function LockLabel({
  locked,
  className,
}: {
  locked: boolean;
  className?: string;
}) {
  const lockedRef = useRef<HTMLSpanElement | null>(null);
  const unlockedRef = useRef<HTMLSpanElement | null>(null);
  const [widths, setWidths] = useState<{
    locked: number;
    unlocked: number;
  } | null>(null);

  useEffect(() => {
    const lockedEl = lockedRef.current;
    const unlockedEl = unlockedRef.current;
    if (!lockedEl || !unlockedEl) {
      return;
    }

    const measure = () => {
      const next = {
        locked: lockedEl.getBoundingClientRect().width,
        unlocked: unlockedEl.getBoundingClientRect().width,
      };
      setWidths((current) =>
        current &&
        Math.abs(current.locked - next.locked) < 0.5 &&
        Math.abs(current.unlocked - next.unlocked) < 0.5
          ? current
          : next,
      );
    };

    measure();

    // Re-measure when the font finishes loading or the responsive text size
    // changes; both alter the label widths.
    const observer = new ResizeObserver(measure);
    observer.observe(lockedEl);
    observer.observe(unlockedEl);
    return () => observer.disconnect();
  }, []);

  const labelClassName =
    "col-start-1 row-start-1 w-fit justify-self-start whitespace-nowrap transition-opacity duration-200 ease-out motion-reduce:transition-none";

  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          // `min-w-0` matters: as a flex item the wrapper's automatic
          // min-width is its content size, which would pin it to the wider
          // "Unlocked" label and defeat the width animation.
          "grid min-w-0 shrink-0 grid-cols-1 grid-rows-1 overflow-hidden",
          widths &&
            "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          className,
        )}
        style={{
          width: widths ? (locked ? widths.locked : widths.unlocked) : undefined,
        }}
      >
        <span
          ref={lockedRef}
          className={cn(labelClassName, locked ? "opacity-100" : "opacity-0")}
        >
          Locked
        </span>
        <span
          ref={unlockedRef}
          className={cn(labelClassName, locked ? "opacity-0" : "opacity-100")}
        >
          Unlocked
        </span>
      </span>
      <span className="sr-only">{locked ? "Locked" : "Unlocked"}</span>
    </>
  );
}
