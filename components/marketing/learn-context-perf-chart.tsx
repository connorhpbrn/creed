"use client";

import { Scatter, ScatterChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";

// Illustrative with/without scores for the learn page. Not a formal benchmark.
const TASKS = [
  { task: "Tone match", x: 0, without: 44, with: 89 },
  { task: "First try", x: 1, without: 51, with: 86 },
  { task: "Fewer asks", x: 2, without: 39, with: 81 },
  { task: "Consistency", x: 3, without: 28, with: 92 },
] as const;

const SERIES = [
  {
    key: "without",
    label: "Without context",
    color: "#DC2626",
    blurb: "Cold start in every chat and tool.",
    points: TASKS.map((row) => ({
      x: row.x,
      task: row.task,
      score: row.without,
    })),
  },
  {
    key: "with",
    label: "With personal context",
    color: "#2563EB",
    blurb: "Same profile read before every answer.",
    points: TASKS.map((row) => ({
      x: row.x,
      task: row.task,
      score: row.with,
    })),
  },
] as const;

const chartConfig = Object.fromEntries(
  SERIES.map((series) => [
    series.key,
    { label: series.label, color: series.color },
  ]),
) satisfies ChartConfig;

const yDomain: [number, number] = [0, 100];
const yTicks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const xTicks = TASKS.map((row) => row.x);

type TooltipPoint = {
  task?: string;
  score?: number;
  label?: string;
  color?: string;
};

function PerfTooltip({
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
        {point.task}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 border-t border-[var(--creed-border)] pt-3 text-[12px]">
        <span className="text-[var(--creed-text-secondary)]">Score</span>
        <span className="text-right font-mono font-medium tabular-nums text-[var(--creed-text-primary)]">
          {point.score}%
        </span>
      </div>
    </div>
  );
}

function seriesAverage(points: readonly { score: number }[]) {
  return Math.round(
    points.reduce((sum, point) => sum + point.score, 0) / points.length,
  );
}

function LegendTooltip({
  series,
}: {
  series: (typeof SERIES)[number];
}) {
  return (
    <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 hidden w-max max-w-[220px] -translate-x-1/2 animate-in rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-3 shadow-[0_12px_30px_rgba(28,28,26,0.10)] fade-in-0 zoom-in-95 duration-150 group-hover:block">
      <p className="text-[12px] leading-5 text-[var(--creed-text-secondary)]">
        {series.blurb}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 border-t border-[var(--creed-border)] pt-3 text-[12px]">
        <span className="text-[var(--creed-text-secondary)]">Avg score</span>
        <span className="text-right font-mono font-medium tabular-nums text-[var(--creed-text-primary)]">
          {seriesAverage(series.points)}%
        </span>
      </div>
    </div>
  );
}

function PerfPointShape({
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

export function LearnContextPerfChart() {
  return (
    <div className="mt-10">
      <div className="mb-1 flex flex-col gap-4 text-left sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-[20px] font-medium tracking-[-0.02em] text-[var(--creed-text-primary)] sm:text-[24px]">
            With vs without personal context
          </h3>
          <p className="mt-1 text-[13px] text-[var(--creed-text-secondary)]">
            Illustrative · not a formal benchmark
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
            domain={[-0.35, 3.35]}
            ticks={xTicks}
            tickFormatter={(value: number) => TASKS[value]?.task ?? ""}
            axisLine={{ stroke: "var(--creed-border-strong)" }}
            tickLine={false}
            tickMargin={10}
            interval={0}
          />
          <YAxis
            type="number"
            dataKey="score"
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
            content={<PerfTooltip />}
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
              shape={<PerfPointShape />}
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
