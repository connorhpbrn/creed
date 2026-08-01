"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";

const LazyCreedBenchChart = lazy(() =>
  import("@/components/marketing/creed-bench-chart").then((module) => ({
    default: module.CreedBenchChart,
  })),
);

function BenchChartPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="h-[460px] w-full animate-pulse rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)]"
    />
  );
}

export function CreedBenchChartLoader() {
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
      { rootMargin: "300px 0px" },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={containerRef}>
      {shouldLoad ? (
        <Suspense fallback={<BenchChartPlaceholder />}>
          <LazyCreedBenchChart />
        </Suspense>
      ) : (
        <BenchChartPlaceholder />
      )}
    </div>
  );
}
