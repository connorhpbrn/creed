import {
  SkeletonBar,
  SkeletonRing,
  SkeletonScreen,
  SkeletonText,
} from "@/components/creed/loading-skeleton";

// Transition skeleton for /file. Geometry is lifted from FileScreen: the
// max-w-[920px] editor column and its paddings, the sticky header's pt-2/pb-5
// (md:pb-7) + mb-8 (md:mb-12), the header's right-hand button cluster at its
// real 32px height and per-label widths, and the Reorder.Group's
// `flex flex-col gap-8 md:gap-12` section rhythm. Section bodies sit on the
// editor's real 29.75px line grid (17px text at line-height 1.75).
//
// The persistent shell sidebar stays mounted; this only fills the editor pane.

// Per-section name and body line widths, roughly a few lines of prose each.
const SECTIONS = [
  { name: "w-40 md:w-52", lines: ["w-full", "w-[94%]", "w-[68%]"] },
  { name: "w-32 md:w-44", lines: ["w-full", "w-[88%]", "w-[97%]", "w-[52%]"] },
  { name: "w-36 md:w-48", lines: ["w-[96%]", "w-full", "w-[40%]"] },
  { name: "w-28 md:w-40", lines: ["w-full", "w-[83%]"] },
];

export default function FileLoading() {
  return (
    // The activity rail sits to the right of the editor at width 0 with a 1px
    // left border, so it occupies exactly 1px while closed. Matching it here
    // keeps the centred column from shifting when FileScreen mounts.
    <SkeletonScreen className="overscroll-contain border-r border-[var(--creed-border)]">
      <div className="mx-auto max-w-[920px] px-4 py-6 pb-28 md:px-12 md:py-10 md:pb-10 xl:px-16">
        {/* Sticky header block */}
        <div className="mb-8 pt-2 pb-5 md:mb-12 md:pb-7">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <SkeletonText preset="creedTitle" width="w-32 md:w-[152px]" />
              {/* SaveStatus: mt-2, 14px clock glyph + text-sm label */}
              <div className="mt-2 flex h-5 items-center gap-2">
                <SkeletonBar className="h-3.5 w-3.5 shrink-0 rounded-full" />
                <SkeletonBar className="h-2.5 w-24" />
              </div>
            </div>

            <div className="flex items-center gap-2 self-start">
              {/* Overall quality ring in its 28px hit area */}
              <div className="inline-flex h-7 w-7 items-center justify-center">
                <SkeletonRing size={18} />
              </div>

              {/* Push/pull split button: label half + 32px chevron half */}
              <div className="flex items-center">
                <SkeletonBar className="h-8 w-[68px] rounded-l-[13px] rounded-r-none md:w-[77px]" />
                <SkeletonBar className="h-8 w-8 rounded-l-none rounded-r-[13px]" />
              </div>

              {/* Nexus / Activity / Lock: icon-only circles under md, labelled
                  pills from md, exactly as the header renders them */}
              <SkeletonBar className="h-8 w-8 rounded-[13px] md:hidden" />
              <SkeletonBar className="hidden h-8 w-[86px] rounded-[13px] md:block" />

              <SkeletonBar className="h-8 w-8 rounded-[13px] md:hidden" />
              <SkeletonBar className="hidden h-8 w-[98px] rounded-[13px] md:block" />

              <SkeletonBar className="h-8 w-8 rounded-[13px] md:hidden" />
              <SkeletonBar className="hidden h-8 w-[107px] rounded-[13px] md:block" />

              {/* Overflow menu */}
              <SkeletonBar className="h-8 w-8 rounded-[13px]" />
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="flex flex-col gap-8 md:gap-12">
          {SECTIONS.map((section) => (
            <div key={section.name}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {/* Accent bar: h-9 w-1 rounded-[1.25px] */}
                  <SkeletonBar className="h-9 w-1 shrink-0 rounded-[1.25px]" />
                  <div className="flex min-w-0 items-center gap-2.5">
                    <SkeletonText preset="sectionName" width={section.name} />
                    <SkeletonRing size={18} />
                    {/* Collapse chevron in its -ml-2 h-9 w-10 pl-2 box */}
                    <div className="-ml-2 flex h-9 w-10 items-center justify-center pl-2">
                      <SkeletonBar className="h-4 w-4" />
                    </div>
                  </div>
                </div>
                {/* Section controls: one icon-sm (28px) trigger */}
                <div className="flex shrink-0 items-center gap-0.5">
                  <SkeletonBar className="h-7 w-7 rounded-md" />
                </div>
              </div>

              {/* Body: pt-6, then the editor's own min-h-[56px] pb-2 box */}
              <div className="pt-6">
                <div className="min-h-[56px] pb-2">
                  {section.lines.map((width) => (
                    <SkeletonText key={width} preset="body17" width={width} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
