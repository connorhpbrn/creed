import { COMPONENTS } from "@/lib/types";
import {
  getStatusDashboard,
  overallUptime,
} from "@/lib/snapshots";
import { ComponentCard } from "@/components/component-card";
import { LiveIndicator } from "@/components/live-indicator";
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
      <LiveIndicator initial={overall} initialUptime={uptime}>
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
      </LiveIndicator>

      {isDev && <DevPulse />}
    </main>
  );
}
