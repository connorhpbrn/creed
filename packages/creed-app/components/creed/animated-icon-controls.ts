"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

export type AnimatedIconHandle = {
  startAnimation: () => void;
  stopAnimation: () => void;
};

const persistedAnimationWindows = new Map<string, number>();

export function useAnimatedIconControls(
  hoverDelay = 120,
  persistKey?: string,
  animationDuration = 1600
) {
  const iconRef = useRef<AnimatedIconHandle | null>(null);
  const hoverIntentTimeoutRef = useRef<number | null>(null);
  const animationTimeoutRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);
  // Initial state is calculated once per `persistKey` change. We read
  // `Date.now()` inside the memo (impure by React's lint, but the value
  // is only consumed by the first render and the truth source -
  // `persistedAnimationWindows` - is module-scoped state, not a render
  // input). The mount effect below re-validates the window when the
  // component actually subscribes, so any drift between memo eval and
  // mount is corrected without a visible flicker.
  const initialState = useMemo<"normal" | "animate">(() => {
    if (!persistKey) {
      return "normal";
    }

    const expiresAt = persistedAnimationWindows.get(persistKey);
    // eslint-disable-next-line react-hooks/purity
    return expiresAt && expiresAt > Date.now() ? "animate" : "normal";
  }, [persistKey]);

  const clearHoverIntentTimeout = useCallback(() => {
    if (hoverIntentTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(hoverIntentTimeoutRef.current);
    hoverIntentTimeoutRef.current = null;
  }, []);

  const clearAnimationTimeout = useCallback(() => {
    if (animationTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(animationTimeoutRef.current);
    animationTimeoutRef.current = null;
  }, []);

  const play = useCallback(
    (duration = animationDuration) => {
      if (isAnimatingRef.current) {
        return;
      }

      clearHoverIntentTimeout();
      clearAnimationTimeout();
      isAnimatingRef.current = true;

      if (persistKey && duration > 0) {
        persistedAnimationWindows.set(persistKey, Date.now() + duration);
      }

      iconRef.current?.startAnimation();
      animationTimeoutRef.current = window.setTimeout(() => {
        iconRef.current?.stopAnimation();
        isAnimatingRef.current = false;
        if (persistKey) {
          persistedAnimationWindows.delete(persistKey);
        }
        animationTimeoutRef.current = null;
      }, duration);
    },
    [animationDuration, clearAnimationTimeout, clearHoverIntentTimeout, persistKey]
  );

  const start = useCallback(() => {
    clearHoverIntentTimeout();
    if (isAnimatingRef.current) {
      return;
    }

    hoverIntentTimeoutRef.current = window.setTimeout(() => {
      hoverIntentTimeoutRef.current = null;
      play();
    }, hoverDelay);
  }, [clearHoverIntentTimeout, hoverDelay, play]);

  const settle = useCallback(() => {
    clearHoverIntentTimeout();
  }, [clearHoverIntentTimeout]);

  useEffect(() => {
    if (!persistKey) {
      return () => {
        clearHoverIntentTimeout();
        clearAnimationTimeout();
      };
    }

    const expiresAt = persistedAnimationWindows.get(persistKey);
    if (expiresAt) {
      const remaining = expiresAt - Date.now();
      if (remaining > 0) {
        play(remaining);
      } else {
        persistedAnimationWindows.delete(persistKey);
        window.requestAnimationFrame(() => {
          iconRef.current?.stopAnimation();
        });
      }
    }

    return () => {
      clearHoverIntentTimeout();
      clearAnimationTimeout();
    };
  }, [clearAnimationTimeout, clearHoverIntentTimeout, persistKey, play]);

  return { iconRef, start, settle, initialState };
}
