"use client";

import {
  ReferenceArea,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import generatedChartData from "@/bench/generated/chart-data.json";

type BenchPoint = {
  effort: "low" | "medium" | "high";
  averageCostUsd: number;
  runCostUsd: number;
  score: number;
  passPower3: number;
  tokens: number;
  runTokens: number;
};

type BenchSeries = {
  modelId: string;
  model: string;
  provider: string;
  color: string;
  benchmarkVersion: string;
  completedAt: string;
  points: BenchPoint[];
};

const CHART_SERIES = generatedChartData as BenchSeries[];
const allPoints = CHART_SERIES.flatMap((series) => series.points);
const positiveCosts = allPoints
  .map((point) => point.averageCostUsd)
  .filter((cost) => cost > 0);
if (!positiveCosts.length) positiveCosts.push(0.01, 0.1);
const minimumCost = Math.min(...positiveCosts);
const maximumCost = Math.max(...positiveCosts);
const xDomain: [number, number] = [
  minimumCost * 0.42,
  Math.max(0.1, maximumCost),
];
const xTicks = Array.from({ length: 7 }, (_, index) => {
  const progress = index / 6;
  return xDomain[0] * (xDomain[1] / xDomain[0]) ** progress;
});
const yDomain: [number, number] = [0, 100];
const yTicks = Array.from(
  { length: (yDomain[1] - yDomain[0]) / 10 + 1 },
  (_, index) => yDomain[0] + index * 10,
);
// Top-right quarter on the reversed cost axis: cheaper costs + higher scores.
const goodCostMax = Math.sqrt(xDomain[0] * xDomain[1]);
const goodScoreMin = (yDomain[0] + yDomain[1]) / 2;
const benchmarkVersion =
  CHART_SERIES.find((series) => series.benchmarkVersion)?.benchmarkVersion ??
  "1.0.0";

function formatCostTick(value: number) {
  if (value < 0.01) return `$${value.toFixed(3)}`;
  if (value < 0.1) return `$${value.toFixed(3)}`;
  if (value < 1) return `$${value.toFixed(2)}`;
  if (value < 10) return `$${value.toFixed(1)}`;
  return `$${value.toFixed(0)}`;
}

function formatCostValue(value: number) {
  return `$${value.toFixed(value < 0.1 ? 3 : 2)}`;
}

function seriesSummary(series: BenchSeries) {
  const averageCostUsd =
    series.points.reduce((sum, point) => sum + point.averageCostUsd, 0) /
    Math.max(1, series.points.length);
  return {
    averageCostUsd,
    runCostUsd: series.points[0]?.runCostUsd ?? 0,
    runTokens: series.points[0]?.runTokens ?? 0,
  };
}

const chartConfig = Object.fromEntries(
  CHART_SERIES.map((series) => [
    series.model,
    { label: series.model, color: series.color },
  ]),
) satisfies ChartConfig;

type TooltipEntry = {
  payload?: BenchPoint & { model?: string; color?: string };
};

function BenchTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
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
          {point.model}
        </p>
      </div>
      <p className="mt-1 text-[12px] text-[var(--creed-text-tertiary)]">
        {point.effort.charAt(0).toUpperCase() + point.effort.slice(1)} effort
      </p>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 border-t border-[var(--creed-border)] pt-3 text-[12px]">
        <span className="text-[var(--creed-text-secondary)]">Score</span>
        <span className="text-right font-mono font-medium tabular-nums text-[var(--creed-text-primary)]">
          {point.score}%
        </span>
        <span className="text-[var(--creed-text-secondary)]">Average cost</span>
        <span className="text-right font-mono tabular-nums text-[var(--creed-text-primary)]">
          {formatCostValue(point.averageCostUsd)}
        </span>
      </div>
    </div>
  );
}

function LegendCostTooltip({ series }: { series: BenchSeries }) {
  const summary = seriesSummary(series);
  return (
    <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 hidden w-max -translate-x-1/2 animate-in rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-3 shadow-[0_12px_30px_rgba(28,28,26,0.10)] fade-in-0 zoom-in-95 duration-150 group-hover:block">
      <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-[12px]">
        <span className="text-[var(--creed-text-secondary)]">Average cost</span>
        <span className="text-right font-mono tabular-nums text-[var(--creed-text-primary)]">
          {formatCostValue(summary.averageCostUsd)}
        </span>
        <span className="text-[var(--creed-text-secondary)]">Total cost</span>
        <span className="text-right font-mono tabular-nums text-[var(--creed-text-primary)]">
          ${summary.runCostUsd.toFixed(2)}
        </span>
        <span className="text-[var(--creed-text-secondary)]">Total tokens</span>
        <span className="text-right font-mono tabular-nums text-[var(--creed-text-primary)]">
          {summary.runTokens.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function BenchPointShape({
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

export function CreedBenchChart() {
  return (
    <div>
      <div className="mb-1 flex flex-col gap-4 text-left sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[20px] font-medium tracking-[-0.02em] text-[var(--creed-text-primary)] sm:text-[24px]">
            Personal context use by cost
          </h2>
          <p className="mt-1 text-[13px] text-[var(--creed-text-secondary)]">
            Pass@1 vs average cost per task · Creed Bench v{benchmarkVersion}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-x-4 gap-y-2 sm:justify-end">
          {CHART_SERIES.map((series) => (
            <div
              key={series.model}
              className="group relative flex items-center gap-1.5 text-[12px] text-[var(--creed-text-secondary)]"
            >
              <LegendCostTooltip series={series} />
              <span
                className="h-2.5 w-2.5 rounded-[3px] transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-150"
                style={{ backgroundColor: series.color }}
              />
              <span className="transition-colors duration-150 group-hover:text-[var(--creed-text-primary)]">
                {series.model}
              </span>
            </div>
          ))}
        </div>
      </div>

      {CHART_SERIES.length ? (
        <ChartContainer
          config={chartConfig}
          initialDimension={{ width: 800, height: 520 }}
          className="h-[430px] w-full min-w-0 aspect-auto [&_.recharts-wrapper]:outline-none [&_.recharts-wrapper_*]:outline-none sm:h-[520px]"
        >
          <ScatterChart margin={{ top: 12, right: 40, bottom: 20, left: 4 }}>
            <ReferenceArea
              x1={xDomain[0]}
              x2={goodCostMax}
              y1={goodScoreMin}
              y2={yDomain[1]}
              fill="rgba(37, 99, 235, 0.12)"
              stroke="#2563EB"
              strokeOpacity={0.55}
              strokeDasharray="5 5"
              strokeWidth={1.25}
              ifOverflow="visible"
            />
            {/* Frame closes only outside the good zone; blue dotted border takes over. */}
            <ReferenceLine
              segment={[
                { x: xDomain[1], y: yDomain[1] },
                { x: goodCostMax, y: yDomain[1] },
              ]}
              stroke="var(--creed-border-strong)"
              strokeWidth={1}
            />
            <ReferenceLine
              segment={[
                { x: xDomain[0], y: yDomain[0] },
                { x: xDomain[0], y: goodScoreMin },
              ]}
              stroke="var(--creed-border-strong)"
              strokeWidth={1}
            />
            <XAxis
              type="number"
              dataKey="averageCostUsd"
              scale="log"
              reversed
              domain={xDomain}
              ticks={xTicks}
              tickFormatter={formatCostTick}
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
              content={<BenchTooltip />}
            />
            {[...CHART_SERIES]
              .sort((a, b) => {
                const mean = (series: BenchSeries) =>
                  series.points.reduce(
                    (sum, point) => sum + point.averageCostUsd,
                    0,
                  ) /
                  Math.max(1, series.points.length);
                return mean(a) - mean(b);
              })
              .map((series) => {
              const data = series.points.map((point) => ({
                ...point,
                model: series.model,
                color: series.color,
              }));
              return (
                <Scatter
                  key={series.model}
                  name={series.model}
                  data={data}
                  fill={series.color}
                  line={{ stroke: series.color, strokeWidth: 2 }}
                  lineType="joint"
                  shape={<BenchPointShape />}
                  isAnimationActive
                  animationDuration={700}
                  animationEasing="ease-out"
                />
              );
            })}
          </ScatterChart>
        </ChartContainer>
      ) : (
        <div className="flex h-[320px] flex-col items-center justify-center border-b border-[var(--creed-border)] text-center">
          <p className="text-[14px] font-medium text-[var(--creed-text-secondary)]">
            No official results yet
          </p>
          <p className="mt-1 max-w-sm text-[13px] leading-6 text-[var(--creed-text-tertiary)]">
            Results appear only after the complete 24-task suite passes
            validation and runs three times at every effort level.
          </p>
        </div>
      )}
    </div>
  );
}
