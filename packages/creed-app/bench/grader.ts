import type { BenchResult, BenchTask, BenchTrial, MutationRecord } from "./types.ts";

function normalized(value: unknown) {
  return JSON.stringify(value).toLowerCase().replace(/\s+/g, " ");
}

function termGroupsPass(value: unknown, groups: string[][]) {
  const text = normalized(value);
  return groups.every((group) => group.some((term) => text.includes(term.toLowerCase())));
}

function mutationMatches(expected: NonNullable<BenchTask["expectedMutation"]>, actual: MutationRecord) {
  if (expected.operation !== actual.operation) return false;
  if (expected.sectionId && expected.sectionId !== actual.sectionId) return false;
  if (expected.mode && expected.mode !== actual.mode) return false;
  if (expected.name && expected.name.toLowerCase() !== actual.name?.toLowerCase()) return false;
  if (expected.accent && expected.accent !== actual.accent) return false;
  if (expected.position && expected.position !== actual.position) return false;
  if (expected.afterSectionId && expected.afterSectionId !== actual.afterSectionId) return false;
  if (
    expected.contentTermGroups &&
    !termGroupsPass(actual.arguments, expected.contentTermGroups)
  ) {
    return false;
  }
  return true;
}

function score(checks: Array<{ passed: boolean }>) {
  if (!checks.length) return 100;
  return Math.round((checks.filter((check) => check.passed).length / checks.length) * 100);
}

export function gradeTrial(
  task: BenchTask,
  input: Omit<BenchTrial, "checks" | "scores" | "success">,
): BenchTrial {
  const calls = input.trace.map((entry) => entry.name);
  const successfulCalls = input.trace
    .filter((entry) => !entry.error)
    .map((entry) => entry.name);
  const expectedMutation = task.expectedMutation
    ? input.mutations.find((mutation) => mutationMatches(task.expectedMutation!, mutation))
    : null;
  const checks: BenchTrial["checks"] = [];
  const add = (id: string, passed: boolean, detail: string, critical = true) => {
    checks.push({ id, passed, detail, critical });
  };

  for (const tool of task.requiredTools) {
    const calledSuccessfully = successfulCalls.includes(tool);
    add(
      `required:${tool}`,
      calledSuccessfully,
      calledSuccessfully
        ? `Called ${tool} successfully`
        : calls.includes(tool)
          ? `Every ${tool} call failed`
          : `Never called ${tool}`,
    );
  }
  for (const tool of task.forbiddenTools) {
    add(
      `forbidden:${tool}`,
      !calls.includes(tool),
      calls.includes(tool) ? `Called forbidden tool ${tool}` : `Avoided ${tool}`,
    );
  }
  if (task.mustReadCreed) {
    const readIndex = calls.indexOf("read_creed");
    const mutationIndex = calls.findIndex((call) =>
      input.mutations.some((mutation) => mutation.tool === call),
    );
    add(
      "read-before-write",
      readIndex >= 0 && (mutationIndex < 0 || readIndex < mutationIndex),
      "The profile must be read before meaningful mutation.",
    );
  }
  if (task.expectedMutation) {
    add(
      "expected-mutation",
      Boolean(expectedMutation),
      expectedMutation
        ? `Produced the expected ${task.expectedMutation.operation} in ${task.expectedMutation.mode ?? "valid"} mode`
        : "Did not produce the expected mutation",
    );
    add(
      "single-sharp-mutation",
      input.mutations.length === 1,
      `Produced ${input.mutations.length} mutations`,
    );
    if (task.expectedMutation.mode) {
      add(
        "policy-mode",
        input.mutations.every(
          (mutation) => mutation.mode === task.expectedMutation?.mode,
        ),
        `All mutations must use ${task.expectedMutation.mode} mode`,
      );
    }
  } else {
    add(
      "restraint",
      input.mutations.length === 0,
      input.mutations.length === 0
        ? "Made no mutation"
        : `Made ${input.mutations.length} unnecessary mutations`,
    );
  }

  const answerPresent = input.finalAnswer.trim().length > 0;
  add("answer-present", answerPresent, answerPresent ? "Returned an answer" : "Returned no answer");
  if (task.answerTermGroups.length) {
    add(
      "answer-grounding",
      termGroupsPass(input.finalAnswer, task.answerTermGroups),
      "Answer should communicate the verified outcome or relevant context.",
    );
  }
  add(
    "clean-format",
    answerPresent &&
      !input.finalAnswer.includes("```json") &&
      !/^\s*\{[\s\S]*\}\s*$/.test(input.finalAnswer),
    "Answer should be user-facing prose rather than raw tool JSON.",
    false,
  );
  const erroredCalls = input.trace.filter((entry) => entry.error);
  const recovered =
    erroredCalls.length === 0 ||
    (Boolean(expectedMutation) &&
      input.trace.some(
        (entry) =>
          !entry.error &&
          erroredCalls.some((failed) => entry.turn > failed.turn),
      ));
  add(
    "recovery",
    recovered,
    erroredCalls.length === 0 ? "No tool errors" : recovered ? "Recovered from a tool error" : "Did not recover",
    false,
  );

  const judgmentChecks = checks.filter((check) =>
    ["restraint", "expected-mutation", "single-sharp-mutation"].includes(check.id),
  );
  const toolChecks = checks.filter(
    (check) =>
      check.id.startsWith("required:") ||
      check.id.startsWith("forbidden:") ||
      check.id === "read-before-write",
  );
  const maintenanceChecks = checks.filter((check) =>
    ["expected-mutation", "single-sharp-mutation", "restraint"].includes(check.id),
  );
  const applicationChecks = checks.filter((check) =>
    ["answer-present", "answer-grounding"].includes(check.id),
  );
  const recoveryChecks = checks.filter((check) => check.id === "recovery");
  const formattingChecks = checks.filter((check) => check.id === "clean-format");

  return {
    ...input,
    checks,
    success: !input.error && checks.filter((check) => check.critical).every((check) => check.passed),
    scores: {
      judgment: score(judgmentChecks),
      toolUse: score(toolChecks),
      maintenance: score(maintenanceChecks),
      formatting: score(formattingChecks),
      application: score(applicationChecks),
      recovery: score(recoveryChecks),
    },
  };
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function aggregateTrials(
  trials: BenchTrial[],
): BenchResult["aggregate"] {
  const groups = new Map<string, BenchTrial[]>();
  for (const trial of trials) {
    const key = `${trial.taskId}:${trial.effort}`;
    groups.set(key, [...(groups.get(key) ?? []), trial]);
  }
  const firstTrials = [...groups.values()].map(
    (group) => [...group].sort((a, b) => a.repetition - b.repetition)[0],
  );
  const passAt1 = firstTrials.length
    ? firstTrials.filter((trial) => trial.success).length / firstTrials.length
    : 0;
  const repeatedGroups = [...groups.values()].filter((group) => group.length >= 3);
  const passPower3 = repeatedGroups.length
    ? repeatedGroups.filter((group) => group.slice(0, 3).every((trial) => trial.success)).length /
      repeatedGroups.length
    : 0;
  const dimensions = {
    judgment: 0,
    toolUse: 0,
    maintenance: 0,
    formatting: 0,
    application: 0,
    recovery: 0,
  };
  for (const key of Object.keys(dimensions) as Array<keyof typeof dimensions>) {
    dimensions[key] = trials.length
      ? Math.round(trials.reduce((sum, trial) => sum + trial.scores[key], 0) / trials.length)
      : 0;
  }
  const totalCostUsd = trials.reduce((sum, trial) => sum + trial.costUsd, 0);
  const successes = trials.filter((trial) => trial.success).length;
  const averageScore =
    trials.length
      ? Math.round(
          trials.reduce(
            (sum, trial) =>
              sum +
              Object.values(trial.scores).reduce((inner, value) => inner + value, 0) / 6,
            0,
          ) / trials.length,
        )
      : 0;
  return {
    passAt1,
    passPower3,
    averageScore,
    criticalViolationRate: trials.length
      ? trials.filter((trial) =>
          trial.checks.some(
            (check) =>
              !check.passed &&
              (check.id.startsWith("forbidden:") ||
                ["restraint", "single-sharp-mutation", "policy-mode"].includes(check.id)),
          ),
        ).length / trials.length
      : 0,
    costPerSuccessUsd: successes ? totalCostUsd / successes : null,
    medianToolCalls: median(trials.map((trial) => trial.trace.length)),
    medianTurns: median(
      trials.map((trial) => Math.max(1, ...trial.trace.map((entry) => entry.turn))),
    ),
    totalCostUsd,
    totalTokens: trials.reduce(
      (sum, trial) => sum + trial.inputTokens + trial.outputTokens,
      0,
    ),
    dimensions,
  };
}
