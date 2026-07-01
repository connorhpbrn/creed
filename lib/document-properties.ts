export const DOCUMENT_TYPE_OPTIONS = [
  { value: "bug", label: "Bug" },
  { value: "cx", label: "CX" },
  { value: "feature", label: "Feature" },
] as const;

export const DOCUMENT_STAGE_OPTIONS = [
  { value: "discovery", label: "Discovery" },
  { value: "design", label: "Design" },
  { value: "deliver", label: "Deliver" },
  { value: "review", label: "Review" },
] as const;

export const DOCUMENT_LIFECYCLE_OPTIONS = [
  { value: "ideation", label: "Ideation", stage: "discovery" },
  { value: "shaping", label: "Shaping", stage: "discovery" },
  { value: "requirements", label: "Requirements", stage: "design" },
  { value: "ui-cx-journeys", label: "UI/CX journeys", stage: "design" },
  { value: "process-design", label: "Process design", stage: "design" },
  { value: "solution-design", label: "Solution design", stage: "design" },
  { value: "technical-design", label: "Technical design", stage: "design" },
  { value: "delivery-planning", label: "Delivery planning", stage: "deliver" },
  { value: "development", label: "Development", stage: "deliver" },
  { value: "qa-testing", label: "QA/testing", stage: "deliver" },
  { value: "release", label: "Release", stage: "deliver" },
  { value: "hypercare-support", label: "Hypercare/support", stage: "review" },
  { value: "outcomes-benefits", label: "Outcomes/benefits", stage: "review" },
  { value: "learnings-optimisation", label: "Learnings/optimisation", stage: "review" },
] as const;

export const DOCUMENT_STATUS_OPTIONS = [
  { value: "backlog", label: "Backlog" },
  { value: "planning", label: "Planning" },
  { value: "in-progress", label: "In progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
] as const;

export const DOCUMENT_PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

export const DOCUMENT_SIZE_OPTIONS = [
  { value: "xs", label: "Extra small" },
  { value: "s", label: "Small" },
  { value: "m", label: "Medium" },
  { value: "l", label: "Large" },
  { value: "xl", label: "Extra large" },
] as const;

export const DOCUMENT_PROPERTY_OPTIONS = [
  { value: "status", label: "Status" },
  { value: "documentType", label: "Type" },
  { value: "stage", label: "Stage" },
  { value: "lifecycle", label: "Lifecycle" },
  { value: "priority", label: "Priority" },
  { value: "size", label: "T-shirt size" },
] as const;

export const DOCUMENT_GROUP_OPTIONS = [
  { value: "none", label: "No grouping" },
  { value: "status", label: "Status" },
  { value: "documentType", label: "Type" },
  { value: "stage", label: "Stage" },
  { value: "lifecycle", label: "Lifecycle" },
  { value: "priority", label: "Priority" },
  { value: "size", label: "T-shirt size" },
] as const;

export const DOCUMENT_SORT_OPTIONS = [
  { value: "updated", label: "Updated" },
  { value: "name", label: "Name" },
  { value: "status", label: "Status" },
  { value: "documentType", label: "Type" },
  { value: "stage", label: "Stage" },
  { value: "lifecycle", label: "Lifecycle" },
  { value: "priority", label: "Priority" },
  { value: "size", label: "T-shirt size" },
] as const;

const DOCUMENT_VIEW_MODE_OPTIONS = [
  { value: "list", label: "List" },
  { value: "cards", label: "Cards" },
] as const;

export type DocumentType = (typeof DOCUMENT_TYPE_OPTIONS)[number]["value"];
export type DocumentStage = (typeof DOCUMENT_STAGE_OPTIONS)[number]["value"];
export type DocumentLifecycle = (typeof DOCUMENT_LIFECYCLE_OPTIONS)[number]["value"];
export type DocumentStatus = (typeof DOCUMENT_STATUS_OPTIONS)[number]["value"];
export type DocumentPriority = (typeof DOCUMENT_PRIORITY_OPTIONS)[number]["value"];
export type DocumentSize = (typeof DOCUMENT_SIZE_OPTIONS)[number]["value"];
export type DocumentPropertyKey = (typeof DOCUMENT_PROPERTY_OPTIONS)[number]["value"];
export type DocumentGroupKey = (typeof DOCUMENT_GROUP_OPTIONS)[number]["value"];
export type DocumentSortKey = (typeof DOCUMENT_SORT_OPTIONS)[number]["value"];
export type DocumentViewMode = (typeof DOCUMENT_VIEW_MODE_OPTIONS)[number]["value"];
export type DocumentSortDirection = "asc" | "desc";

export type DocumentMetadataPatch = Partial<{
  title: string;
  description: string;
  folderId: string | null;
  documentType: DocumentType;
  stage: DocumentStage;
  lifecycle: DocumentLifecycle;
  status: DocumentStatus;
  priority: DocumentPriority;
  size: DocumentSize;
}>;

export const DEFAULT_VISIBLE_DOCUMENT_PROPERTIES: DocumentPropertyKey[] = [
  "status",
  "documentType",
  "stage",
  "lifecycle",
  "priority",
  "size",
];

export const DEFAULT_DOCUMENT_DASHBOARD_PREFERENCES = {
  viewMode: "list",
  groupBy: "status",
  sortBy: "updated",
  sortDir: "desc",
  visibleProperties: DEFAULT_VISIBLE_DOCUMENT_PROPERTIES,
} as const satisfies DocumentDashboardPreferences;

export type DocumentDashboardPreferences = {
  viewMode: DocumentViewMode;
  groupBy: DocumentGroupKey;
  sortBy: DocumentSortKey;
  sortDir: DocumentSortDirection;
  visibleProperties: DocumentPropertyKey[];
};

export type DocumentTone =
  | "slate"
  | "blue"
  | "sky"
  | "cyan"
  | "teal"
  | "mint"
  | "emerald"
  | "green"
  | "lime"
  | "yellow"
  | "amber"
  | "orange"
  | "coral"
  | "red"
  | "rose"
  | "pink"
  | "fuchsia"
  | "purple"
  | "violet"
  | "indigo";

export const DOCUMENT_TONE_STYLE = {
  slate: { backgroundColor: "#F1F5F9", color: "#334155", border: "1px solid #CBD5E1" },
  blue: { backgroundColor: "#DBEAFE", color: "#1E40AF", border: "1px solid #93C5FD" },
  sky: { backgroundColor: "#E0F2FE", color: "#0369A1", border: "1px solid #7DD3FC" },
  cyan: { backgroundColor: "#CFFAFE", color: "#155E75", border: "1px solid #67E8F9" },
  teal: { backgroundColor: "#CCFBF1", color: "#115E59", border: "1px solid #5EEAD4" },
  mint: { backgroundColor: "#D1FAE5", color: "#047857", border: "1px solid #6EE7B7" },
  emerald: { backgroundColor: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0" },
  green: { backgroundColor: "#DCFCE7", color: "#166534", border: "1px solid #86EFAC" },
  lime: { backgroundColor: "#ECFCCB", color: "#3F6212", border: "1px solid #BEF264" },
  yellow: { backgroundColor: "#FEF9C3", color: "#854D0E", border: "1px solid #FDE047" },
  amber: { backgroundColor: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" },
  orange: { backgroundColor: "#FFEDD5", color: "#9A3412", border: "1px solid #FDBA74" },
  coral: { backgroundColor: "#FFE4D6", color: "#B93815", border: "1px solid #FF9B73" },
  red: { backgroundColor: "#FEE2E2", color: "#991B1B", border: "1px solid #FCA5A5" },
  rose: { backgroundColor: "#FFE4E6", color: "#9F1239", border: "1px solid #FDA4AF" },
  pink: { backgroundColor: "#FCE7F3", color: "#9D174D", border: "1px solid #F9A8D4" },
  fuchsia: { backgroundColor: "#FAE8FF", color: "#A21CAF", border: "1px solid #F0ABFC" },
  purple: { backgroundColor: "#F3E8FF", color: "#6B21A8", border: "1px solid #D8B4FE" },
  violet: { backgroundColor: "#EDE9FE", color: "#5B21B6", border: "1px solid #C4B5FD" },
  indigo: { backgroundColor: "#E0E7FF", color: "#3730A3", border: "1px solid #A5B4FC" },
} satisfies Record<DocumentTone, { backgroundColor: string; color: string; border: string }>;

export const DOCUMENT_TONE_DOT: Record<DocumentTone, string> = {
  slate: "bg-[#64748B]",
  blue: "bg-[#2563EB]",
  sky: "bg-[#0284C7]",
  cyan: "bg-[#0891B2]",
  teal: "bg-[#0D9488]",
  mint: "bg-[#10B981]",
  emerald: "bg-[#059669]",
  green: "bg-[#16A34A]",
  lime: "bg-[#65A30D]",
  yellow: "bg-[#CA8A04]",
  amber: "bg-[#D97706]",
  orange: "bg-[#EA580C]",
  coral: "bg-[#F97316]",
  red: "bg-[#DC2626]",
  rose: "bg-[#E11D48]",
  pink: "bg-[#DB2777]",
  fuchsia: "bg-[#C026D3]",
  purple: "bg-[#9333EA]",
  violet: "bg-[#7C3AED]",
  indigo: "bg-[#4F46E5]",
};

const DOCUMENT_STATUS_TONE: Record<DocumentStatus, DocumentTone> = {
  backlog: "slate",
  planning: "sky",
  "in-progress": "amber",
  review: "violet",
  done: "emerald",
};

const DOCUMENT_PRIORITY_TONE: Record<DocumentPriority, DocumentTone> = {
  low: "mint",
  medium: "sky",
  high: "orange",
  urgent: "rose",
};

const DOCUMENT_TYPE_TONE: Record<DocumentType, DocumentTone> = {
  bug: "coral",
  cx: "fuchsia",
  feature: "cyan",
};

const DOCUMENT_STAGE_TONE: Record<DocumentStage, DocumentTone> = {
  discovery: "teal",
  design: "violet",
  deliver: "amber",
  review: "indigo",
};

const DOCUMENT_LIFECYCLE_TONE: Record<DocumentLifecycle, DocumentTone> = {
  ideation: "lime",
  shaping: "teal",
  requirements: "purple",
  "ui-cx-journeys": "fuchsia",
  "process-design": "pink",
  "solution-design": "violet",
  "technical-design": "indigo",
  "delivery-planning": "amber",
  development: "orange",
  "qa-testing": "yellow",
  release: "green",
  "hypercare-support": "rose",
  "outcomes-benefits": "sky",
  "learnings-optimisation": "cyan",
};

const DOCUMENT_SIZE_TONE: Record<DocumentSize, DocumentTone> = {
  xs: "slate",
  s: "mint",
  m: "amber",
  l: "coral",
  xl: "purple",
};

export function documentPropertyTone(property: DocumentPropertyKey, value: string): DocumentTone {
  if (property === "status") return DOCUMENT_STATUS_TONE[value as DocumentStatus] ?? "slate";
  if (property === "priority") return DOCUMENT_PRIORITY_TONE[value as DocumentPriority] ?? "slate";
  if (property === "documentType") return DOCUMENT_TYPE_TONE[value as DocumentType] ?? "slate";
  if (property === "stage") return DOCUMENT_STAGE_TONE[value as DocumentStage] ?? "slate";
  if (property === "lifecycle") {
    return DOCUMENT_LIFECYCLE_TONE[value as DocumentLifecycle] ?? "slate";
  }
  if (property === "size") return DOCUMENT_SIZE_TONE[value as DocumentSize] ?? "slate";
  return "slate";
}

export function isDocumentType(value: unknown): value is DocumentType {
  return DOCUMENT_TYPE_OPTIONS.some((option) => option.value === value);
}

export function isDocumentStage(value: unknown): value is DocumentStage {
  return DOCUMENT_STAGE_OPTIONS.some((option) => option.value === value);
}

export function isDocumentLifecycle(value: unknown): value is DocumentLifecycle {
  return DOCUMENT_LIFECYCLE_OPTIONS.some((option) => option.value === value);
}

export function isDocumentStatus(value: unknown): value is DocumentStatus {
  return DOCUMENT_STATUS_OPTIONS.some((option) => option.value === value);
}

export function isDocumentPriority(value: unknown): value is DocumentPriority {
  return DOCUMENT_PRIORITY_OPTIONS.some((option) => option.value === value);
}

export function isDocumentSize(value: unknown): value is DocumentSize {
  return DOCUMENT_SIZE_OPTIONS.some((option) => option.value === value);
}

export function isDocumentPropertyKey(value: unknown): value is DocumentPropertyKey {
  return DOCUMENT_PROPERTY_OPTIONS.some((option) => option.value === value);
}

export function isDocumentGroupKey(value: unknown): value is DocumentGroupKey {
  return DOCUMENT_GROUP_OPTIONS.some((option) => option.value === value);
}

export function isDocumentSortKey(value: unknown): value is DocumentSortKey {
  return DOCUMENT_SORT_OPTIONS.some((option) => option.value === value);
}

export function isDocumentViewMode(value: unknown): value is DocumentViewMode {
  return DOCUMENT_VIEW_MODE_OPTIONS.some((option) => option.value === value);
}

export function isDocumentSortDirection(value: unknown): value is DocumentSortDirection {
  return value === "asc" || value === "desc";
}

export function labelDocumentProperty(property: DocumentPropertyKey, value: string) {
  const options = {
    status: DOCUMENT_STATUS_OPTIONS,
    documentType: DOCUMENT_TYPE_OPTIONS,
    stage: DOCUMENT_STAGE_OPTIONS,
    lifecycle: DOCUMENT_LIFECYCLE_OPTIONS,
    priority: DOCUMENT_PRIORITY_OPTIONS,
    size: DOCUMENT_SIZE_OPTIONS,
  }[property];

  return options.find((option) => option.value === value)?.label ?? value;
}

export function lifecycleStage(lifecycle: DocumentLifecycle): DocumentStage {
  return DOCUMENT_LIFECYCLE_OPTIONS.find((option) => option.value === lifecycle)?.stage ?? "discovery";
}

export function defaultLifecycleForStage(stage: DocumentStage): DocumentLifecycle {
  return DOCUMENT_LIFECYCLE_OPTIONS.find((option) => option.stage === stage)?.value ?? "ideation";
}

export function documentMetadataPatchFromRecord(input: Record<string, unknown>): DocumentMetadataPatch {
  const patch: DocumentMetadataPatch = {};
  if (typeof input.title === "string") patch.title = input.title;
  if (typeof input.description === "string") patch.description = input.description;
  if (typeof input.folderId === "string" || input.folderId === null) {
    patch.folderId = input.folderId;
  }
  if (isDocumentType(input.documentType)) patch.documentType = input.documentType;
  if (isDocumentStage(input.stage)) patch.stage = input.stage;
  if (isDocumentLifecycle(input.lifecycle)) patch.lifecycle = input.lifecycle;
  if (isDocumentStatus(input.status)) patch.status = input.status;
  if (isDocumentPriority(input.priority)) patch.priority = input.priority;
  if (isDocumentSize(input.size)) patch.size = input.size;
  return patch;
}
