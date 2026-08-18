"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// useLayoutEffect warns when rendered on the server, which these menus are.
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

// Minimum believable panel height. A measurement below this means the account
// button was not found or the menu is in a state we cannot trust, so it is
// discarded rather than applied.
const MIN_HEIGHT = 120;

/**
 * Sizes a submenu panel so its bottom edge lands on the bottom of the account
 * button that opened the menu, which is what makes the panel read as a sheet
 * hanging off its row rather than floating at an arbitrary height.
 *
 * Attach `triggerRef` to the submenu's trigger row. It both locates the account
 * button (Radix labels the menu with its trigger's id) and anchors the
 * measurement.
 *
 * The height is deliberately measured from the trigger row rather than from the
 * panel itself. Measuring the panel would be a few pixels more exact, but the
 * panel's own top moves once a height is applied , Radix shifts it up to keep it
 * on screen , so each measurement would feed the next and the panel would drift
 * every time it opened. Anchoring to the row keeps every panel stable and gives
 * them all the same offset, so their bottom edges line up with each other.
 */
export function useAccountAlignedPanel<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  enabled = true
) {
  const triggerRef = useRef<T>(null);
  const [height, setHeight] = useState<number | null>(null);

  useIsoLayoutEffect(() => {
    if (!open || !enabled) {
      setHeight(null);
      return;
    }
    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const trigger = triggerRef.current;
      const menu = trigger?.closest<HTMLElement>("[role='menu']");
      const labelledBy = menu?.getAttribute("aria-labelledby");
      const account = labelledBy ? document.getElementById(labelledBy) : null;
      if (!trigger || !account) return;

      const next =
        account.getBoundingClientRect().bottom -
        trigger.getBoundingClientRect().top;
      if (next >= MIN_HEIGHT) setHeight(next);
    };

    // Measure now, in a layout effect, so the panel's first paint is already the
    // right size. Waiting a fixed delay instead made the panel visibly resize a
    // moment after opening.
    measure();

    // The one case the immediate measurement gets wrong: the parent menu is
    // still animating open, so its rows are still scaled down and the distance
    // reads short. That only happens if a row is triggered within the menu's own
    // open animation. Re-measure once those animations finish rather than
    // delaying every open on their behalf.
    const menu = triggerRef.current?.closest<HTMLElement>("[role='menu']");
    const running = menu?.getAnimations?.({ subtree: true }) ?? [];
    if (running.length > 0) {
      void Promise.all(
        running.map((animation) => animation.finished.catch(() => undefined))
      ).then(measure);
    }

    window.addEventListener("resize", measure);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", measure);
    };
  }, [open, enabled]);

  return { triggerRef, height };
}
