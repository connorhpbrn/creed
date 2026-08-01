import type { ReactNode } from "react";
import {
  SkeletonBar,
  SkeletonRing,
  SkeletonScreen,
  SkeletonText,
} from "@/components/creed/loading-skeleton";

// Transition skeleton for /connections. Geometry is lifted from
// ConnectionsScreen + McpHealthDashboard: the max-w-[960px] column, the Setup
// pair (two rounded-xl p-4/md:p-5 cards in a lg:grid-cols-2), the Agents grid of
// rounded-lg p-4 connection cards, then Health at mt-12 with its four
// rounded-lg p-4 stat tiles, the 240px activity chart, and the 180px/200px
// chart pair.

function Card({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`border-[var(--creed-border)] bg-[var(--creed-surface)] ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

// Section heading (16px) + one line of 14px/leading-7 description.
function SectionHeading({
  titleWidth,
  descriptionWidth,
}: {
  titleWidth: string;
  descriptionWidth: string;
}) {
  return (
    <div>
      <SkeletonText preset="h2" width={titleWidth} />
      <SkeletonText
        preset="t14Loose"
        width={descriptionWidth}
        className="mt-2"
      />
    </div>
  );
}

// Glyph + name + status dot/label, shared by the Setup and Agents cards.
function CardIdentity() {
  return (
    <div className="flex items-center gap-3">
      <SkeletonBar className="h-9 w-9 shrink-0 rounded-[8px]" />
      <div>
        <SkeletonText preset="t15" width="w-16" />
        <div className="mt-1 flex h-[19.5px] items-center gap-2">
          <SkeletonBar className="h-2 w-2 shrink-0 rounded-[3px]" />
          <SkeletonBar className="h-[9px] w-24" />
        </div>
      </div>
    </div>
  );
}

export default function ConnectionsLoading() {
  return (
    <SkeletonScreen>
      <div className="mx-auto max-w-[960px] px-4 py-8 md:px-12 md:py-10">
        <SkeletonText preset="h1" width="w-[140px]" />

        {/* Setup */}
        <div className="mt-8">
          <SectionHeading titleWidth="w-[37px]" descriptionWidth="w-[26rem]" />
        </div>

        <div className="mt-5 grid items-start gap-4 lg:grid-cols-2">
          {["mcp", "cli"].map((mode) => (
            <Card
              key={mode}
              className="flex flex-col self-start rounded-xl border p-4 md:p-5"
            >
              <CardIdentity />

              {/* Server URL / command box: font-mono 13px in a px-3 py-2 box */}
              <div className="mt-4 w-fit max-w-full rounded-[var(--radius-md)] border border-[var(--creed-border)] px-3 py-2">
                <SkeletonText
                  preset="t13"
                  width="w-[min(60vw,15rem)]"
                  className="h-4"
                />
              </div>

              {/* Copy button (min-w-[116px]) + ghost instructions toggle */}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <SkeletonBar className="h-8 w-[116px] rounded-md" />
                <SkeletonBar className="h-8 w-[130px] rounded-md" />
              </div>
            </Card>
          ))}
        </div>

        {/* Agents */}
        <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
          <SectionHeading titleWidth="w-[46px]" descriptionWidth="w-[19rem]" />
          <SkeletonBar className="h-8 w-[74px] rounded-md" />
        </div>

        <div className="mt-5 grid items-start gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <Card
              key={index}
              className="flex flex-col self-start rounded-lg border p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <CardIdentity />
                <SkeletonBar className="h-7 w-7 shrink-0 rounded-md" />
              </div>

              {/* Connect hint: 13px / leading-6, two lines */}
              <div className="mt-4">
                <SkeletonText preset="t13Loose" width="w-full" />
                <SkeletonText preset="t13Loose" width="w-[62%]" />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <SkeletonBar className="h-8 w-[116px] rounded-md" />
                <SkeletonBar className="h-8 w-[92px] rounded-md" />
              </div>
            </Card>
          ))}
        </div>

        {/* Health */}
        <div className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading titleWidth="w-[43px]" descriptionWidth="w-[21rem]" />
            <div className="flex items-center gap-3 md:gap-4">
              <SkeletonBar className="h-8 w-[92px] rounded-md" />
              <SkeletonBar className="h-8 w-[74px] rounded-md" />
            </div>
          </div>

          {/* Stat tiles */}
          <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Card key={index} className="rounded-lg border p-4">
                <SkeletonText preset="t12" width="w-20" />
                <SkeletonText preset="fig28" width="w-14" className="mt-2" />
                <SkeletonText preset="t12" width="w-24" className="mt-2" />
              </Card>
            ))}
          </div>

          {/* Activity over time */}
          <Card className="mt-4 rounded-xl border p-5">
            <div className="flex items-center justify-between gap-4">
              <SkeletonText preset="t13" width="w-[96px]" />
              <SkeletonBar className="h-8 w-[104px] rounded-md" />
            </div>
            <SkeletonBar className="mt-4 h-[240px] w-full rounded-lg" />
          </Card>

          {/* Proposal outcomes + section coverage */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="flex min-w-0 flex-col rounded-xl border p-5">
              <SkeletonText preset="t13" width="w-[99px]" />
              <SkeletonBar className="mt-4 h-[180px] w-full flex-1 rounded-lg" />
            </Card>
            <Card className="min-w-0 rounded-xl border p-5">
              <SkeletonText preset="t13" width="w-[89px]" />
              <div className="mt-2 flex items-center gap-6">
                <div className="flex h-[200px] w-[200px] shrink-0 items-center justify-center">
                  <SkeletonRing size={168} stroke={26} />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  {[0, 1, 2, 3, 4].map((index) => (
                    <div key={index} className="flex h-[26px] items-center gap-2">
                      <SkeletonBar className="h-2.5 w-2.5 shrink-0 rounded-[3px]" />
                      <SkeletonBar className="h-[9px] w-full" />
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
