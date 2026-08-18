"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";
type Origin = { x: number; y: number };

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: (origin?: Origin) => void;
} | null>(null);

const KEY = "creed:theme";
const SWITCHING_CLASS = "creed-theme-switching";

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

function guardThemeSwitchTransitions() {
  const root = document.documentElement;
  root.classList.add(SWITCHING_CLASS);
  return () => root.classList.remove(SWITCHING_CLASS);
}

function suspendOffscreenFileSections() {
  const viewportBuffer = 128;
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>("[data-theme-snapshot-section]"),
  );
  const offscreen = sections
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(
      ({ rect }) =>
        rect.bottom < -viewportBuffer ||
        rect.top > innerHeight + viewportBuffer,
    );
  const suspended = offscreen.map(({ element, rect }) => ({
    element,
    previousHeight: element.style.height,
    height: Math.ceil(rect.height),
  }));

  for (const { element, height } of suspended) {
    element.style.height = `${height}px`;
    element.setAttribute("data-theme-snapshot-hidden", "true");
  }

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const { element, previousHeight } of suspended) {
      element.removeAttribute("data-theme-snapshot-hidden");
      element.style.height = previousHeight;
    }
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const pointer = useRef<Origin | null>(null);

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as Theme | null) ?? "light";
    setTheme(stored);
    apply(stored);

    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const toggleTheme = useCallback(
    (origin?: Origin) => {
      const next: Theme = theme === "dark" ? "light" : "dark";
      const persist = () => {
        try {
          localStorage.setItem(KEY, next);
        } catch {}
      };

      const start = (
        document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }
      ).startViewTransition?.bind(document);
      const reduceMotion =
        typeof matchMedia !== "undefined" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches;
      const isFileRoute = window.location.pathname === "/file";
      const transitionDuration = 520;

      if (reduceMotion) {
        const removeTransitionGuard = guardThemeSwitchTransitions();
        apply(next);
        requestAnimationFrame(() => {
          requestAnimationFrame(removeTransitionGuard);
        });
        setTheme(next);
        persist();
        return;
      }

      const p = origin ?? pointer.current ?? {
        x: innerWidth / 2,
        y: innerHeight / 2,
      };

      if (!start) {
        const removeTransitionGuard = guardThemeSwitchTransitions();
        apply(next);
        requestAnimationFrame(() => {
          requestAnimationFrame(removeTransitionGuard);
        });
        setTheme(next);
        persist();
        return;
      }

      // Install the performance guard before the browser captures the old
      // snapshot so both snapshots have the same computed animation styles.
      // The reveal itself remains byte-for-byte equivalent to the original.
      const removeTransitionGuard = guardThemeSwitchTransitions();
      const restoreOffscreenSections = isFileRoute
        ? suspendOffscreenFileSections()
        : () => {};

      // Only the cheap `.dark` class flip runs inside the transition callback,
      // so the captured "new" snapshot is correct without paying for a full
      // synchronous React re-render on the critical path. The React state
      // update is deferred outside the transition - the live DOM it touches is
      // hidden behind the snapshot until the animation finishes, so it can
      // never block or stutter the reveal.
      const transition = start(() => {
        apply(next);
      });
      setTheme(next);
      persist();

      void transition.ready.then(
        () => {
          const r = Math.hypot(
            Math.max(p.x, innerWidth - p.x),
            Math.max(p.y, innerHeight - p.y),
          );
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0 at ${p.x}px ${p.y}px)`,
                `circle(${r}px at ${p.x}px ${p.y}px)`,
              ],
            },
            {
              duration: transitionDuration,
              easing: "cubic-bezier(0.22,1,0.36,1)",
              pseudoElement: "::view-transition-new(root)",
            },
          );
          requestAnimationFrame(() => {
            restoreOffscreenSections();
            removeTransitionGuard();
          });
        },
        () => {
          restoreOffscreenSections();
          removeTransitionGuard();
        },
      );
    },
    [theme]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "m" && e.key !== "M") || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (!t || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      e.preventDefault();
      toggleTheme();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
