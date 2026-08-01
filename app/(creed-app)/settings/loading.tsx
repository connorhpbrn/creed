import type { ReactNode } from "react";
import {
  SkeletonBar,
  SkeletonScreen,
  SkeletonText,
} from "@/components/creed/loading-skeleton";

// Transition skeleton for /settings. Geometry is lifted from SettingsScreen: the
// max-w-3xl column with px-8/md:px-14 py-10, the mt-10 first section and my-10
// separators, and each card's own chrome - Profile's
// `grid-cols-[4.5rem_minmax(0,1fr)]` avatar layout, Agent edit behaviour's
// p-5 pb-4 with its 36px segmented control, the Integrations list (a bordered
// container whose rows carry px-5 py-4, not card padding), and Model usage's
// `md:grid-cols-[1.1fr_0.9fr]` split.
//
// Only the sections above the fold are drawn; the rest of the page (Version
// control, Archived, Data, Danger) arrives with the real screen.

function Card({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] ${className ?? "p-5"}`}
    >
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-10 h-px bg-[var(--creed-border)]" />;
}

// Label (14px / leading-5, mb-2) above an h-11 rounded-xl input.
function Field({ labelWidth }: { labelWidth: string }) {
  return (
    <div>
      <SkeletonText preset="t14" width={labelWidth} className="mb-2" />
      <SkeletonBar className="h-11 w-full rounded-xl" />
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <SkeletonScreen>
      <div className="mx-auto max-w-3xl px-8 py-10 md:px-14">
        <SkeletonText preset="h1" width="w-[90px]" />

        {/* Profile */}
        <section className="mt-10">
          <SkeletonText preset="h2" width="w-[43px]" />
          <Card>
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-4 md:gap-x-5 md:gap-y-5">
              {/* Editable avatar: 4.5rem square, rounded-[18px] */}
              <SkeletonBar className="h-[4.5rem] w-[4.5rem] rounded-[18px]" />
              <div className="min-w-0">
                <Field labelWidth="w-10" />
              </div>
              <div className="col-span-2 min-w-0">
                <Field labelWidth="w-10" />
              </div>
            </div>
          </Card>
        </section>

        <Divider />

        {/* Agent edit behaviour */}
        <section>
          <SkeletonText preset="h2" width="w-[135px]" />
          <Card className="p-5 pb-4">
            <div className="flex items-center justify-between gap-5">
              <SkeletonText preset="t15" width="w-[71px]" />
              {/* SectionPermissionControl: p-1 around three 28px segments */}
              <SkeletonBar className="h-9 w-[92px] shrink-0 rounded-sm" />
            </div>
            <div className="mt-5 border-t border-[var(--creed-border)] pt-4">
              {/* The row is -my-2 py-2, so its box is the text plus 16px */}
              <div className="-my-2 flex items-center justify-between py-2">
                <SkeletonText preset="t14" width="w-[133px]" />
                <SkeletonBar className="h-4 w-4 shrink-0" />
              </div>
            </div>
          </Card>
        </section>

        <Divider />

        {/* Integrations: bordered list, padding lives on the rows */}
        <section>
          <SkeletonText preset="h2" width="w-[76px]" />
          <Card className="divide-y divide-[var(--creed-border)] overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center">
                  <SkeletonBar className="h-7 w-7 rounded-[8px]" />
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <SkeletonText preset="t15" width="w-[45px]" />
                  {/* Status chip: px-1.5 py-0.5 around a 12px/18px line box */}
                  <SkeletonBar className="h-[22px] w-[86px] rounded-[6px]" />
                </div>
              </div>
              <SkeletonBar className="h-8 w-[79px] shrink-0 rounded-md" />
            </div>
          </Card>
        </section>

        <Divider />

        {/* Model usage */}
        <section>
          <div className="flex items-center justify-between gap-4">
            <SkeletonText preset="h2" width="w-[82px]" />
            <SkeletonBar className="h-8 w-[88px] rounded-md" />
          </div>
          <Card>
            <div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr] md:items-stretch">
              <div className="flex flex-col gap-4">
                {/* This month: 13px label + 30px figure */}
                <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] px-4 py-3">
                  <SkeletonText preset="t13" width="w-[60px]" />
                  <SkeletonText
                    preset="fig30"
                    width="w-[120px]"
                    className="mt-0.5"
                  />
                </div>
                {/* Extra credits: 13px label + 22px figure */}
                <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] px-4 py-2.5">
                  <SkeletonText preset="t13" width="w-[78px]" />
                  <SkeletonText
                    preset="fig22"
                    width="w-[64px]"
                    className="mt-0.5"
                  />
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <SkeletonBar className="h-8 w-[96px] rounded-md" />
                  <SkeletonBar className="h-8 w-[96px] rounded-md" />
                </div>
              </div>

              {/* UsageCard */}
              <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SkeletonText preset="t13" width="w-[71px]" />
                    <SkeletonText
                      preset="fig30"
                      width="w-[72px]"
                      className="mt-2"
                    />
                  </div>
                  <SkeletonBar className="h-8 w-[104px] shrink-0 rounded-md" />
                </div>
                <SkeletonBar className="mt-5 h-[120px] w-full rounded-lg" />
              </div>
            </div>
          </Card>
        </section>

        <Divider />
      </div>
    </SkeletonScreen>
  );
}
