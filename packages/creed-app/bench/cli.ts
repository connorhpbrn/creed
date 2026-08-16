import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  clearCheckpoint,
  configurationsMatch,
  generateChartData,
  pruneBenchArtifacts,
  readCheckpoint,
  regradeBenchResults,
  writeBenchResult,
  writeCheckpoint,
  type CheckpointConfiguration,
} from "./artifacts.ts";
import { aggregateTrials } from "./grader.ts";
import { runBenchTrial } from "./runner.ts";
import { BENCH_TASKS, selectBenchTasks } from "./tasks.ts";
import {
  BENCHMARK_VERSION,
  RESULT_SCHEMA_VERSION,
  type BenchEffort,
  type BenchResult,
  type BenchTrial,
} from "./types.ts";

const execFileAsync = promisify(execFile);

/** Conservative bounds from observed official runs (Claude ~$0.07/trial). */
const COST_PER_TRIAL_LOW_USD = 0.01;
const COST_PER_TRIAL_HIGH_USD = 0.1;

type CliOptions = {
  models: string[];
  efforts: BenchEffort[];
  repetitions: number;
  taskIds: string[];
  official: boolean;
  yes: boolean;
  list: boolean;
  generate: boolean;
  prune: boolean;
  regrade: boolean;
  resume: boolean;
  fresh: boolean;
  dryRun: boolean;
};

function valuesAfter(args: string[], index: number) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${args[index]} needs a value`);
  return value;
}

function pushModels(target: string[], value: string) {
  target.push(
    ...value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function looksLikeModelId(value: string) {
  return !value.startsWith("-") && value.includes("/");
}

export function parseCliArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    models: [],
    efforts: ["medium"],
    repetitions: 1,
    taskIds: [],
    official: false,
    yes: false,
    list: false,
    generate: false,
    prune: false,
    regrade: false,
    resume: false,
    fresh: false,
    dryRun: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--model" || arg === "--models") {
      pushModels(options.models, valuesAfter(args, index));
      index += 1;
    } else if (arg === "--effort") {
      const effort = valuesAfter(args, index);
      if (!["low", "medium", "high"].includes(effort)) {
        throw new Error(`Invalid effort "${effort}"`);
      }
      options.efforts = [effort as BenchEffort];
      index += 1;
    } else if (arg === "--trials") {
      options.repetitions = Number(valuesAfter(args, index));
      if (!Number.isInteger(options.repetitions) || options.repetitions < 1 || options.repetitions > 10) {
        throw new Error("--trials must be an integer from 1 to 10");
      }
      index += 1;
    } else if (arg === "--case" || arg === "--task") {
      options.taskIds.push(...valuesAfter(args, index).split(",").map((value) => value.trim()).filter(Boolean));
      index += 1;
    } else if (arg === "--official") {
      options.official = true;
      options.efforts = ["low", "medium", "high"];
      options.repetitions = 3;
    } else if (arg === "--yes") {
      options.yes = true;
    } else if (arg === "--list") {
      options.list = true;
    } else if (arg === "--generate") {
      options.generate = true;
    } else if (arg === "--prune") {
      options.prune = true;
    } else if (arg === "--regrade") {
      options.regrade = true;
    } else if (arg === "--resume") {
      options.resume = true;
    } else if (arg === "--fresh") {
      options.fresh = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (looksLikeModelId(arg) || arg.includes(",")) {
      pushModels(options.models, arg);
    } else {
      throw new Error(`Unknown option "${arg}"`);
    }
  }
  if (options.resume && options.fresh) {
    throw new Error("Use either --resume or --fresh, not both");
  }
  if (options.official) {
    if (options.taskIds.length) {
      throw new Error("--official always runs the full task suite; remove --task/--case");
    }
    options.efforts = ["low", "medium", "high"];
    options.repetitions = 3;
  }
  return options;
}

export function estimateRunCostUsd(trialCount: number) {
  return {
    low: trialCount * COST_PER_TRIAL_LOW_USD,
    high: trialCount * COST_PER_TRIAL_HIGH_USD,
  };
}

export function formatOfficialPreview(options: {
  models: string[];
  taskCount: number;
  efforts: BenchEffort[];
  repetitions: number;
}) {
  const trialCount =
    options.models.length * options.taskCount * options.efforts.length * options.repetitions;
  const cost = estimateRunCostUsd(trialCount);
  return [
    `Official run: ${options.models.length} model(s) · ${options.taskCount} tasks · ${options.efforts.length} efforts · ${options.repetitions} trials each = ${trialCount} paid trials`,
    `Estimated cost: ~$${cost.low.toFixed(0)}–$${cost.high.toFixed(0)}`,
    "Re-run with --official --yes to confirm.",
  ].join("\n");
}

async function localEnv(name: string) {
  if (process.env[name]) return process.env[name];
  try {
    const source = await readFile(".env.local", "utf8");
    const match = source.match(new RegExp(`^${name}\\s*=\\s*(.*)$`, "m"));
    if (!match) return undefined;
    return match[1].trim().replace(/^(['"])(.*)\1$/, "$2");
  } catch {
    return undefined;
  }
}

async function runnerCommit() {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function assertCleanWorktreeForOfficial() {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"]);
    if (stdout.trim()) {
      throw new Error(
        "Official runs require a clean git worktree so runnerCommit matches the code that produced the scores. Commit or stash first.",
      );
    }
  } catch (cause) {
    if (
      cause instanceof Error &&
      cause.message.startsWith("Official runs require a clean git worktree")
    ) {
      throw cause;
    }
    throw new Error("Official runs require a readable git worktree.");
  }
}

function trialKey(trial: Pick<BenchTrial, "taskId" | "effort" | "repetition">) {
  return `${trial.taskId}:${trial.effort}:${trial.repetition}`;
}

function line(value = "") {
  process.stdout.write(`${value}\n`);
}

export async function resolveCheckpointTrials(
  modelId: string,
  configuration: CheckpointConfiguration,
  options: Pick<CliOptions, "fresh" | "resume">,
) {
  const checkpoint = await readCheckpoint(modelId);
  if (!checkpoint) return [] as BenchTrial[];
  if (options.fresh) {
    await clearCheckpoint(modelId);
    return [];
  }
  if (!configurationsMatch(checkpoint.configuration, configuration)) {
    throw new Error(
      `Checkpoint for ${modelId} does not match this run's efforts/tasks/trials. Re-run with matching flags or pass --fresh to discard it.`,
    );
  }
  // Matching checkpoints resume automatically so a crash recovery cannot
  // silently overwrite paid progress. --resume remains a documented alias.
  void options.resume;
  return checkpoint.trials;
}

async function runModel(
  modelId: string,
  options: CliOptions,
  apiKey: string,
): Promise<BenchResult> {
  const tasks = selectBenchTasks(options.taskIds);
  const configuration: CheckpointConfiguration = {
    efforts: options.efforts,
    repetitions: options.repetitions,
    taskIds: tasks.map((task) => task.id),
  };
  const existing = await resolveCheckpointTrials(modelId, configuration, options);
  const completedKeys = new Set(existing.map(trialKey));
  const trials: BenchTrial[] = [...existing];
  const total = tasks.length * options.efforts.length * options.repetitions;
  let completed = existing.length;
  if (existing.length) {
    line(`Resuming ${modelId} from checkpoint (${existing.length}/${total}).`);
  } else {
    line(`\n${modelId} · ${total} trials`);
  }
  for (const effort of options.efforts) {
    for (let repetition = 1; repetition <= options.repetitions; repetition += 1) {
      for (const task of tasks) {
        const key = trialKey({ taskId: task.id, effort, repetition });
        if (completedKeys.has(key)) continue;
        completed += 1;
        process.stdout.write(
          `\r[${String(completed).padStart(String(total).length)}/${total}] ${effort} · ${task.id}`.padEnd(96),
        );
        const trial = await runBenchTrial({
          apiKey,
          modelId,
          effort,
          repetition,
          task,
        });
        trials.push(trial);
        await writeCheckpoint(modelId, configuration, trials);
      }
    }
  }
  line();
  const official =
    options.official &&
    tasks.length === BENCH_TASKS.length &&
    options.efforts.length === 3 &&
    options.repetitions >= 3;
  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    benchmarkVersion: BENCHMARK_VERSION,
    runnerCommit: await runnerCommit(),
    requestedModelId: modelId,
    completedAt: new Date().toISOString(),
    status: trials.some((trial) => trial.error)
      ? "failed"
      : official
        ? "complete"
        : "provisional",
    configuration: {
      efforts: options.efforts,
      repetitions: options.repetitions,
      taskIds: tasks.map((task) => task.id),
      maxTurns: Math.max(...tasks.map((task) => task.maxTurns)),
    },
    aggregate: aggregateTrials(trials),
    trials,
  };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.list) {
    for (const task of BENCH_TASKS) {
      line(`${task.id.padEnd(34)} ${task.family.padEnd(14)} ${task.title}`);
    }
    return;
  }
  if (options.generate) {
    const series = await generateChartData();
    line(`Generated ${series.length} chart series for v${BENCHMARK_VERSION}.`);
    return;
  }
  if (options.regrade) {
    const reports = await regradeBenchResults();
    line(
      `Diagnostic regrade of ${reports.length} retained result(s). Chart unchanged; fresh official runs are required to publish.`,
    );
    for (const report of reports) {
      line(
        `${report.modelId}: pass@1 ${(report.previousPassAt1 * 100).toFixed(1)}% → ${(report.passAt1 * 100).toFixed(1)}% · pass^3 ${(report.passPower3 * 100).toFixed(1)}%`,
      );
      line(report.path);
    }
    return;
  }
  if (options.prune) {
    const report = await pruneBenchArtifacts();
    line(
      `Retained ${report.retainedResults} official and ${report.retainedRuns} recent local trace(s); deleted ${report.deletedResults + report.deletedRuns}.`,
    );
    return;
  }
  if (!options.models.length) {
    throw new Error("Pass a model id, e.g. npm run bench -- openai/gpt-5.6-sol");
  }
  const tasks = selectBenchTasks(options.taskIds);
  const trialCount =
    options.models.length * tasks.length * options.efforts.length * options.repetitions;
  line(
    `Creed Bench v${BENCHMARK_VERSION}: ${options.models.length} model(s), ${tasks.length} tasks, ${trialCount} trials.`,
  );
  if (options.official && !options.yes) {
    line(
      formatOfficialPreview({
        models: options.models,
        taskCount: tasks.length,
        efforts: options.efforts,
        repetitions: options.repetitions,
      }),
    );
    process.exitCode = 1;
    return;
  }
  if (options.official) await assertCleanWorktreeForOfficial();
  if (options.dryRun) return;
  const apiKey =
    (await localEnv("OPENROUTER_API_KEY")) ??
    (await localEnv("OPENROUTER_PLATFORM_KEY"));
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set in the environment or .env.local");
  for (const modelId of options.models) {
    const result = await runModel(modelId, options, apiKey);
    const path = await writeBenchResult(result);
    await clearCheckpoint(modelId);
    line(
      `${result.status}: pass@1 ${(result.aggregate.passAt1 * 100).toFixed(1)}% · pass^3 ${(result.aggregate.passPower3 * 100).toFixed(1)}% · $${result.aggregate.totalCostUsd.toFixed(4)}`,
    );
    line(path);
  }
  await generateChartData();
  await pruneBenchArtifacts();
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : "Unknown benchmark failure";
    process.stderr.write(`Creed Bench: ${message}\n`);
    process.exitCode = 1;
  });
}
