"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";

const LazyCreedAppDemo = lazy(() =>
  import("@/components/marketing/creed-app-demo").then((module) => ({
    default: module.CreedAppDemo,
  })),
);

function CreedAppDemoPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="h-[584px] w-full rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[0_18px_50px_-30px_rgba(0,0,0,0.32)] sm:h-[624px] lg:h-[664px]"
    />
  );
}

export function CreedAppDemoLoader() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || shouldLoad) return;

    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "400px 0px" },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={containerRef}>
      {shouldLoad ? (
        <Suspense fallback={<CreedAppDemoPlaceholder />}>
          <LazyCreedAppDemo />
        </Suspense>
      ) : (
        <CreedAppDemoPlaceholder />
      )}
    </div>
  );
}
