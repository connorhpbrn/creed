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
  const { byComponent, overall } = await getStatusDashboard();
  const uptime = overallUptime(byComponent);
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col px-5 py-14 sm:py-20">
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
          />
        ))}
      </div>

      <footer
        className="mt-14 text-center text-[13px]"
        style={{ color: "var(--status-text-tertiary)" }}
      >
        © Creed 2026
      </footer>

      <span className="sr-only">{`Overall uptime ${fmtPct(uptime)}%`}</span>

      {isDev && <DevPulse />}
    </main>
  );
}
