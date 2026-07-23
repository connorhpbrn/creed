// Public roadmap data model: the median.sh board mapped to the three public
// columns the UI renders. This module is pure and IO-free (no secret, no fetch,
// no logging) so it can be unit-tested directly and type-imported from client
// components. The server-only fetch lives in ./fetch-roadmap.
//
// Note: task `description` is published verbatim from the median board to the
// public page and the /api/roadmap JSON. Only the todo, ready, in_progress, and
// shipped phases surface (raw `requests` intake and `archive` are dropped), so
// anything on a promoted card is public. Keep median descriptions
// public-appropriate.

// The three public columns, in the order shown on the board.
export type RoadmapColumnId = "shipped" | "in_progress" | "next";

// median board phases are requests | todo | in_progress | ready | shipped |
// archive. Each phase folds into one public column; `ready` and `todo` both
// become "Next" (queued work). `requests` (raw incoming) and `archive`
// (dropped) are intentionally not surfaced.
const PHASE_TO_COLUMN: Record<string, RoadmapColumnId> = {
  shipped: "shipped",
  in_progress: "in_progress",
  ready: "next",
  todo: "next",
};

// The public task shape: exactly the fields the UI renders. median's internal
// sequencing values (order, taskNumber) are deliberately NOT here, so they
// never ship in the public props or JSON; they live on MappedTask below and are
// used only to sort within a column.
export type RoadmapTask = {
  id: string;
  title: string;
  description: string | null;
  labels: string[];
};

export type RoadmapColumn = {
  id: RoadmapColumnId;
  label: string;
  tasks: RoadmapTask[];
};

// Column display config in board order (Next, In Progress, Shipped). The
// per-status colours live with the components that render them
// (components/marketing/roadmap-status.tsx) because Tailwind only scans app/
// and components/ for class names, not lib/.
const COLUMN_META: Omit<RoadmapColumn, "tasks">[] = [
  { id: "next", label: "Next" },
  { id: "in_progress", label: "In Progress" },
  { id: "shipped", label: "Shipped" },
];

// The subset of median's task shape we read; everything else is ignored.
type MedianTask = {
  id?: unknown;
  taskNumber?: unknown;
  title?: unknown;
  description?: unknown;
  phase?: unknown;
  labels?: unknown;
  order?: unknown;
};

// A mapped task plus the median sort keys that order it within its column. The
// keys stay off RoadmapTask so they never reach the client.
type MappedTask = {
  task: RoadmapTask;
  phase: string;
  order: number;
  taskNumber: number;
};

function toMappedTask(raw: MedianTask): MappedTask | null {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const phase = typeof raw.phase === "string" ? raw.phase : "";
  if (!title || !phase) return null;

  return {
    phase,
    order: typeof raw.order === "number" ? raw.order : 0,
    taskNumber: typeof raw.taskNumber === "number" ? raw.taskNumber : 0,
    task: {
      id: typeof raw.id === "string" ? raw.id : `${phase}-${title}`,
      title,
      description:
        typeof raw.description === "string" && raw.description.trim()
          ? raw.description.trim()
          : null,
      labels: Array.isArray(raw.labels)
        ? raw.labels.filter((l): l is string => typeof l === "string")
        : [],
    },
  };
}

// Pure: fold raw median tasks into the three public columns, sorted within each
// by board order, then newest task number as a tiebreak. Exported so the
// mapping can be unit-tested without hitting the network.
export function groupTasksIntoColumns(rawTasks: unknown): RoadmapColumn[] {
  const buckets: Record<RoadmapColumnId, MappedTask[]> = {
    shipped: [],
    in_progress: [],
    next: [],
  };

  const list = Array.isArray(rawTasks) ? rawTasks : [];
  for (const raw of list) {
    const mapped = toMappedTask(raw as MedianTask);
    if (!mapped) continue;
    const column = PHASE_TO_COLUMN[mapped.phase];
    if (!column) continue; // requests / archive / unknown phases are dropped
    buckets[column].push(mapped);
  }

  return COLUMN_META.map((meta) => ({
    ...meta,
    tasks: buckets[meta.id]
      .sort((a, b) => a.order - b.order || b.taskNumber - a.taskNumber)
      .map((mapped) => mapped.task),
  }));
}
