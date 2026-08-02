"use client";

// MCP health dashboard rendered under the Creed MCP card on /connections.
// Fetches an aggregated summary from /api/app/mcp/health (off the hot
// loadCreedState path) and renders it with recharts. Three filters drive the
// whole view client-side: agent, agent type, and time range. The
// hero chart can switch metric (reads / directs / proposals / all activity).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { Check, ChevronDown } from "lucide-react";
import { useCreed } from "@/components/creed/creed-provider";
import { IntegrationGlyph } from "@/components/creed/brand";
import { StackTopBar } from "@/components/creed/rounded-bar";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AGENT_CATEGORY_FILTER_ITEMS } from "@/lib/agent-icon";
import { filterMcpHealthSummary } from "@/lib/mcp-health-filter";
import {
  accentColorMap,
  isAccentKey,
  type AgentIconKind,
} from "@/lib/creed-data";
import {
  getCachedMcpHealth,
  loadMcpHealth,
  type McpHealthRange,
  type McpHealthAgent as HealthAgent,
  type McpHealthDay as HealthDay,
  type McpHealthSummary as HealthSummary,
} from "@/components/creed/mcp-health-preload";
import { cn } from "@/lib/utils";

type Metric = "reads" | "directs" | "proposals";
type ChartMetric = Metric | "all";

const RANGES: { value: McpHealthRange; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

const RANGE_WORD: Record<McpHealthRange, string> = {
  "7d": "this week",
  "30d": "this month",
  "90d": "this quarter",
};

const METRICS: { value: ChartMetric; label: string }[] = [
  { value: "reads", label: "Reads" },
  { value: "directs", label: "Directs" },
  { value: "proposals", label: "Proposals" },
  { value: "all", label: "All activity" },
];

const METRIC_COLOR: Record<Metric, string> = {
  reads: "#6366F1",
  directs: "#16A34A",
  proposals: "#D97706",
};
const METRIC_LABEL: Record<Metric, string> = {
  reads: "Reads",
  directs: "Directs",
  proposals: "Proposals",
};
const METRIC_BY_AGENT: Record<Metric, keyof HealthDay> = {
  reads: "readsByAgent",
  directs: "directsByAgent",
  proposals: "proposalsByAgent",
};

// Proposal-outcome colors for the per-agent trust chart.
const OUTCOME_CONFIG: ChartConfig = {
  accepted: { label: "Accepted", color: "#16A34A" },
  rejected: { label: "Rejected", color: "#DC2626" },
  pending: { label: "Pending", color: "#3B82F6" },
};

// Stack order (bottom to top) for the outcomes chart, so StackTopBar can round
// whichever segment is actually on top.
const OUTCOME_KEYS = ["accepted", "rejected", "pending"];

// Clean display names: known agents get their product name, anything else has
// its "-mcp-client" suffix stripped and is title-cased ("codex-mcp-client" →
// "Codex"; "my-bot" → "My Bot").
const AGENT_LABEL: Partial<Record<AgentIconKind, string>> = {
  claude: "Claude",
  claudecode: "Claude Code",
  codex: "Codex",
  chatgpt: "ChatGPT",
  cursor: "Cursor",
  devin: "Devin",
  grok: "Grok",
  v0: "v0",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
  hermes: "Hermes",
  factory: "Factory",
  manus: "Manus",
};

function cleanName(name: string) {
  const base = name
    .replace(/[-_\s]*mcp[-_\s]*client$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return base ? base.replace(/\b\w/g, (c) => c.toUpperCase()) : name;
}

function agentLabel(agent: HealthAgent) {
  return AGENT_LABEL[agent.icon] ?? cleanName(agent.name);
}

function formatDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function McpHealthDashboard() {
  const { state } = useCreed();
  const [range, setRange] = useState<McpHealthRange>("30d");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [metric, setMetric] = useState<ChartMetric>("all");
  // Scope the client cache to the active Creed so switching Creeds never shows
  // the previous one's dashboard. Empty string = personal/active Creed.
  const creedKey = state.creedId ?? "";
  // Seed from the cache the shell preloads, so the dashboard renders instantly
  // when the data is already warm instead of flashing a loading state.
  const [summary, setSummary] = useState<HealthSummary | null>(() =>
    getCachedMcpHealth(range, creedKey),
  );
  const [loading, setLoading] = useState(
    () => !getCachedMcpHealth(range, creedKey),
  );
  const [activeSection, setActiveSection] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // The Agents section's per-card "Logs" action fires this event with the
  // agent's client id; the dashboard focuses that agent and scrolls into view.
  useEffect(() => {
    function onFocusAgent(event: Event) {
      const detail = (event as CustomEvent<{ clientId?: string }>).detail;
      setAgentFilter(detail?.clientId ?? "all");
      // Align the dashboard's TOP with the container's top, not the container
      // bottom: the charts below load data and resize well after any fixed
      // frame budget, so a scroll-to-bottom target keeps going stale and lands
      // short. The section's top only depends on the (static) content above
      // it, so pinning it is immune to below-the-fold growth; the settle loop
      // still self-corrects if anything above does shift.
      const element = rootRef.current;
      const container = element?.closest(
        "[class*='overflow-y-auto']",
      ) as HTMLElement | null;
      if (!element || !container) return;
      // Clamped so an unreachable target still counts as "arrived" once the
      // container is scrolled as far as it can go.
      const targetTop = () =>
        Math.min(
          element.getBoundingClientRect().top -
            container.getBoundingClientRect().top +
            container.scrollTop,
          container.scrollHeight - container.clientHeight,
        );
      // Drive the animation by hand instead of scrollTo({behavior:"smooth"}):
      // the browser cancels its own smooth scroll whenever the charts' async
      // loads resize the layout mid-flight, which read as a stutter (or a
      // strand partway down). Setting scrollTop directly each frame can't be
      // cancelled, and re-reading the target each frame absorbs any layout
      // shift without restarting the motion.
      const DURATION_MS = 650;
      const easeInOut = (t: number) =>
        t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      let cancelled = false;
      const cancel = () => {
        // Never fight the user: any manual scroll input hands control back.
        cancelled = true;
        container.removeEventListener("wheel", cancel);
        container.removeEventListener("touchmove", cancel);
      };
      container.addEventListener("wheel", cancel, { passive: true });
      container.addEventListener("touchmove", cancel, { passive: true });
      const startTop = container.scrollTop;
      let start: number | null = null;
      const step = (now: number) => {
        if (cancelled) return;
        if (start === null) start = now;
        const progress = Math.min((now - start) / DURATION_MS, 1);
        container.scrollTop =
          startTop + (targetTop() - startTop) * easeInOut(progress);
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          cancel();
        }
      };
      requestAnimationFrame(step);
    }
    window.addEventListener("creed:mcp-health-focus-agent", onFocusAgent);
    return () =>
      window.removeEventListener("creed:mcp-health-focus-agent", onFocusAgent);
  }, []);

  const mcpClientCount = state.mcpClients.filter(
    (client) => client.icon !== "cli",
  ).length;

  // Current sections from the live file, keyed by id, so coverage shows the
  // section's real name + accent (activity rows snapshot a stale name and
  // accent="custom" at edit time, which is why the donut was white with old
  // labels). Activity that maps to no current section is bucketed as "Other".
  const currentSectionById = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    state.sections.forEach((section) => {
      map.set(section.id, {
        name: section.name,
        color: isAccentKey(section.accent)
          ? accentColorMap[section.accent]
          : "var(--accent-color-mono)",
      });
    });
    return map;
  }, [state.sections]);

  useEffect(() => {
    let active = true;
    // Show cached data immediately if we have it, then revalidate.
    const cached = getCachedMcpHealth(range, creedKey);
    if (cached) {
      setSummary(cached);
      setLoading(false);
    } else {
      setSummary(null);
      setLoading(true);
    }
    loadMcpHealth(range, creedKey, true)
      .then((health) => {
        if (active && health) {
          setSummary(health);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // Re-fetch on range change, Creed switch, and whenever a new agent shows up.
  }, [range, creedKey, mcpClientCount]);

  // Everything below reads from this MCP-only view of the summary. CLI usage
  // is deliberately excluded because it has its own setup mode and status
  // surface. The remaining category filter and every rollup are re-derived
  // from the surviving MCP agents' per-agent maps.
  const mcpOnlySummary = useMemo(() => {
    if (!summary) return summary;
    return filterMcpHealthSummary(summary, "all");
  }, [summary]);
  const filteredSummary = useMemo(
    () =>
      mcpOnlySummary && categoryFilter !== "all"
        ? filterMcpHealthSummary(
            mcpOnlySummary,
            categoryFilter as "chatbot" | "coding" | "personal",
          )
        : mcpOnlySummary,
    [mcpOnlySummary, categoryFilter],
  );

  // Keep the agent filter valid if the roster or category scope changes.
  useEffect(() => {
    if (
      agentFilter !== "all" &&
      filteredSummary &&
      !filteredSummary.agents.some((a) => a.clientId === agentFilter)
    ) {
      setAgentFilter("all");
    }
  }, [filteredSummary, agentFilter]);

  const selectedAgent = useMemo(
    () =>
      agentFilter === "all"
        ? null
        : (filteredSummary?.agents.find((a) => a.clientId === agentFilter) ??
          null),
    [filteredSummary, agentFilter],
  );

  // KPI values for the active agent filter.
  const view = useMemo(() => {
    if (!filteredSummary) return null;
    if (!selectedAgent) {
      const t = filteredSummary.totals;
      return {
        reads: t.reads,
        directs: t.directs,
        proposals: t.proposals,
        accepted: t.accepted,
        rejected: t.rejected,
        acceptRate: t.acceptRate,
      };
    }
    const resolved = selectedAgent.accepted + selectedAgent.rejected;
    return {
      reads: selectedAgent.reads,
      directs: selectedAgent.directs,
      proposals: selectedAgent.proposals,
      accepted: selectedAgent.accepted,
      rejected: selectedAgent.rejected,
      acceptRate: resolved > 0 ? selectedAgent.accepted / resolved : null,
    };
  }, [filteredSummary, selectedAgent]);

  // Hero chart: one area per selected metric (reads/directs/proposals, or all
  // three for "all"), over time. For "All agents" we plot the true daily totals
  // (always correct); for a specific agent we plot that agent's per-day
  // breakdown. We deliberately don't stack per-agent here because proposal /
  // direct attribution depends on the activity actor matching a client name,
  // which isn't guaranteed - the day totals are. Series are keyed by metric, so
  // the tooltip shows "Reads" / "Directs" / "Proposals", never a client id.
  const chart = useMemo(() => {
    const empty = {
      series: [] as { key: string; color: string }[],
      data: [] as Record<string, number | string>[],
      config: {} as ChartConfig,
      total: 0,
      max: 0,
    };
    if (!filteredSummary) return empty;

    const metrics: Metric[] =
      metric === "all" ? ["reads", "directs", "proposals"] : [metric];
    const series = metrics.map((m) => ({ key: m, color: METRIC_COLOR[m] }));
    const data = filteredSummary.days
      .map((day) => {
        const row: Record<string, number | string> = { date: day.date };
        for (const m of metrics) {
          row[m] = selectedAgent
            ? ((
                day[METRIC_BY_AGENT[m]] as Record<string, number> | undefined
              )?.[selectedAgent.clientId] ?? 0)
            : (day[m] ?? 0);
        }
        return row;
      })
      // Only plot days that actually have data (like the AI spend chart).
      .filter(
        (row) => metrics.reduce((s, m) => s + Number(row[m] ?? 0), 0) > 0,
      );
    const config: ChartConfig = {};
    metrics.forEach((m) => {
      config[m] = { label: METRIC_LABEL[m], color: METRIC_COLOR[m] };
    });
    const total = data.reduce(
      (sum, row) => series.reduce((s, se) => s + Number(row[se.key] ?? 0), sum),
      0,
    );
    // Largest stacked daily total - used to set explicit y-headroom so the
    // tallest spike never clips against the top of the plot.
    const max = data.reduce(
      (m, row) =>
        Math.max(
          m,
          series.reduce((s, se) => s + Number(row[se.key] ?? 0), 0),
        ),
      0,
    );
    return { series, data, config, total, max };
  }, [filteredSummary, metric, selectedAgent]);

  // Section coverage, scoped to the agent filter and remapped onto the user's
  // current sections (real name + colour). Activity whose section_id no longer
  // matches a current section is grouped into "Other".
  const OTHER_KEY = "__other__";
  const sections = useMemo(() => {
    if (!filteredSummary) return [];
    const buckets = new Map<
      string,
      { sectionId: string; sectionName: string; color: string; count: number }
    >();
    for (const section of filteredSummary.sections) {
      const count = selectedAgent
        ? (section.byAgent?.[selectedAgent.clientId] ?? 0)
        : section.count;
      if (count <= 0) continue;
      const current = currentSectionById.get(section.sectionId);
      const key = current ? section.sectionId : OTHER_KEY;
      const existing = buckets.get(key);
      if (existing) {
        existing.count += count;
      } else {
        buckets.set(key, {
          sectionId: key,
          sectionName: current ? current.name : "Other",
          color: current ? current.color : "var(--creed-text-tertiary)",
          count,
        });
      }
    }
    return [...buckets.values()].sort((a, b) => {
      if (a.sectionId === OTHER_KEY) return 1;
      if (b.sectionId === OTHER_KEY) return -1;
      return b.count - a.count;
    });
  }, [filteredSummary, selectedAgent, currentSectionById]);
  const sectionTotal = sections.reduce(
    (sum, section) => sum + section.count,
    0,
  );

  // Proposal outcomes over time, scoped to the agent filter - accepted /
  // rejected / pending per day (placed on the day the proposal was made).
  const outcomeData = useMemo(
    () =>
      (filteredSummary?.days ?? [])
        .map((day) => {
          const cid = selectedAgent?.clientId;
          return {
            date: day.date,
            accepted: cid
              ? (day.acceptedByAgent?.[cid] ?? 0)
              : (day.accepted ?? 0),
            rejected: cid
              ? (day.rejectedByAgent?.[cid] ?? 0)
              : (day.rejected ?? 0),
            pending: cid
              ? (day.pendingByAgent?.[cid] ?? 0)
              : (day.pending ?? 0),
          };
        })
        // Only plot days with proposal activity (like the AI spend chart).
        .filter((d) => d.accepted + d.rejected + d.pending > 0),
    [filteredSummary, selectedAgent],
  );
  const outcomeTotal = outcomeData.reduce(
    (sum, d) => sum + d.accepted + d.rejected + d.pending,
    0,
  );

  const metricLabel = METRICS.find((m) => m.value === metric)?.label ?? "Reads";
  // The connect empty-state keys off the MCP-only, category-unfiltered summary.
  // CLI activity cannot make it appear connected, while an empty category
  // filter still shows zeroed metrics instead of setup copy.
  const rawTotals = mcpOnlySummary?.totals;
  const isEmpty =
    !loading &&
    summary &&
    rawTotals &&
    rawTotals.agents === 0 &&
    rawTotals.proposals === 0 &&
    rawTotals.directs === 0 &&
    rawTotals.reads === 0;

  return (
    <div ref={rootRef} className="mt-12 scroll-mt-8 md:scroll-mt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
            Health
          </h2>
          <p className="mt-2 text-[14px] leading-7 text-[var(--creed-text-secondary)]">
            How your connected agents read and improve your Creed.
          </p>
        </div>
        {/* min-w-0 lets the agent chip shrink and ellipsize its label instead
            of pushing the other chips off-screen on narrow viewports. */}
        <div className="flex min-w-0 max-w-full items-center gap-3 md:gap-4">
          <Dropdown
            trigger={selectedAgent ? agentLabel(selectedAgent) : "All"}
            triggerIcon={selectedAgent ? selectedAgent.icon : "all"}
            // The one chip with a long label: shrink and ellipsize instead of
            // pushing the sibling chips off-screen on mobile.
            triggerClassName="min-w-0 shrink"
            disabled={(filteredSummary?.agents.length ?? 0) === 0}
            items={[
              { key: "all", label: "All", icon: "all" as AgentIconKind },
              ...(filteredSummary?.agents ?? []).map((agent) => ({
                key: agent.clientId,
                label: agentLabel(agent),
                icon: agent.icon,
              })),
            ]}
            selectedKey={agentFilter}
            iconSide="left"
            align="end"
            menuWidthClass="min-w-44"
            onSelect={(key) => {
              setAgentFilter(key);
              setActiveSection(null);
            }}
          />
          <Dropdown
            trigger={
              AGENT_CATEGORY_FILTER_ITEMS.find(
                (item) => item.key === categoryFilter,
              )?.label ?? "All"
            }
            items={AGENT_CATEGORY_FILTER_ITEMS}
            selectedKey={categoryFilter}
            onSelect={(key) => {
              setCategoryFilter(key);
              setActiveSection(null);
            }}
            align="end"
            menuWidthClass="min-w-28"
          />
          <Dropdown
            trigger={range}
            items={RANGES.map((option) => ({
              key: option.value,
              label: option.label,
            }))}
            selectedKey={range}
            onSelect={(key) => setRange(key as McpHealthRange)}
            menuWidthClass="min-w-24"
          />
        </div>
      </div>

      {isEmpty ? (
        <div className="mt-5 rounded-xl border border-dashed border-[var(--creed-border)] bg-[var(--creed-surface)] px-6 py-12 text-center">
          <IntegrationGlyph
            kind="mcp"
            framed={false}
            className="mx-auto h-10 w-10 opacity-70"
          />
          <div className="mt-4 text-[15px] font-medium text-[var(--creed-text-primary)]">
            No MCP activity yet
          </div>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-6 text-[var(--creed-text-secondary)]">
            Connect an agent with the prompt above. Once it reads your Creed,
            its activity shows up here.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label="Direct edits"
              value={loading ? null : (view?.directs ?? 0).toLocaleString()}
              sub={`${RANGE_WORD[range]}`}
            />
            <StatTile
              label="Reads"
              value={loading ? null : (view?.reads ?? 0).toLocaleString()}
              sub={`${RANGE_WORD[range]}`}
            />
            <StatTile
              label="Proposals"
              value={loading ? null : (view?.proposals ?? 0).toLocaleString()}
              sub={
                view
                  ? `${view.accepted} accepted · ${view.rejected} rejected`
                  : undefined
              }
            />
            <StatTile
              label="Accept rate"
              value={
                loading
                  ? null
                  : view?.acceptRate == null
                    ? "-"
                    : `${Math.round(view.acceptRate * 100)}%`
              }
              sub={
                view && view.acceptRate != null
                  ? `${view.accepted}/${view.accepted + view.rejected} resolved`
                  : "no resolved proposals"
              }
            />
          </div>

          <div className="mt-4 rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="text-[13px] font-medium text-[var(--creed-text-secondary)]">
                Activity over time
              </div>
              <Dropdown
                trigger={metricLabel}
                items={METRICS.map((m) => ({ key: m.value, label: m.label }))}
                selectedKey={metric}
                onSelect={(key) => setMetric(key as ChartMetric)}
              />
            </div>
            {summary && chart.total > 0 ? (
              <ChartContainer
                config={chart.config}
                className="mt-4 aspect-auto h-[240px] w-full"
              >
                <BarChart
                  data={chart.data}
                  margin={{ left: 4, right: 4, top: 8, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={[0, Math.ceil(chart.max * 1.2) || 1]} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value) => formatDay(String(value))}
                      />
                    }
                  />
                  {chart.series.map((series) => (
                    <Bar
                      key={series.key}
                      dataKey={series.key}
                      stackId="stack"
                      fill={series.color}
                      shape={
                        <StackTopBar
                          orderedKeys={chart.series.map((entry) => entry.key)}
                          dataKey={series.key}
                        />
                      }
                    />
                  ))}
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="flex h-[240px] items-center justify-center text-[13px] text-[var(--creed-text-tertiary)]">
                {loading
                  ? "Loading…"
                  : metric === "all"
                    ? "No activity recorded in this range yet."
                    : `No ${metricLabel.toLowerCase()} recorded in this range yet.`}
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
              <div className="text-[13px] font-medium text-[var(--creed-text-secondary)]">
                Proposal outcomes
              </div>
              {summary && outcomeTotal > 0 ? (
                <ChartContainer
                  config={OUTCOME_CONFIG}
                  className="mt-4 aspect-auto h-full min-h-[180px] w-full flex-1"
                >
                  <BarChart
                    data={outcomeData}
                    margin={{ left: 4, right: 4, top: 8, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="date" hide />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(value) => formatDay(String(value))}
                        />
                      }
                    />
                    <Bar
                      dataKey="accepted"
                      stackId="o"
                      fill="var(--color-accepted)"
                      shape={
                        <StackTopBar
                          orderedKeys={OUTCOME_KEYS}
                          dataKey="accepted"
                        />
                      }
                    />
                    <Bar
                      dataKey="rejected"
                      stackId="o"
                      fill="var(--color-rejected)"
                      shape={
                        <StackTopBar
                          orderedKeys={OUTCOME_KEYS}
                          dataKey="rejected"
                        />
                      }
                    />
                    <Bar
                      dataKey="pending"
                      stackId="o"
                      fill="var(--color-pending)"
                      shape={
                        <StackTopBar
                          orderedKeys={OUTCOME_KEYS}
                          dataKey="pending"
                        />
                      }
                    />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex min-h-[180px] flex-1 items-center justify-center text-[13px] text-[var(--creed-text-tertiary)]">
                  {loading ? "Loading…" : "No proposals in this range yet."}
                </div>
              )}
            </div>

            <div className="min-w-0 rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5">
              <div className="text-[13px] font-medium text-[var(--creed-text-secondary)]">
                Section coverage
              </div>
              {sections.length > 0 ? (
                <div className="mt-2 flex items-center gap-6">
                  <div
                    className="relative h-[200px] w-[200px] shrink-0"
                    onMouseLeave={() => setActiveSection(null)}
                  >
                    <ChartContainer
                      config={{}}
                      className="aspect-square h-[200px] w-[200px]"
                    >
                      <PieChart>
                        <Pie
                          data={sections}
                          dataKey="count"
                          nameKey="sectionName"
                          innerRadius={62}
                          outerRadius={92}
                          paddingAngle={2}
                          strokeWidth={0}
                          onMouseEnter={(_, index) => setActiveSection(index)}
                        >
                          {sections.map((section, index) => (
                            <Cell
                              key={section.sectionId}
                              fill={section.color}
                              fillOpacity={
                                activeSection === null ||
                                activeSection === index
                                  ? 1
                                  : 0.3
                              }
                              style={{ transition: "fill-opacity 160ms ease" }}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                      <span className="text-[22px] font-medium leading-none tracking-[-0.03em] text-[var(--creed-text-primary)]">
                        {activeSection !== null && sections[activeSection]
                          ? sections[activeSection].count
                          : sectionTotal}
                      </span>
                      <span className="mt-1 max-w-full truncate text-[12px] text-[var(--creed-text-tertiary)]">
                        {activeSection !== null && sections[activeSection]
                          ? sections[activeSection].sectionName
                          : "edits"}
                      </span>
                    </div>
                  </div>
                  <div
                    className="max-h-[200px] min-w-0 flex-1 space-y-1 overflow-y-auto pr-1 creed-scrollbar"
                    onMouseLeave={() => setActiveSection(null)}
                  >
                    {sections.map((section, index) => (
                      <div
                        key={section.sectionId}
                        onMouseEnter={() => setActiveSection(index)}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1 text-[13px] transition-colors duration-150",
                          activeSection === index
                            ? "bg-[var(--creed-surface-raised)]"
                            : "bg-transparent",
                        )}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                          style={{ backgroundColor: section.color }}
                        />
                        <span className="hidden truncate text-[var(--creed-text-secondary)] sm:block">
                          {section.sectionName}
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-[var(--creed-text-tertiary)]">
                          {section.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex h-[180px] items-center justify-center text-[13px] text-[var(--creed-text-tertiary)]">
                  {loading ? "Loading…" : "No agent edits in this range yet."}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Shared with the connections screen (agent-type filter), so the filter chip
// matches the All agents / timeframe dropdowns here pixel for pixel.
export function Dropdown({
  trigger,
  triggerIcon,
  items,
  selectedKey,
  onSelect,
  iconSide = "left",
  align,
  variant = "outline",
  menuWidthClass = "min-w-40",
  disabled = false,
  triggerClassName,
}: {
  trigger: string;
  triggerIcon?: AgentIconKind;
  items: {
    key: string;
    label: string;
    icon?: AgentIconKind;
    disabled?: boolean;
  }[];
  selectedKey: string;
  onSelect: (key: string) => void;
  iconSide?: "left" | "right";
  align?: "start" | "end";
  variant?: "outline" | "ghost";
  menuWidthClass?: string;
  disabled?: boolean;
  triggerClassName?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex h-8 max-w-full shrink-0 items-center gap-2 rounded-md px-3 text-[14px] text-[var(--creed-text-primary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] disabled:pointer-events-none disabled:opacity-60",
            variant === "outline"
              ? "border border-[var(--creed-border)] bg-[var(--creed-surface)]"
              : "-ml-1 text-[14px] font-medium text-[var(--creed-text-secondary)]",
            triggerClassName,
          )}
        >
          {triggerIcon ? (
            <IntegrationGlyph
              kind={triggerIcon}
              framed={false}
              className="h-4 w-4 shrink-0"
              assetClassName="h-4 w-4"
            />
          ) : null}
          {/* Long agent names (e.g. "Claude Code") must never wrap the chip
              onto two lines on mobile - truncate within the available width. */}
          <span className="min-w-0 truncate whitespace-nowrap">{trigger}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--creed-text-secondary)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align ?? (iconSide === "right" ? "end" : "start")}
        className={cn(
          "space-y-1 border-[var(--creed-border)] bg-[var(--creed-surface)] p-1.5",
          menuWidthClass,
        )}
      >
        {items.map((item) => (
          <DropdownMenuItem
            key={item.key}
            disabled={item.disabled}
            onSelect={() => onSelect(item.key)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-[14px]",
              selectedKey === item.key &&
                "bg-[var(--creed-surface-selected)] font-medium",
              item.disabled && "opacity-50",
            )}
          >
            {item.icon && iconSide === "left" ? (
              <IntegrationGlyph
                kind={item.icon}
                framed={false}
                className="h-5 w-5 shrink-0"
                assetClassName="h-5 w-5"
              />
            ) : null}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.icon && iconSide === "right" ? (
              <IntegrationGlyph
                kind={item.icon}
                framed={false}
                className="h-5 w-5 shrink-0"
                assetClassName="h-5 w-5"
              />
            ) : selectedKey === item.key ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-[var(--creed-text-primary)]" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | null;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4">
      <div className="text-[12px] font-medium text-[var(--creed-text-secondary)]">
        {label}
      </div>
      <div className="mt-2 text-[28px] font-medium leading-none tracking-[-0.04em] text-[var(--creed-text-primary)]">
        {value ?? <span className="text-[var(--creed-text-tertiary)]">-</span>}
      </div>
      {sub ? (
        <div className="mt-2 text-[12px] text-[var(--creed-text-tertiary)]">
          {sub}
        </div>
      ) : null}
    </div>
  );
}
