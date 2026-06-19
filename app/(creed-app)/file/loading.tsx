// Transition skeleton for /file. Mirrors the editor 1:1: the header (title +
// clock/sync line on the left, quality ring + push/pull split button on the
// right) and the Reorder.Group of section blocks (accent bar + name + quality
// ring above body lines), using the same container, spacings, and element
// sizes as the real screen. The persistent shell sidebar stays mounted; this
// only fills the editor pane.
function Block({ className }: { className?: string }) {
  return <div className={`rounded-[6px] bg-[var(--creed-surface-raised)] ${className ?? ""}`} />;
}

// Per-section body line widths (mirrors a few lines of prose per section).
const SECTIONS = [
  ["w-full", "w-[94%]", "w-[68%]"],
  ["w-full", "w-[88%]", "w-[97%]", "w-[52%]"],
  ["w-[96%]", "w-full", "w-[40%]"],
  ["w-full", "w-[83%]"],
];

export default function FileLoading() {
  return (
    <div className="h-full overflow-hidden bg-[var(--creed-surface)]" aria-hidden="true">
      <div className="mx-auto max-w-[920px] px-4 py-6 md:px-12 md:py-10 xl:px-16">
        <div className="animate-pulse">
          {/* Header (matches the sticky header's pt-2 pb-5 md:pb-7 mb-8 md:mb-12) */}
          <div className="mb-8 pt-2 pb-5 md:mb-12 md:pb-7">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div>
                <Block className="h-6 w-56" />
                <div className="mt-2 flex items-center gap-2">
                  <Block className="h-3.5 w-3.5 rounded-full" />
                  <Block className="h-3.5 w-24" />
                </div>
              </div>
              <div className="flex items-center gap-2 self-start">
                <Block className="h-7 w-7 rounded-full" />
                <div className="flex items-center">
                  <Block className="h-8 w-[66px] rounded-l-[13px]" />
                  <Block className="-ml-px h-8 w-8 rounded-r-[13px]" />
                </div>
              </div>
            </div>
          </div>

          {/* Sections (matches Reorder.Group space-y-10 md:space-y-16) */}
          <div className="space-y-10 md:space-y-16">
            {SECTIONS.map((lines, i) => (
              <div key={i}>
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Block className="h-9 w-[3px] rounded-full" />
                    <Block className="h-4 w-32" />
                    <Block className="h-5 w-5 rounded-full" />
                  </div>
                  <Block className="h-7 w-7 rounded-md" />
                </div>
                <div className="space-y-2.5">
                  {lines.map((w, j) => (
                    <Block key={j} className={`h-3.5 ${w}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
