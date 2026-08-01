import type { ReactNode } from "react";

// Shared primitives for the route-level loading skeletons (/connections,
// /settings). Every measurement in those files is copied from the real screen so
// the swap from skeleton to content lands on the same pixels: same container
// max-widths and paddings, same card radii and paddings, same row heights and
// gaps, same responsive breakpoints.
//
// Three details that are easy to get wrong and cause a visible jump:
//   1. A bar standing in for text must sit inside a box of the text's real LINE
//      HEIGHT, not the bar's own height. The app resolves line-height to 1.5x
//      font size (a 1.75rem heading occupies 42px, not 28px), so sizing bars to
//      the font size shortens every heading and walks the whole page up. That is
//      what `SkeletonText` is for - the presets below are the measured line
//      boxes of the type scale actually used on these screens.
//   2. The scroll container repeats the real screen's classes verbatim -
//      `h-full overflow-y-auto creed-scrollbar` on a surface background.
//      `creed-scrollbar` is a classic 10px scrollbar rather than an overlay, so
//      it takes layout width; `overflow-hidden` here would offset the centred
//      column by ~5px against the real screen. Each skeleton is taller than a
//      viewport, so the gutter is present in both.
//   3. Chart discs and quality rings are strokes, not filled circles; a filled
//      disc reads far heavier than the thing it replaces.

export function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-[6px] bg-[var(--creed-surface-raised)] ${className ?? ""}`}
    />
  );
}

// Measured line boxes (`box`) and their bar heights (`bar`, ~0.72x font size).
// Names are the type scale as written in the source: `t15` is `text-[15px]`,
// `t13Loose` is `text-[13px] leading-6`, and so on.
const TEXT_PRESETS = {
  // font-heading text-[1.75rem] - the page headings
  h1: { box: "h-[42px]", bar: "h-5" },
  // text-[16px] - section headings
  h2: { box: "h-6", bar: "h-3" },
  t15: { box: "h-[22.5px]", bar: "h-[11px]" },
  // text-sm and text-[14px] both resolve to a 20px box
  t14: { box: "h-5", bar: "h-2.5" },
  t14Loose: { box: "h-7", bar: "h-2.5" },
  t13: { box: "h-[19.5px]", bar: "h-[9px]" },
  t13Loose: { box: "h-6", bar: "h-[9px]" },
  t12: { box: "h-[18px]", bar: "h-[9px]" },
  // Figures: text-[30px], text-[28px] leading-none, text-[22px]
  fig30: { box: "h-[45px]", bar: "h-[22px]" },
  fig28: { box: "h-7", bar: "h-5" },
  fig22: { box: "h-[33px]", bar: "h-4" },
} as const;

export function SkeletonText({
  preset,
  width,
  className,
}: {
  preset: keyof typeof TEXT_PRESETS;
  width: string;
  className?: string;
}) {
  const { box, bar } = TEXT_PRESETS[preset];
  return (
    <div className={`flex items-center ${box} ${className ?? ""}`}>
      <SkeletonBar className={`${bar} ${width}`} />
    </div>
  );
}

// A ring-shaped placeholder for quality rings and donut charts.
export function SkeletonRing({
  size,
  stroke = 2,
}: {
  size: number;
  stroke?: number;
}) {
  return (
    <div
      className="shrink-0 rounded-full border-[var(--creed-surface-raised)]"
      style={{ height: size, width: size, borderWidth: stroke }}
    />
  );
}

// Mirrors the scroll container every app screen wraps its content in.
export function SkeletonScreen({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`creed-scrollbar h-full overflow-y-auto bg-[var(--creed-surface)] ${className ?? ""}`}
    >
      <div className="animate-pulse motion-reduce:animate-none">{children}</div>
    </div>
  );
}
