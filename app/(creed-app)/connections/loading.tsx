// Transition skeleton for /connections. Mirrors the real screen 1:1: heading,
// the "MCP setup" intro, the MCP connection card (glyph + status, server-URL
// box, action buttons), then the MCP health dashboard (header + two dropdowns,
// four StatTiles, the activity chart, and the proposal-outcomes / section-
// coverage donut pair). Uses the same container, radii, paddings, and element
// sizes as the source.
import type { ReactNode } from "react";

function Block({ className }: { className?: string }) {
  return <div className={`rounded-[6px] bg-[var(--creed-surface-raised)] ${className ?? ""}`} />;
}

function Card({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div
      className={`rounded-[16px] border border-[var(--creed-border)] bg-[var(--creed-surface)] ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

export default function ConnectionsLoading() {
  return (
    <div className="h-full overflow-hidden bg-[var(--creed-surface)]" aria-hidden="true">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-12 md:py-10">
        <div className="animate-pulse">
          {/* Heading */}
          <Block className="h-7 w-48" />

          {/* MCP setup intro */}
          <div className="mt-8">
            <Block className="h-4 w-28" />
            <div className="mt-2 space-y-2.5">
              <Block className="h-3.5 w-full max-w-2xl" />
              <Block className="h-3.5 w-2/3 max-w-md" />
            </div>
          </div>

          {/* MCP connection card */}
          <Card className="mt-5 p-4 md:p-5">
            <div className="flex items-center gap-3">
              <Block className="h-9 w-9 rounded-[8px]" />
              <div>
                <Block className="h-4 w-24" />
                <div className="mt-1.5 flex items-center gap-2">
                  <Block className="h-2 w-2 rounded-[3px]" />
                  <Block className="h-3 w-40" />
                </div>
              </div>
            </div>
            <Block className="mt-4 h-[34px] w-64 max-w-full rounded-[10px]" />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Block className="h-9 w-[116px] rounded-md" />
              <Block className="h-9 w-44 rounded-md" />
            </div>
          </Card>

          {/* MCP health dashboard */}
          <div className="mt-12">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Block className="h-4 w-28" />
                <Block className="mt-2.5 h-3.5 w-72 max-w-full" />
              </div>
              <div className="flex items-center gap-3 md:gap-4">
                <Block className="h-8 w-32 rounded-md" />
                <Block className="h-8 w-20 rounded-md" />
              </div>
            </div>

            {/* StatTiles */}
            <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4"
                >
                  <Block className="h-3 w-20" />
                  <Block className="mt-2.5 h-7 w-14" />
                  <Block className="mt-2.5 h-3 w-24" />
                </div>
              ))}
            </div>

            {/* Activity over time */}
            <Card className="mt-4 p-5">
              <div className="flex items-center justify-between gap-4">
                <Block className="h-3.5 w-28" />
                <Block className="h-8 w-24 rounded-md" />
              </div>
              <Block className="mt-4 h-[240px] w-full rounded-[10px]" />
            </Card>

            {/* Proposal outcomes + section coverage */}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <Block className="h-3.5 w-32" />
                <Block className="mt-4 h-[180px] w-full rounded-[10px]" />
              </Card>
              <Card className="p-5">
                <Block className="h-3.5 w-32" />
                <div className="mt-2 flex items-center gap-6">
                  <div className="flex h-[200px] w-[200px] shrink-0 items-center justify-center">
                    <div className="h-[184px] w-[184px] rounded-full border-[30px] border-[var(--creed-surface-raised)]" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Block className="h-2.5 w-2.5 rounded-[3px]" />
                        <Block className="h-3 w-full" />
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
