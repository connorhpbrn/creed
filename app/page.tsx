import { COMPONENTS } from "@/lib/types";
import {
  getStatusDashboard,
  overallUptime,
  fmtPct,
} from "@/lib/snapshots";
import { ComponentCard } from "@/components/component-card";
import { LiveIndicator } from "@/components/live-indicator";
import { CreedMark } from "@/components/creed-mark";
import { DevPulse } from "@/components/dev-pulse";

// Always render from the live store; never cache.
export const dynamic = "force-dynamic";

export default async function Page() {
  const { byComponent, currentByComponent, overall } =
    await getStatusDashboard();
  const uptime = overallUptime(byComponent);
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <main className="mx-auto flex min-h-screen w-full min-w-0 max-w-[640px] flex-col px-5 py-14 sm:py-20">
      <header className="flex items-center justify-center gap-2.5">
        <CreedMark className="h-[26px] w-auto" />
        <span className="text-[17px] font-semibold tracking-tight">
          Status
        </span>
      </header>

      <div className="mt-10">
        <LiveIndicator initial={overall} />
      </div>

      <hr
        className="my-9 border-0"
        style={{ borderTop: "1px solid var(--status-border)" }}
      />

      <div className="flex flex-col gap-4">
        {COMPONENTS.map((meta) => (
          <ComponentCard
            key={meta.name}
            meta={meta}
            buckets={byComponent[meta.name]}
            currentState={currentByComponent[meta.name]}
          />
        ))}
      </div>

      <footer
        className="mt-14 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] leading-[1.55]"
        style={{ color: "var(--status-text-tertiary)" }}
      >
        <span>© 2026 Creed</span>
        <span aria-hidden="true">·</span>
        <span>by</span>
        <a
          href="https://hpbrn.cc"
          target="_blank"
          rel="noreferrer"
          className="font-medium transition-opacity hover:opacity-70"
          style={{ color: "var(--status-text-primary)" }}
        >
          hpbrn
        </a>
      </footer>

      <span className="sr-only">{`Overall uptime ${fmtPct(uptime)}%`}</span>

      {isDev && <DevPulse />}
    </main>
  );
}
