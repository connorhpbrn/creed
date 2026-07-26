import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { aggregateTrials, gradeTrial } from "./grader.ts";
import { BENCH_TASKS } from "./tasks.ts";
import {
  BENCHMARK_VERSION,
  type BenchChartSeries,
  type BenchEffort,
  type BenchResult,
  type BenchTrial,
} from "./types.ts";

export const RESULTS_DIRECTORY = join(process.cwd(), "bench", "results");
export const LOCAL_RUNS_DIRECTORY = join(process.cwd(), "bench", "runs");
export const CHART_DATA_PATH = join(
  process.cwd(),
  "bench",
  "generated",
  "chart-data.json",
);
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const LOCAL_RUN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// Landing / Creed accent palette (saturated, not pastel).
const COLORS = ["#2563EB", "#EA580C", "#EAB308", "#EC4899", "#059669", "#7C3AED"];

const MODEL_COLORS: Record<string, string> = {
  "openai/gpt-5.6-sol": "#2563EB",
  "anthropic/claude-opus-5": "#EA580C",
  "x-ai/grok-4.5": "#EAB308",
  "moonshotai/kimi-k3": "#EC4899",
  "z-ai/glm-5.2": "#059669",
};

export type CheckpointConfiguration = {
  efforts: BenchEffort[];
  repetitions: number;
  taskIds: string[];
};

export type BenchCheckpoint = {
  modelId: string;
  benchmarkVersion: string;
  configuration: CheckpointConfiguration;
  trials: BenchTrial[];
};

function colorForModel(modelId: string, index: number) {
  return MODEL_COLORS[modelId] ?? COLORS[index % COLORS.length];
}

export function safeModelName(modelId: string) {
  return modelId.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-|-$/g, "");
}

function displayModelName(modelId: string) {
  const raw = modelId.split("/").at(-1) ?? modelId;
  return raw
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (/^gpt$/i.test(part)) return "GPT";
      if (/^glm$/i.test(part)) return "GLM";
      if (/^\d+(\.\d+)?$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function checkpointPath(modelId: string) {
  return join(
    LOCAL_RUNS_DIRECTORY,
    `checkpoint-${safeModelName(modelId)}-${BENCHMARK_VERSION}.json`,
  );
}

export function configurationsMatch(
  left: CheckpointConfiguration,
  right: CheckpointConfiguration,
) {
  return (
    left.repetitions === right.repetitions &&
    left.efforts.join(",") === right.efforts.join(",") &&
    left.taskIds.join(",") === right.taskIds.join(",")
  );
}

export async function writeBenchResult(result: BenchResult) {
  const directory =
    result.status === "complete" ? RESULTS_DIRECTORY : LOCAL_RUNS_DIRECTORY;
  await mkdir(directory, { recursive: true });
  const path = join(
    directory,
    `${safeModelName(result.requestedModelId)}-${Date.now()}.json`,
  );
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`);
  return path;
}

export async function writeCheckpoint(
  modelId: string,
  configuration: CheckpointConfiguration,
  trials: BenchTrial[],
) {
  await mkdir(LOCAL_RUNS_DIRECTORY, { recursive: true });
  const payload: BenchCheckpoint = {
    modelId,
    benchmarkVersion: BENCHMARK_VERSION,
    configuration,
    trials,
  };
  await writeFile(checkpointPath(modelId), `${JSON.stringify(payload, null, 2)}\n`);
}

export async function readCheckpoint(modelId: string): Promise<BenchCheckpoint | null> {
  try {
    const payload = JSON.parse(
      await readFile(checkpointPath(modelId), "utf8"),
    ) as BenchCheckpoint;
    if (
      payload.modelId !== modelId ||
      payload.benchmarkVersion !== BENCHMARK_VERSION ||
      !payload.configuration ||
      !Array.isArray(payload.trials)
    ) {
      return null;
    }
    return payload;
  } catch (cause) {
    const code =
      typeof cause === "object" && cause !== null && "code" in cause
        ? String(cause.code)
        : "";
    if (code === "ENOENT") return null;
    throw cause;
  }
}

export async function clearCheckpoint(modelId: string) {
  try {
    await unlink(checkpointPath(modelId));
  } catch (cause) {
    const code =
      typeof cause === "object" && cause !== null && "code" in cause
        ? String(cause.code)
        : "";
    if (code !== "ENOENT") throw cause;
  }
}

async function readResultFile(path: string) {
  const source = await readFile(path);
  const decoded = path.endsWith(".gz") ? await gunzipAsync(source) : source;
  return JSON.parse(decoded.toString("utf8")) as BenchResult;
}

async function resultFiles(directory: string) {
  try {
    return (await readdir(directory))
      .filter(
        (file) =>
          (file.endsWith(".json") || file.endsWith(".json.gz")) &&
          !file.startsWith("checkpoint-"),
      )
      .sort();
  } catch (cause) {
    const code =
      typeof cause === "object" && cause !== null && "code" in cause
        ? String(cause.code)
        : "";
    if (code === "ENOENT") return [];
    throw cause;
  }
}

async function readJsonResults(directory: string) {
  return Promise.all(
    (await resultFiles(directory)).map((file) =>
      readResultFile(join(directory, file)),
    ),
  );
}

export async function loadBenchResults() {
  return readJsonResults(RESULTS_DIRECTORY);
}

function regradeTrials(trials: BenchTrial[]) {
  const tasks = new Map(BENCH_TASKS.map((task) => [task.id, task]));
  return trials.map((trial) => {
    const task = tasks.get(trial.taskId);
    if (!task) return trial;
    const { checks: _checks, scores: _scores, success: _success, ...input } =
      trial;
    return gradeTrial(task, input);
  });
}

export function buildChartSeries(results: BenchResult[]): BenchChartSeries[] {
  const latest = new Map<string, BenchResult>();
  for (const result of results) {
    if (result.status !== "complete") continue;
    if (result.benchmarkVersion !== BENCHMARK_VERSION) continue;
    const previous = latest.get(result.requestedModelId);
    if (!previous || previous.completedAt < result.completedAt) {
      latest.set(result.requestedModelId, result);
    }
  }
  return [...latest.values()].map((result, index) => {
    const points = result.configuration.efforts.map((effort: BenchEffort) => {
      const trials = result.trials.filter((trial) => trial.effort === effort);
      const aggregate = aggregateTrials(trials);
      return {
        effort,
        averageCostUsd: Number(
          (trials.length ? aggregate.totalCostUsd / trials.length : 0).toFixed(5),
        ),
        runCostUsd: Number(result.aggregate.totalCostUsd.toFixed(5)),
        score: Number((aggregate.passAt1 * 100).toFixed(1)),
        passPower3: Number((aggregate.passPower3 * 100).toFixed(1)),
        tokens: trials.length
          ? Math.round(
              trials.reduce(
                (sum, trial) => sum + trial.inputTokens + trial.outputTokens,
                0,
              ) / trials.length,
            )
          : 0,
        runTokens: result.aggregate.totalTokens,
      };
    });
    return {
      modelId: result.requestedModelId,
      model: displayModelName(
        result.trials.find((trial) => trial.resolvedModelId)?.resolvedModelId ??
          result.requestedModelId,
      ),
      provider:
        result.trials.find((trial) => trial.provider)?.provider ??
        result.requestedModelId.split("/")[0] ??
        "OpenRouter",
      color: colorForModel(result.requestedModelId, index),
      benchmarkVersion: result.benchmarkVersion,
      completedAt: result.completedAt,
      points,
    };
  });
}

export function resolveChartSeries(
  existing: BenchChartSeries[],
  generated: BenchChartSeries[],
) {
  // Local complete results fully own the active version. If none exist yet,
  // keep the committed active-version chart so clones still render.
  if (generated.length) return generated;
  return existing.filter((series) => series.benchmarkVersion === BENCHMARK_VERSION);
}

export async function generateChartData() {
  const existing = await readChartData();
  const generated = buildChartSeries(await loadBenchResults());
  const series = resolveChartSeries(existing, generated);
  await mkdir(dirname(CHART_DATA_PATH), { recursive: true });
  await writeFile(CHART_DATA_PATH, `${JSON.stringify(series, null, 2)}\n`);
  return series;
}

export type RegradeReport = {
  modelId: string;
  previousPassAt1: number;
  passAt1: number;
  passPower3: number;
  totalCostUsd: number;
  path: string;
};

/** Diagnostic only: never publishes to the public chart. */
export async function regradeBenchResults(): Promise<RegradeReport[]> {
  const results = await loadBenchResults();
  const reports: RegradeReport[] = [];
  for (const result of results) {
    const trials = regradeTrials(result.trials);
    const aggregate = aggregateTrials(trials);
    const diagnostic: BenchResult = {
      ...result,
      benchmarkVersion: BENCHMARK_VERSION,
      completedAt: new Date().toISOString(),
      status: "provisional",
      aggregate,
      trials,
    };
    const path = await writeBenchResult(diagnostic);
    reports.push({
      modelId: result.requestedModelId,
      previousPassAt1: result.aggregate.passAt1,
      passAt1: aggregate.passAt1,
      passPower3: aggregate.passPower3,
      totalCostUsd: aggregate.totalCostUsd,
      path,
    });
  }
  await pruneBenchArtifacts();
  return reports;
}

async function compressResult(path: string) {
  if (path.endsWith(".gz")) return path;
  const compressedPath = `${path}.gz`;
  await writeFile(compressedPath, await gzipAsync(await readFile(path)));
  await unlink(path);
  return compressedPath;
}

export async function pruneBenchArtifacts(now = Date.now()) {
  const resultEntries = await Promise.all(
    (await resultFiles(RESULTS_DIRECTORY)).map(async (file) => ({
      file,
      result: await readResultFile(join(RESULTS_DIRECTORY, file)),
    })),
  );
  const latestComplete = new Map<string, (typeof resultEntries)[number]>();
  for (const entry of resultEntries) {
    const key = `${entry.result.benchmarkVersion}:${entry.result.requestedModelId}`;
    const previous = latestComplete.get(key);
    if (
      entry.result.status === "complete" &&
      (!previous || previous.result.completedAt < entry.result.completedAt)
    ) {
      latestComplete.set(key, entry);
    }
  }
  const retainedResults = new Set(
    [...latestComplete.values()].map((entry) => entry.file),
  );
  for (const entry of resultEntries) {
    const path = join(RESULTS_DIRECTORY, entry.file);
    if (retainedResults.has(entry.file)) await compressResult(path);
    else await unlink(path);
  }

  let retainedRuns = 0;
  let deletedRuns = 0;
  for (const file of await resultFiles(LOCAL_RUNS_DIRECTORY)) {
    const path = join(LOCAL_RUNS_DIRECTORY, file);
    const result = await readResultFile(path);
    const completedAt = Date.parse(result.completedAt);
    if (Number.isFinite(completedAt) && now - completedAt > LOCAL_RUN_RETENTION_MS) {
      await unlink(path);
      deletedRuns += 1;
    } else {
      await compressResult(path);
      retainedRuns += 1;
    }
  }
  return {
    retainedResults: retainedResults.size,
    deletedResults: resultEntries.length - retainedResults.size,
    retainedRuns,
    deletedRuns,
  };
}

async function readChartData(): Promise<BenchChartSeries[]> {
  try {
    return JSON.parse(await readFile(CHART_DATA_PATH, "utf8")) as BenchChartSeries[];
  } catch (cause) {
    const code =
      typeof cause === "object" && cause !== null && "code" in cause
        ? String(cause.code)
        : "";
    if (code === "ENOENT") return [];
    throw cause;
  }
}
