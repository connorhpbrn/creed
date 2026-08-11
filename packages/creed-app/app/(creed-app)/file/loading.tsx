import {
  SkeletonBar,
  SkeletonRing,
  SkeletonScreen,
  SkeletonText,
} from "@/components/creed/loading-skeleton";

// Transition skeleton for /file. Geometry is lifted from FileScreen: the
// max-w-[920px] column with sticky header chrome, quality ring footprints,
// and section headers (accent bar + 1.22rem/1.45rem title + 17px ring +
// collapse control + icon-sm kebab).
//
// Also used as the Suspense fallback in PersistentAppSurfaces. Keep both
// entry points on this same export when the real File layout changes.

export function FileLoading() {
  return (
    <SkeletonScreen className="overscroll-contain">
      <div className="relative mx-auto max-w-[920px] px-4 py-6 pb-28 md:px-12 md:py-10 md:pb-10 xl:px-16">
        <div className="sticky top-0 z-20 mb-8 -mx-4 bg-[color:var(--creed-surface)]/95 px-4 pb-5 pt-2 backdrop-blur-sm [overflow-anchor:none] md:-mx-12 md:mb-12 md:px-12 md:pb-7 xl:-mx-16 xl:px-16">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex h-[29.25px] items-center gap-2.5 md:h-[34.8px]">
                <SkeletonBar className="h-3.5 w-[164px] md:h-4 md:w-[196px]" />
                <SkeletonBar className="hidden h-4 w-4 shrink-0 md:block" />
                <SkeletonBar className="hidden h-5 w-5 shrink-0 rounded md:block" />
              </div>
              <div className="mt-2 flex h-5 items-center gap-2">
                <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                  <SkeletonBar className="h-3.5 w-3.5 rounded-[3px]" />
                </div>
                <SkeletonBar className="h-2.5 w-[68px]" />
              </div>
            </div>
            <div className="flex items-center gap-2 self-start">
              <div className="inline-flex h-7 items-center gap-1">
                <div className="inline-flex h-7 w-7 items-center justify-center rounded-full">
                  <SkeletonRing size={18} stroke={2.5} />
                </div>
              </div>
              <div className="flex">
                <SkeletonBar className="h-8 w-[74px] rounded-r-none rounded-l-[13px]" />
                <SkeletonBar className="h-8 w-8 rounded-l-none rounded-r-[13px]" />
              </div>
              <SkeletonBar className="h-8 w-8 rounded-[13px] md:w-[78px]" />
              <SkeletonBar className="h-8 w-8 rounded-[13px] md:w-[86px]" />
              <SkeletonBar className="h-8 w-8 rounded-[13px] md:w-[92px]" />
              <SkeletonBar className="h-8 w-8 rounded-[13px]" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-8 md:gap-12">
          {[0, 1, 2].map((section) => (
            <section key={section}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <SkeletonBar className="h-9 w-1 shrink-0 rounded-[1.25px]" />
                    <div className="flex min-w-0 items-center gap-2.5">
                      <SkeletonText
                        preset="fileTitle"
                        width={
                          section === 0
                            ? "w-[112px]"
                            : section === 1
                              ? "w-[148px]"
                              : "w-[96px]"
                        }
                      />
                      <div className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                        <SkeletonRing size={17} stroke={2.5} />
                      </div>
                      <SkeletonBar className="-ml-2 h-9 w-10 shrink-0" />
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <SkeletonBar className="size-7 rounded-[13px]" />
                </div>
              </div>
              <div className="mt-6 space-y-3 pt-0">
                <SkeletonBar className="h-3 w-full" />
                <SkeletonBar className="h-3 w-[92%]" />
                <SkeletonBar className="h-3 w-[76%]" />
                {section === 0 ? <SkeletonBar className="h-3 w-[84%]" /> : null}
              </div>
            </section>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}

export default FileLoading;
