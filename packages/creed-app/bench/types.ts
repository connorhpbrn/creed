// Canonical Creed Bench product version. Bump only through the semver skill.
// Results from other versions stay off the public chart.
export const BENCHMARK_VERSION = "1.0.1";
export const RESULT_SCHEMA_VERSION = 1;

export type BenchEffort = "low" | "medium" | "high";
export type WritePolicy = "proposals_only" | "direct_edit";
export type Permission = "hidden" | "read-only" | "propose" | "direct";

export type BenchSection = {
  id: string;
  name: string;
  accent: string;
  contentMarkdown: string;
  permission: Permission;
};

export type BenchActivity = {
  id: string;
  sectionId: string;
  action: string;
  summary: string;
  createdAt: string;
};

export type BenchQualitySlice = {
  sectionId: string;
  score: number;
  gap: string | null;
};

export type BenchWorld = {
  creedName: string;
  writePolicy: WritePolicy;
  sections: BenchSection[];
  activity: BenchActivity[];
  quality: BenchQualitySlice[];
};

export type ExpectedMutation = {
  operation:
    | "update"
    | "append"
    | "create"
    | "delete"
    | "rename"
    | "recolor"
    | "reorder";
  sectionId?: string;
  mode?: "proposal" | "direct";
  contentTermGroups?: string[][];
  name?: string;
  accent?: string;
  position?: "first" | "last";
  afterSectionId?: string;
};

export type BenchTask = {
  id: string;
  title: string;
  family: "single-tool" | "multi-tool" | "adversarial";
  difficulty: 1 | 2 | 3;
  prompt: string;
  initialWorld: BenchWorld;
  requiredTools: string[];
  forbiddenTools: string[];
  expectedMutation: ExpectedMutation | null;
  answerTermGroups: string[][];
  mustReadCreed: boolean;
  maxTurns: number;
  toolsCovered: string[];
};

export type ToolTraceEntry = {
  turn: number;
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  error: string | null;
};

export type MutationRecord = ExpectedMutation & {
  tool: string;
  arguments: Record<string, unknown>;
};

export type BenchTrial = {
  taskId: string;
  taskTitle: string;
  family: BenchTask["family"];
  difficulty: BenchTask["difficulty"];
  effort: BenchEffort;
  repetition: number;
  requestedModelId: string;
  resolvedModelId: string;
  provider: string | null;
  finalAnswer: string;
  trace: ToolTraceEntry[];
  mutations: MutationRecord[];
  initialWorld: BenchWorld;
  finalWorld: BenchWorld;
  checks: Array<{ id: string; passed: boolean; detail: string; critical: boolean }>;
  success: boolean;
  scores: {
    judgment: number;
    toolUse: number;
    maintenance: number;
    formatting: number;
    application: number;
    recovery: number;
  };
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  error: string | null;
};

export type BenchResult = {
  schemaVersion: typeof RESULT_SCHEMA_VERSION;
  benchmarkVersion: typeof BENCHMARK_VERSION;
  runnerCommit: string | null;
  requestedModelId: string;
  completedAt: string;
  status: "complete" | "provisional" | "failed";
  configuration: {
    efforts: BenchEffort[];
    repetitions: number;
    taskIds: string[];
    maxTurns: number;
  };
  aggregate: {
    passAt1: number;
    passPower3: number;
    averageScore: number;
    criticalViolationRate: number;
    costPerSuccessUsd: number | null;
    medianToolCalls: number;
    medianTurns: number;
    totalCostUsd: number;
    totalTokens: number;
    dimensions: BenchTrial["scores"];
  };
  trials: BenchTrial[];
};

export type BenchChartPoint = {
  effort: BenchEffort;
  averageCostUsd: number;
  runCostUsd: number;
  score: number;
  passPower3: number;
  tokens: number;
  runTokens: number;
};

export type BenchChartSeries = {
  modelId: string;
  model: string;
  provider: string;
  color: string;
  benchmarkVersion: string;
  completedAt: string;
  points: BenchChartPoint[];
};
