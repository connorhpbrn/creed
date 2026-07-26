"use client";

import { Scatter, ScatterChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { accentColorMap } from "@/lib/creed-data";

// Illustrative compounding re-explaining cost. Not a formal measurement.
const WEEKS = [
  { week: 1, without: 12, with: 12 },
  { week: 2, without: 28, with: 14 },
  { week: 3, without: 49, with: 15 },
  { week: 4, without: 74, with: 16 },
  { week: 5, without: 105, with: 17 },
  { week: 6, without: 142, with: 18 },
  { week: 7, without: 186, with: 18 },
  { week: 8, without: 238, with: 19 },
] as const;

const WITHOUT_COLOR = accentColorMap.boundaries;
const WITH_COLOR = accentColorMap.stack;

const SERIES = [
  {
    key: "without",
    label: "Without a context file",
    color: WITHOUT_COLOR,
    blurb: "Per-chat and per-tool restating compounds every week.",
    points: WEEKS.map((row) => ({
      x: row.week,
      week: row.week,
      minutes: row.without,
    })),
  },
  {
    key: "with",
    label: "With a context file",
    color: WITH_COLOR,
    blurb: "Write once, then small maintenance as things change.",
    points: WEEKS.map((row) => ({
      x: row.week,
      week: row.week,
      minutes: row.with,
    })),
  },
] as const;

const chartConfig = Object.fromEntries(
  SERIES.map((series) => [
    series.key,
    { label: series.label, color: series.color },
  ]),
) satisfies ChartConfig;

const yDomain: [number, number] = [0, 260];
const yTicks = [0, 40, 80, 120, 160, 200, 240];
const xTicks = WEEKS.map((row) => row.week);

type TooltipPoint = {
  week?: number;
  minutes?: number;
  label?: string;
  color?: string;
};

function TaxTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: TooltipPoint }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="min-w-[170px] animate-in rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-3 shadow-[0_12px_30px_rgba(28,28,26,0.10)] fade-in-0 zoom-in-95 duration-150">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-[3px]"
          style={{ backgroundColor: point.color }}
        />
        <p className="text-[13px] font-medium text-[var(--creed-text-primary)]">
          {point.label}
        </p>
      </div>
      <p className="mt-1 text-[12px] text-[var(--creed-text-tertiary)]">
        Week {point.week}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 border-t border-[var(--creed-border)] pt-3 text-[12px]">
        <span className="text-[var(--creed-text-secondary)]">Minutes</span>
        <span className="text-right font-mono font-medium tabular-nums text-[var(--creed-text-primary)]">
          {point.minutes}
        </span>
      </div>
    </div>
  );
}

function seriesTotal(points: readonly { minutes: number }[]) {
  return points[points.length - 1]?.minutes ?? 0;
}

function LegendTooltip({ series }: { series: (typeof SERIES)[number] }) {
  return (
    <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 hidden w-max max-w-[220px] -translate-x-1/2 animate-in rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-3 shadow-[0_12px_30px_rgba(28,28,26,0.10)] fade-in-0 zoom-in-95 duration-150 group-hover:block">
      <p className="text-[12px] leading-5 text-[var(--creed-text-secondary)]">
        {series.blurb}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 border-t border-[var(--creed-border)] pt-3 text-[12px]">
        <span className="text-[var(--creed-text-secondary)]">By week 8</span>
        <span className="text-right font-mono font-medium tabular-nums text-[var(--creed-text-primary)]">
          {seriesTotal(series.points)} min
        </span>
      </div>
    </div>
  );
}

function TaxPointShape({
  cx = 0,
  cy = 0,
  fill = "currentColor",
}: {
  cx?: number;
  cy?: number;
  fill?: string;
}) {
  return (
    <rect
      x={cx - 5}
      y={cy - 5}
      width={10}
      height={10}
      rx={3}
      fill={fill}
      className="cursor-default transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-150"
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
    />
  );
}

export function LearnTaxCompoundChart() {
  return (
    <div className="mt-10">
      <div className="mb-1 flex flex-col gap-4 text-left sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-[20px] font-medium tracking-[-0.02em] text-[var(--creed-text-primary)] sm:text-[24px]">
            The tax compounds
          </h3>
          <p className="mt-1 text-[13px] text-[var(--creed-text-secondary)]">
            Cumulative minutes re-explaining · illustrative
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-x-4 gap-y-2 sm:justify-end">
          {SERIES.map((series) => (
            <div
              key={series.key}
              className="group relative flex items-center gap-1.5 text-[12px] text-[var(--creed-text-secondary)]"
            >
              <LegendTooltip series={series} />
              <span
                className="h-2.5 w-2.5 rounded-[3px] transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-150"
                style={{ backgroundColor: series.color }}
              />
              <span className="transition-colors duration-150 group-hover:text-[var(--creed-text-primary)]">
                {series.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <ChartContainer
        config={chartConfig}
        initialDimension={{ width: 800, height: 420 }}
        className="h-[320px] w-full min-w-0 aspect-auto [&_.recharts-wrapper]:outline-none [&_.recharts-wrapper_*]:outline-none sm:h-[420px]"
      >
        <ScatterChart margin={{ top: 12, right: 24, bottom: 20, left: 4 }}>
          <XAxis
            type="number"
            dataKey="x"
            domain={[0.6, 8.4]}
            ticks={xTicks}
            tickFormatter={(value: number) => `W${value}`}
            axisLine={{ stroke: "var(--creed-border-strong)" }}
            tickLine={false}
            tickMargin={10}
            interval={0}
          />
          <YAxis
            type="number"
            dataKey="minutes"
            domain={yDomain}
            ticks={yTicks}
            tickFormatter={(value: number) => `${value}`}
            axisLine={{ stroke: "var(--creed-border-strong)" }}
            tickLine={false}
            tickMargin={8}
            width={38}
          />
          <ChartTooltip
            cursor={false}
            isAnimationActive={false}
            content={<TaxTooltip />}
          />
          {SERIES.map((series) => (
            <Scatter
              key={series.key}
              name={series.label}
              data={series.points.map((point) => ({
                ...point,
                label: series.label,
                color: series.color,
              }))}
              fill={series.color}
              line={{ stroke: series.color, strokeWidth: 2 }}
              lineType="joint"
              shape={<TaxPointShape />}
              isAnimationActive
              animationDuration={700}
              animationEasing="ease-out"
            />
          ))}
        </ScatterChart>
      </ChartContainer>
    </div>
  );
}
