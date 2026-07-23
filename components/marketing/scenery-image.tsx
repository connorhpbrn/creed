"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const SCENERY_WIDTHS: Record<string, number> = {
  "dark-auth.png": 1122,
  "light-auth.png": 1122,
  "dark-finale.png": 1642,
  "light-finale.png": 1642,
  "dark-hero.png": 1672,
  "light-hero.png": 1672,
};

// A landing backdrop image (hero / auth panel) that self-heals while art is
// still being made: if the file 404s, it renders a labelled placeholder
// telling you exactly which file to drop into public/assets/landing/scenery/. As
// soon as the real image exists it loads and the placeholder disappears - no
// flags to flip. `className` carries theme visibility (e.g. `dark:hidden`).
//
// Uses a native <picture> (not next/image) on purpose: these are hand-made
// static backdrops served as cache-busted, high-quality 10-bit AVIFs with a
// responsive 960px source and the PNG master as the final fallback. A native
// element also gives reliable onError + naturalWidth for the missing-file
// fallback.
export function SceneryImage({
  src,
  fileName,
  label,
  hint,
  priority,
  sizes = "100vw",
  className,
}: {
  src: string;
  fileName: string;
  label?: string;
  hint?: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // A 404 can finish before React attaches onError (during hydration), so the
  // event is missed. Re-check the natural size once mounted to catch that case.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setErrored(true);
  }, []);

  if (errored) {
    // `className` carries a display utility (e.g. `dark:block`), so the root
    // must not also set `flex` - tailwind-merge would drop one. Fill with
    // `absolute inset-0` and centre the label with a translate instead.
    return (
      <div className={cn("absolute inset-0 bg-[var(--creed-surface-raised)]", className)}>
        <div className="absolute left-1/2 top-1/2 max-w-[16rem] -translate-x-1/2 -translate-y-1/2 px-6 text-center">
          <div className="text-[13px] font-medium text-[var(--creed-text-secondary)]">
            {label ?? "Image"} - add this file
          </div>
          <div
            className="mt-2 rounded-md bg-[var(--creed-surface)] px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--creed-text-tertiary)]"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            public/assets/landing/scenery/
            <br />
            {fileName}
          </div>
          {hint ? (
            <div className="mt-2 text-[11px] text-[var(--creed-text-tertiary)]">{hint}</div>
          ) : null}
        </div>
      </div>
    );
  }

  const avifBase = src.endsWith(".png") ? src.replace(/\.png$/, "") : null;
  const fullWidth = SCENERY_WIDTHS[fileName];
  const avifSrcSet = avifBase && fullWidth
    ? `${avifBase}.v2-960.avif 960w, ${avifBase}.v2.avif ${fullWidth}w`
    : null;

  return (
    <picture>
      {avifSrcSet ? (
        <source srcSet={avifSrcSet} sizes={sizes} type="image/avif" />
      ) : null}
      <img
        ref={imgRef}
        src={src}
        alt=""
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        onError={() => setErrored(true)}
        onLoad={(event) => {
          if (event.currentTarget.naturalWidth === 0) setErrored(true);
        }}
        className={cn("absolute inset-0 h-full w-full object-cover object-center", className)}
      />
    </picture>
  );
}
