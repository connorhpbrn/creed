import type { ReactNode } from "react";
import {
  SkeletonBar,
  SkeletonScreen,
  SkeletonText,
} from "@/components/creed/loading-skeleton";

// Transition skeleton for /settings. Geometry is lifted from SettingsScreen:
// max-w-3xl column with px-8/md:px-14 py-10, Identity (Creed avatar + name
// only - Profile/email live in AccountDialog), Agent edit behaviour,
// Integrations list rows, and Model usage's md:grid-cols-[1.1fr_0.9fr] split.
//
// Only above-the-fold sections are drawn; Version control / Archived / Data /
// Danger arrive with the real screen. Also used as the Suspense fallback.

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

function Field({ labelWidth }: { labelWidth: string }) {
  return (
    <div>
      <SkeletonText preset="t14" width={labelWidth} className="mb-2" />
      <SkeletonBar className="h-11 w-full rounded-xl" />
    </div>
  );
}

export function SettingsLoading() {
  return (
    <SkeletonScreen>
      <div className="mx-auto max-w-3xl px-8 py-10 md:px-14">
        <SkeletonText preset="h1" width="w-[90px]" />

        <section className="mt-10">
          <SkeletonText preset="h2" width="w-[52px]" />
          <Card>
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-4 md:gap-x-5 md:gap-y-5">
              <SkeletonBar className="h-[4.5rem] w-[4.5rem] rounded-[18px]" />
              <div className="min-w-0">
                <Field labelWidth="w-[78px]" />
              </div>
            </div>
          </Card>
        </section>

        <Divider />

        <section>
          <SkeletonText preset="h2" width="w-[135px]" />
          <Card className="p-5 pb-4">
            <div className="flex items-center justify-between gap-5">
              <SkeletonText preset="t15" width="w-[71px]" />
              <SkeletonBar className="h-9 w-[92px] shrink-0 rounded-sm" />
            </div>
            <div className="mt-5 border-t border-[var(--creed-border)] pt-4">
              <div className="-my-2 flex items-center justify-between py-2">
                <SkeletonText preset="t14" width="w-[133px]" />
                <SkeletonBar className="h-4 w-4 shrink-0" />
              </div>
            </div>
          </Card>
        </section>

        <Divider />

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
                  <SkeletonBar className="h-[22px] w-[86px] rounded-[6px]" />
                </div>
              </div>
              <SkeletonBar className="h-8 w-[79px] shrink-0 rounded-md" />
            </div>
          </Card>
        </section>

        <Divider />

        <section>
          <div className="flex items-center justify-between gap-4">
            <SkeletonText preset="h2" width="w-[82px]" />
            <SkeletonBar className="h-8 w-[88px] rounded-md" />
          </div>
          <Card>
            <div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr] md:items-stretch">
              <div className="flex flex-col gap-4">
                <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] px-4 py-3">
                  <SkeletonText preset="t13" width="w-[88px]" />
                  <SkeletonText
                    preset="fig30"
                    width="w-[120px]"
                    className="mt-0.5"
                  />
                </div>
                <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] px-4 py-2.5">
                  <SkeletonText preset="t13" width="w-[84px]" />
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

              <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SkeletonText preset="t13" width="w-[84px]" />
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

export default SettingsLoading;
