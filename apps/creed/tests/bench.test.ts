import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  formatOfficialPreview,
  parseCliArgs,
} from "../bench/cli.ts";
import {
  configurationsMatch,
  resolveChartSeries,
} from "../bench/artifacts.ts";
import { aggregateTrials, gradeTrial } from "../bench/grader.ts";
import { CreedBenchSimulator } from "../bench/simulator.ts";
import { BENCH_TASKS } from "../bench/tasks.ts";
import { CREED_BENCH_TOOL_NAMES } from "../bench/tool-contract.ts";
import {
  BENCHMARK_VERSION,
  type BenchChartSeries,
  type BenchTrial,
} from "../bench/types.ts";

function readArguments(tool: string, taskId: string) {
  if (tool === "read_creed") return { agentName: "Reference agent" };
  if (tool === "creed_get_section") {
    if (taskId === "avoid-duplicate-proposal") return { sectionId: "goals" };
    if (taskId === "quality-targeted-maintenance") return { sectionId: "routines" };
    return { sectionId: "preferences" };
  }
  if (tool === "creed_search") {
    return { query: taskId === "delete-obsolete-section" ? "conference" : "software" };
  }
  return {};
}

function referenceMutation(
  task: (typeof BENCH_TASKS)[number],
): { name: string; arguments: Record<string, unknown> } | null {
  const expected = task.expectedMutation;
  if (!expected) return null;
  const content = expected.contentTermGroups
    ?.map((group) => group[0])
    .join(". ") ?? "";
  if (task.id === "legacy-direct-adapter") {
    return {
      name: "direct_edit_creed",
      arguments: {
        agentName: "Reference agent",
        operation: "append_to_section",
        sectionId: expected.sectionId,
        contentMarkdown: content,
      },
    };
  }
  if (task.id === "legacy-proposal-adapter") {
    return {
      name: "propose_creed_update",
      arguments: {
        agentName: "Reference agent",
        sectionId: expected.sectionId,
        sectionName: "Old notes",
        draft: { kind: "rename-section", name: expected.name },
      },
    };
  }
  const common = { sectionId: expected.sectionId };
  if (expected.operation === "append") {
    return {
      name: "creed_append_to_section",
      arguments: { ...common, contentMarkdown: content },
    };
  }
  if (expected.operation === "update") {
    const existing = task.initialWorld.sections.find(
      (section) => section.id === expected.sectionId,
    )?.contentMarkdown;
    return {
      name: "creed_update_section",
      arguments: { ...common, contentMarkdown: `${existing ?? ""}\n${content}` },
    };
  }
  if (expected.operation === "create") {
    return {
      name: "creed_create_section",
      arguments: {
        name: expected.name,
        contentMarkdown: content,
        accent: expected.accent ?? "custom",
      },
    };
  }
  if (expected.operation === "delete") {
    return { name: "creed_delete_section", arguments: common };
  }
  if (expected.operation === "rename") {
    return {
      name: "creed_rename_section",
      arguments: { ...common, name: expected.name },
    };
  }
  if (expected.operation === "recolor") {
    return {
      name: "creed_recolor_section",
      arguments: { ...common, accent: expected.accent },
    };
  }
  return {
    name: "creed_reorder_section",
    arguments: {
      ...common,
      ...(expected.position
        ? { position: expected.position }
        : { afterSectionId: expected.afterSectionId }),
    },
  };
}

test("suite has the intended task mix and unique ids", () => {
  assert.equal(BENCH_TASKS.length, 24);
  assert.equal(new Set(BENCH_TASKS.map((task) => task.id)).size, 24);
  assert.equal(BENCH_TASKS.filter((task) => task.family === "single-tool").length, 8);
  assert.equal(BENCH_TASKS.filter((task) => task.family === "multi-tool").length, 10);
  assert.equal(BENCH_TASKS.filter((task) => task.family === "adversarial").length, 6);
});

test("every MCP tool is covered by at least one task", () => {
  const covered = new Set(BENCH_TASKS.flatMap((task) => task.toolsCovered));
  assert.deepEqual(
    CREED_BENCH_TOOL_NAMES.filter((name) => !covered.has(name)),
    [],
  );
});

test("benchmark tool names stay in sync with the production MCP route", () => {
  const route = readFileSync(new URL("../app/mcp/route.ts", import.meta.url), "utf8");
  const productionBlock = route.slice(
    route.indexOf("const tools = ["),
    route.indexOf("// Conditional tool exposure."),
  );
  const names = [...productionBlock.matchAll(/name:\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(CREED_BENCH_TOOL_NAMES, names);
});

test("every task has a known passing reference trajectory", async () => {
  for (const task of BENCH_TASKS) {
    const simulator = new CreedBenchSimulator(task.initialWorld);
    const mutation = referenceMutation(task);
    let turn = 1;
    for (const tool of task.requiredTools) {
      if (tool === mutation?.name) continue;
      await simulator.call(tool, readArguments(tool, task.id), turn);
      turn += 1;
    }
    if (mutation) {
      await simulator.call(mutation.name, mutation.arguments, turn);
    }
    const answer = task.answerTermGroups.map((group) => group[0]).join(". ") || "Done.";
    const trial = gradeTrial(task, {
      taskId: task.id,
      taskTitle: task.title,
      family: task.family,
      difficulty: task.difficulty,
      effort: "medium",
      repetition: 1,
      requestedModelId: "reference/agent",
      resolvedModelId: "reference/agent",
      provider: "reference",
      finalAnswer: answer,
      trace: simulator.trace,
      mutations: simulator.mutations,
      initialWorld: simulator.initialWorld,
      finalWorld: simulator.world,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationMs: 0,
      error: null,
    });
    assert.equal(
      trial.success,
      true,
      `${task.id}: ${trial.checks.filter((check) => !check.passed).map((check) => check.id).join(", ")}`,
    );
  }
});

test("append preserves existing content in direct mode", async () => {
  const task = BENCH_TASKS.find((item) => item.id === "append-durable-preference");
  assert.ok(task);
  const simulator = new CreedBenchSimulator(task.initialWorld);
  await simulator.call(
    "creed_append_to_section",
    { sectionId: "preferences", contentMarkdown: "- Include keyboard shortcuts." },
    1,
  );
  const section = simulator.world.sections.find((item) => item.id === "preferences");
  assert.match(section?.contentMarkdown ?? "", /recommendation first/);
  assert.match(section?.contentMarkdown ?? "", /keyboard shortcuts/);
  assert.equal(simulator.mutations[0]?.mode, "direct");
});

test("proposal mode records intent without mutating state", async () => {
  const task = BENCH_TASKS.find((item) => item.id === "proposal-only-write");
  assert.ok(task);
  const simulator = new CreedBenchSimulator(task.initialWorld);
  const before = structuredClone(simulator.world);
  await simulator.call(
    "creed_append_to_section",
    { sectionId: "work", contentMarkdown: "- Four-day week, Monday to Thursday." },
    1,
  );
  assert.deepEqual(simulator.world, before);
  assert.equal(simulator.mutations[0]?.mode, "proposal");
});

test("grader accepts an equivalent outcome and rejects extra writes", () => {
  const task = BENCH_TASKS.find((item) => item.id === "append-durable-preference");
  assert.ok(task);
  const base = {
    taskId: task.id,
    taskTitle: task.title,
    family: task.family,
    difficulty: task.difficulty,
    effort: "medium" as const,
    repetition: 1,
    requestedModelId: "test/model",
    resolvedModelId: "test/model",
    provider: "test",
    finalAnswer: "Saved the keyboard shortcut preference.",
    trace: [
      { turn: 1, name: "read_creed", arguments: {}, result: {}, error: null },
      {
        turn: 2,
        name: "creed_append_to_section",
        arguments: {
          sectionId: "preferences",
          contentMarkdown: "- Always include keyboard shortcuts.",
        },
        result: { ok: true },
        error: null,
      },
    ],
    mutations: [
      {
        tool: "creed_append_to_section",
        operation: "append" as const,
        sectionId: "preferences",
        mode: "direct" as const,
        contentTermGroups: [["keyboard shortcuts"]],
        arguments: {
          sectionId: "preferences",
          contentMarkdown: "- Always include keyboard shortcuts.",
        },
      },
    ],
    initialWorld: task.initialWorld,
    finalWorld: task.initialWorld,
    inputTokens: 10,
    outputTokens: 10,
    costUsd: 0.01,
    durationMs: 10,
    error: null,
  };
  const passed = gradeTrial(task, base);
  assert.equal(passed.success, true);
  const failed = gradeTrial(task, {
    ...base,
    mutations: [
      ...base.mutations,
      { ...base.mutations[0], operation: "delete" as const, sectionId: "goals" },
    ],
  });
  assert.equal(
    failed.checks.find((check) => check.id === "single-sharp-mutation")?.passed,
    false,
  );
  const failedToolCall = gradeTrial(task, {
    ...base,
    trace: base.trace.map((entry, index) =>
      index === 0 ? { ...entry, error: "Synthetic read failure" } : entry,
    ),
  });
  assert.equal(failedToolCall.success, false);
  assert.equal(
    failedToolCall.checks.find((check) => check.id === "required:read_creed")
      ?.passed,
    false,
  );
  const ungroundedAnswer = gradeTrial(task, {
    ...base,
    finalAnswer: "Done.",
  });
  assert.equal(ungroundedAnswer.success, false);
  assert.equal(
    ungroundedAnswer.checks.find((check) => check.id === "answer-grounding")
      ?.passed,
    false,
  );
});

test("aggregation distinguishes pass@1 from pass^3", () => {
  const template = {
    taskId: "task",
    taskTitle: "Task",
    family: "single-tool" as const,
    difficulty: 1 as const,
    effort: "medium" as const,
    requestedModelId: "test/model",
    resolvedModelId: "test/model",
    provider: "test",
    finalAnswer: "Done",
    trace: [],
    mutations: [],
    initialWorld: BENCH_TASKS[0].initialWorld,
    finalWorld: BENCH_TASKS[0].initialWorld,
    checks: [],
    scores: {
      judgment: 100,
      toolUse: 100,
      maintenance: 100,
      formatting: 100,
      application: 100,
      recovery: 100,
    },
    inputTokens: 1,
    outputTokens: 1,
    costUsd: 0.01,
    durationMs: 1,
    error: null,
  };
  const trials = [true, true, false].map(
    (success, index) =>
      ({ ...template, success, repetition: index + 1 }) satisfies BenchTrial,
  );
  const aggregate = aggregateTrials(trials);
  assert.equal(aggregate.passAt1, 1);
  assert.equal(aggregate.passPower3, 0);
});

test("CLI accepts positional model ids and official matrix defaults", () => {
  const options = parseCliArgs([
    "openai/gpt-5.6-sol,x-ai/grok-4.5",
    "--official",
  ]);
  assert.deepEqual(options.models, ["openai/gpt-5.6-sol", "x-ai/grok-4.5"]);
  assert.deepEqual(options.efforts, ["low", "medium", "high"]);
  assert.equal(options.repetitions, 3);
  assert.equal(options.official, true);
});

test("official runs cannot be narrowed by later flags", () => {
  const options = parseCliArgs([
    "openai/gpt-5.6-sol",
    "--official",
    "--effort",
    "low",
    "--trials",
    "1",
  ]);
  assert.deepEqual(options.efforts, ["low", "medium", "high"]);
  assert.equal(options.repetitions, 3);
  assert.throws(
    () =>
      parseCliArgs([
        "openai/gpt-5.6-sol",
        "--official",
        "--task",
        "write-policy",
      ]),
    /full task suite/,
  );
});

test("CLI keeps --model as a compatibility alias", () => {
  const options = parseCliArgs(["--model", "anthropic/claude-opus-5", "--task", "write-policy"]);
  assert.deepEqual(options.models, ["anthropic/claude-opus-5"]);
  assert.deepEqual(options.taskIds, ["write-policy"]);
});

test("official preview reports trial count and cost bounds", () => {
  const preview = formatOfficialPreview({
    models: ["openai/gpt-5.6-sol"],
    taskCount: 24,
    efforts: ["low", "medium", "high"],
    repetitions: 3,
  });
  assert.match(preview, /216 paid trials/);
  assert.match(preview, /Estimated cost: ~\$2–\$22/);
  assert.match(preview, /--official --yes/);
});

test("chart generation replaces the active version from local results", () => {
  const existing: BenchChartSeries[] = [
    {
      modelId: "existing/model",
      model: "Existing Model",
      provider: "Existing",
      color: "#000000",
      benchmarkVersion: BENCHMARK_VERSION,
      completedAt: "2026-01-01T00:00:00.000Z",
      points: [],
    },
    {
      modelId: "legacy/model",
      model: "Legacy Model",
      provider: "Legacy",
      color: "#111111",
      benchmarkVersion: "0.9.0",
      completedAt: "2026-01-01T00:00:00.000Z",
      points: [],
    },
  ];
  const generated = [
    {
      ...existing[0],
      modelId: "new/model",
      model: "New Model",
      completedAt: "2026-02-01T00:00:00.000Z",
    },
  ];
  assert.deepEqual(resolveChartSeries(existing, generated), generated);
  assert.deepEqual(resolveChartSeries(existing, []), [existing[0]]);
});

test("checkpoint configuration matching rejects incompatible resumes", () => {
  const base = {
    efforts: ["low", "medium", "high"] as Array<"low" | "medium" | "high">,
    repetitions: 3,
    taskIds: BENCH_TASKS.map((task) => task.id),
  };
  assert.equal(
    configurationsMatch(base, {
      efforts: [...base.efforts],
      repetitions: 3,
      taskIds: [...base.taskIds],
    }),
    true,
  );
  assert.equal(
    configurationsMatch(base, {
      ...base,
      repetitions: 1,
    }),
    false,
  );
});

test("CLI rejects combining --resume and --fresh", () => {
  assert.throws(
    () => parseCliArgs(["openai/gpt-5.6-sol", "--resume", "--fresh"]),
    /either --resume or --fresh/,
  );
});

test("targeted section reads may also call read_creed", () => {
  const task = BENCH_TASKS.find((item) => item.id === "targeted-section-read");
  assert.ok(task);
  assert.equal(task.forbiddenTools.includes("read_creed"), false);
  assert.deepEqual(task.requiredTools, ["creed_get_section"]);
});
