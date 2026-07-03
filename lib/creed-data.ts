// Single source of truth for the accent vocabulary. The literal union below
// is derived from this array so the runtime list (used by validators and by
// the agent contract docs) can never drift from the compile-time type.
import { MAX_SECTION_DEPTH, normalizeSectionDepths } from "./section-hierarchy.ts";
import { referenceToken, isDocReferenceKind } from "./document-reference.ts";

// The order the accent picker renders cells in. Sorted along a colour
// wheel - warm → cool → neutral - so the grid reads as a coherent
// gradient rather than a random palette. `custom` is intentionally
// excluded; existing data using it renders as `mono`.
export const VISIBLE_ACCENT_KEYS: readonly AccentKey[] = [
  "boundaries", // Red
  "rose", // Rose
  "skills", // Pink
  "projects", // Orange
  "decisions", // Amber
  "yellow", // Yellow
  "mini-skills", // Lime
  "operating-principles", // Emerald
  "output", // Teal
  "preferences", // Cyan
  "tools", // Sky
  "stack", // Blue
  "workflows", // Indigo
  "identity", // Violet
  "questions", // Purple
  "mono", // Black / white (theme-aware)
];

export const ACCENT_KEYS = [
  "identity",
  "stack",
  "operating-principles",
  "decisions",
  "preferences",
  "workflows",
  "tools",
  "boundaries",
  "questions",
  "skills",
  "mini-skills",
  "projects",
  "output",
  "rose",
  // Yellow added to fill the colour-wheel picker (between amber and lime).
  "yellow",
  // Mono is the theme-aware end of the palette (black in light mode,
  // white in dark mode) - replaces the legacy "Grey" presentation of
  // `custom`. `custom` is kept in the type for back-compat with existing
  // stored sections but is no longer shown in the picker.
  "mono",
  "custom",
] as const;

export type AccentKey = (typeof ACCENT_KEYS)[number];

export function isAccentKey(value: unknown): value is AccentKey {
  return (
    typeof value === "string" &&
    (ACCENT_KEYS as readonly string[]).includes(value)
  );
}

const CREED_SEED_VERSION = "2026-04-18-agent-behavior-v1";

export type ActorType = "user" | "agent";

export type SectionTemplate =
  | "identity"
  | "stack"
  | "principles"
  | "focus"
  | "projects"
  | "freeform";

// Per-section agent permission. "hidden" hides the section from the agent
// entirely (not in the read payload); "read-only" is visible but uneditable;
// "propose" requires approval; "direct" applies immediately. `agentWritable`
// is kept as a derived convenience (propose | direct) so the existing
// write/proposal gates keep working unchanged.
export type AgentPermission = "hidden" | "read-only" | "propose" | "direct";

export const permissionToWritable = (permission: AgentPermission) =>
  permission === "propose" || permission === "direct";
const permissionIsReadable = (permission: AgentPermission) => permission !== "hidden";
export function normalizeAgentPermission(value: unknown): AgentPermission {
  return value === "hidden" || value === "read-only" || value === "propose" || value === "direct"
    ? value
    : "propose";
}

export type CreedSection = {
  id: string;
  kind: "rich-text";
  template: SectionTemplate;
  name: string;
  accent: AccentKey;
  content: string;
  agentWritable: boolean;
  agentPermission: AgentPermission;
  lastEditedBy: string;
  lastEditedType: ActorType;
  lastEditedLabel: string;
  // Nesting depth (0 = top level, max 2). Hierarchy is implied by depth +
  // position: a section's parent is the nearest preceding shallower section.
  // See lib/section-hierarchy.ts for the rules. Absent means depth 0.
  depth?: number;
  // Archived sections are kept in state (so they survive persistence) but are
  // hidden from the editor, the agent read payload, quality scoring, and the
  // markdown export. Restorable from Settings -> Archived.
  archived?: boolean;
};

export type ProposalChangeType =
  | "new-memory"
  | "refines-existing"
  | "conflicts-existing";

export type ProposalImpact =
  | "future-responses"
  | "code-generation"
  | "project-context";

export type ProposalConfidence = "tentative" | "repeated" | "durable";

export type ProposalStatus = "pending" | "accepted" | "rejected" | "stale";
export type ActivityStatus = ProposalStatus | "direct";
export type IntegrationProvider = "google" | "github";
export type IntegrationConnectionStatus = "connected" | "not-connected" | "disconnected";
export type GitHubSyncStatus =
  | "not-configured"
  | "unknown"
  | "up-to-date"
  | "local-ahead"
  | "remote-ahead"
  | "diverged";

// Personal-profile section IDs. Five always-on core sections + five optional
// ones that the onboarding compiler only emits when the user filled the
// matching answer. All ten ship as agent-writable so AI can keep the profile
// accurate, polished, concise, and current.
export const IDENTITY_SECTION_ID = "identity";
const BELIEFS_SECTION_ID = "beliefs";
export const GOALS_SECTION_ID = "goals";
export const WORK_SECTION_ID = "work";
export const PREFERENCES_SECTION_ID = "preferences";
const CONSTRAINTS_SECTION_ID = "constraints";
const PEOPLE_SECTION_ID = "people";
const HEALTH_SECTION_ID = "health";
export const ROUTINES_SECTION_ID = "routines";
const CONTEXT_SECTION_ID = "context";

// Legacy IDs - kept so historical Creeds with the old dev-leaning section set
// still hydrate cleanly. New starter files never emit these.
const OPERATING_PRINCIPLES_SECTION_ID = "operating-principles";
const CURRENT_FOCUS_SECTION_ID = "current-focus";
const LEGACY_CONVENTIONS_SECTION_ID = "conventions";

// Retained for back-compat with any callers that still reference the
// historical "governed sections" concept. Under the unified model, agent
// write-access is per-section via section.agentWritable rather than a fixed
// id list. The list below is the default set of agent-writable section IDs
// that ship with a fresh Creed.
export type GovernedSectionId = string;
const defaultAgentWritableSectionIds = [
  IDENTITY_SECTION_ID,
  BELIEFS_SECTION_ID,
  GOALS_SECTION_ID,
  WORK_SECTION_ID,
  PREFERENCES_SECTION_ID,
  CONSTRAINTS_SECTION_ID,
  PEOPLE_SECTION_ID,
  HEALTH_SECTION_ID,
  ROUTINES_SECTION_ID,
  CONTEXT_SECTION_ID,
  // Keep the legacy IDs in the list so historical Creeds stay agent-writable
  // for the same sections after the pivot lands.
  OPERATING_PRINCIPLES_SECTION_ID,
  CURRENT_FOCUS_SECTION_ID,
] as const;

// Unified proposal model: every change is a rich-text update to a section
// (or a new section). Legacy shapes still arriving from older agents are
// coerced via normalizeLegacyProposalDraft below.
export type RichTextProposalDraft = {
  kind: "rich-text";
  contentHtml?: string;
  contentMarkdown?: string;
};

export type NewSectionProposalDraft = {
  kind: "new-section";
  name: string;
  accent?: AccentKey;
  template?: SectionTemplate;
  // Sibling placement: the new section lands after this section (and its
  // subtree) at the same depth. Ignored when `parentSectionId` is set.
  insertAfterSectionId?: string;
  // Nesting placement: when set, the new section becomes the FIRST child of
  // this section, one level deeper (clamped to MAX_SECTION_DEPTH = 2). Use
  // this to create a subsection. Takes precedence over insertAfterSectionId.
  parentSectionId?: string;
  contentHtml?: string;
  contentMarkdown?: string;
};

// Section-meta proposals: agents can also propose to delete a section, rename
// it, or change its accent colour. These are intentionally separate draft
// kinds (rather than fields tacked onto rich-text) so the UI can render them
// distinctly and the user can accept/reject each kind on its own.
export type DeleteSectionProposalDraft = {
  kind: "delete-section";
};

export type RenameSectionProposalDraft = {
  kind: "rename-section";
  name: string;
};

export type RecolorSectionProposalDraft = {
  kind: "recolor-section";
  accent: AccentKey;
};

// Reorder draft. Exactly one of `afterSectionId` or `position` is meaningful;
// `position` is "first" | "last" for the ends of the list, `afterSectionId`
// places the section right after that id. The proposal's `sectionId` selects
// which section to move.
export type ReorderSectionProposalDraft = {
  kind: "reorder-section";
  afterSectionId?: string;
  position?: "first" | "last";
};

export type ProposalDraft =
  | RichTextProposalDraft
  | NewSectionProposalDraft
  | DeleteSectionProposalDraft
  | RenameSectionProposalDraft
  | RecolorSectionProposalDraft
  | ReorderSectionProposalDraft;

// Type aliases retained so legacy import sites keep compiling during the
// transition. Each is structurally identical to RichTextProposalDraft.
type OperatingPrinciplesProposalDraft = RichTextProposalDraft;
type DecisionProposalDraft = RichTextProposalDraft;
type CurrentFocusProposalDraft = RichTextProposalDraft;
type RulesProposalDraft = RichTextProposalDraft;
type ChipsProposalDraft = RichTextProposalDraft;

export type Proposal = {
  id: string;
  sectionId: string;
  sectionName: string;
  accent: AccentKey;
  agentName: string;
  createdAt?: string;
  timeLabel: string;
  changeType: ProposalChangeType;
  reason: string;
  impact: ProposalImpact;
  confidence: ProposalConfidence;
  draft: ProposalDraft;
  status: ProposalStatus;
  baseRevision?: number | null;
};

export function normalizeLegacySectionId(sectionId: string) {
  return sectionId === LEGACY_CONVENTIONS_SECTION_ID ? OPERATING_PRINCIPLES_SECTION_ID : sectionId;
}

export function normalizeLegacyAccent(accent: AccentKey | "conventions"): AccentKey {
  return accent === LEGACY_CONVENTIONS_SECTION_ID ? OPERATING_PRINCIPLES_SECTION_ID : accent;
}

// Coerces every legacy draft shape into the unified rich-text draft. Older
// agents may still submit drafts with kind "operating-principles", "rules",
// "chips", "decisions", "current-focus" - we render their payload to markdown
// and pass it through as a rich-text update.
export function normalizeLegacyProposalDraft(draft: ProposalDraft | { kind?: string }): ProposalDraft {
  const raw = draft && typeof draft === "object" ? (draft as Record<string, unknown>) : {};
  const kind = raw.kind === LEGACY_CONVENTIONS_SECTION_ID ? OPERATING_PRINCIPLES_SECTION_ID : raw.kind;

  const stringField = (key: string): string | undefined => {
    const value = raw[key];
    return typeof value === "string" ? value : undefined;
  };

  if (kind === "new-section") {
    return {
      kind: "new-section",
      name: stringField("name") ?? "New section",
      accent: typeof raw.accent === "string" ? (raw.accent as AccentKey) : undefined,
      template: typeof raw.template === "string" ? (raw.template as SectionTemplate) : undefined,
      insertAfterSectionId: stringField("insertAfterSectionId"),
      parentSectionId: stringField("parentSectionId"),
      contentHtml: stringField("contentHtml"),
      contentMarkdown: stringField("contentMarkdown"),
    };
  }

  if (kind === "rich-text") {
    return {
      kind: "rich-text",
      contentHtml: stringField("contentHtml"),
      contentMarkdown: stringField("contentMarkdown"),
    };
  }

  if (kind === "delete-section") {
    return { kind: "delete-section" };
  }

  if (kind === "rename-section") {
    return {
      kind: "rename-section",
      name: stringField("name")?.trim() || "",
    };
  }

  if (kind === "recolor-section") {
    return {
      kind: "recolor-section",
      accent: typeof raw.accent === "string" ? (raw.accent as AccentKey) : "custom",
    };
  }

  if (kind === "reorder-section") {
    const position = stringField("position");
    return {
      kind: "reorder-section",
      afterSectionId: stringField("afterSectionId"),
      position: position === "first" || position === "last" ? position : undefined,
    };
  }

  // Legacy shapes - flatten to rich-text markdown.
  if (kind === "operating-principles") {
    const text = stringField("text") ?? "";
    return {
      kind: "rich-text",
      contentMarkdown: text ? `- ${text}` : "",
    };
  }

  if (kind === "decisions") {
    const title = stringField("title") ?? stringField("content") ?? "";
    const details = stringField("details");
    const body = details ? `**${title}** - ${details}` : `**${title}**`;
    return {
      kind: "rich-text",
      contentMarkdown: title ? `- ${body}` : "",
    };
  }

  if (kind === "current-focus") {
    return {
      kind: "rich-text",
      contentMarkdown: stringField("content") ?? "",
    };
  }

  if (kind === "rules") {
    const items = Array.isArray(raw.items)
      ? raw.items.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
      : [];
    const append = stringField("appendItem")?.trim();
    const lines = append ? [...items, append] : items;
    return {
      kind: "rich-text",
      contentMarkdown: lines.length ? lines.map((line) => `- ${line}`).join("\n") : "",
    };
  }

  if (kind === "chips") {
    const chips = Array.isArray(raw.chips)
      ? raw.chips.map((chip) => (typeof chip === "string" ? chip.trim() : "")).filter(Boolean)
      : [];
    return {
      kind: "rich-text",
      contentMarkdown: chips.map((chip) => `#${chip.replace(/\s+/g, "-").toLowerCase()}`).join(" "),
    };
  }

  return {
    kind: "rich-text",
    contentMarkdown: stringField("content") ?? "",
  };
}

function normalizeLegacySection(section: CreedSection): CreedSection {
  if (section.id !== LEGACY_CONVENTIONS_SECTION_ID && (section.accent as string) !== LEGACY_CONVENTIONS_SECTION_ID) {
    return section;
  }

  return {
    ...section,
    id: section.id === LEGACY_CONVENTIONS_SECTION_ID ? OPERATING_PRINCIPLES_SECTION_ID : section.id,
    name: section.id === LEGACY_CONVENTIONS_SECTION_ID ? "Operating Principles" : section.name,
    accent: normalizeLegacyAccent(section.accent),
  };
}

// Under the unified model every section accepts rich-text proposals, so this
// is a no-op. Kept for back-compat with any callers that still wrap
// proposals through it.
export function normalizeProposalForSection(
  proposal: Proposal,
  _section?: CreedSection
): Proposal {
  return proposal;
}

// Sections used to be a discriminated union (chips, rules, decisions, focus,
// rich-text). The on-disk payload still carries those legacy shapes for older
// rows. This helper computes a single rich-text HTML content string from any
// legacy payload, so the rendered model is uniform.
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function tagSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function legacyPayloadToRichTextContent(
  kind: string | undefined,
  payload: Record<string, unknown>
): string {
  const existingContent = typeof payload.content === "string" ? payload.content : "";

  if (kind === "chips" && Array.isArray(payload.chips) && payload.chips.length > 0) {
    const tags = (payload.chips as unknown[])
      .filter((chip): chip is string => typeof chip === "string" && chip.trim().length > 0)
      .map((chip) => {
        const value = chip.trim();
        const slug = tagSlug(value) || value.toLowerCase();
        return `<span class="creed-inline-tag" data-tag="${escapeHtml(slug)}">${escapeHtml(value)}</span>`;
      })
      .join(" ");

    const tagParagraph = tags ? `<p>${tags}</p>` : "";
    return tagParagraph + existingContent;
  }

  if (kind === "rules" && Array.isArray(payload.items) && payload.items.length > 0) {
    const items = (payload.items as Array<{ id?: string; text?: string }>)
      .filter((item) => typeof item?.text === "string" && item.text.trim().length > 0)
      .map((item) => `<li>${escapeHtml(item.text!.trim())}</li>`)
      .join("");
    const list = items
      ? `<ul class="creed-list creed-list-bullet">${items}</ul>`
      : "";
    return list + existingContent;
  }

  if (kind === "decisions" && Array.isArray(payload.entries) && payload.entries.length > 0) {
    const items = (payload.entries as Array<{ title?: string; details?: string }>)
      .filter((entry) => typeof entry?.title === "string" && entry.title.trim().length > 0)
      .map((entry) => {
        const title = `<strong>${escapeHtml(entry.title!.trim())}</strong>`;
        const details = entry.details && entry.details.trim().length > 0
          ? ` - ${escapeHtml(entry.details.trim())}`
          : "";
        return `<li>${title}${details}</li>`;
      })
      .join("");
    const list = items
      ? `<ul class="creed-list creed-list-bullet">${items}</ul>`
      : "";
    return list + existingContent;
  }

  // focus and rich-text already live in the content field.
  return existingContent;
}

const TEMPLATE_FALLBACK_BY_KIND: Record<string, SectionTemplate> = {
  chips: "stack",
  rules: "principles",
  decisions: "principles",
  focus: "focus",
  "rich-text": "freeform",
};

export function inferSectionTemplate(
  kind: string | undefined,
  existing: SectionTemplate | undefined
): SectionTemplate {
  if (existing) return existing;
  if (kind && TEMPLATE_FALLBACK_BY_KIND[kind]) return TEMPLATE_FALLBACK_BY_KIND[kind];
  return "freeform";
}

export type ActivityEntry = {
  id: string;
  proposalId?: string;
  createdAt?: string;
  dayLabel: string;
  sectionId: string;
  sectionName: string;
  accent: AccentKey;
  actor: string;
  actorType: ActorType;
  summary: string;
  timeLabel: string;
  status: ActivityStatus;
  changeType: ProposalChangeType;
  reason: string;
  impact: ProposalImpact;
  confidence: ProposalConfidence;
  beforeText?: string;
  afterText: string;
};

export type ConnectionItem = {
  id: string;
  name: string;
  status: "connected" | "not-connected";
  icon: AgentIconKind;
  description: string;
  // Short instruction for connecting this client over OAuth.
  connectHint: string;
  // Optional copyable one-liner (e.g. `claude mcp add ...`).
  command?: string;
  // Optional one-click install deep link (e.g. Cursor).
  deepLink?: string;
  lastUsed?: string;
};

export type AgentIconKind =
  | "claude"
  | "claudecode"
  | "codex"
  | "chatgpt"
  | "cursor"
  | "replit"
  | "devin"
  | "whirl"
  | "grok"
  | "v0"
  | "opencode"
  | "openclaw"
  | "hermes"
  | "mcp"
  | "custom";

export type McpClient = {
  id: string;
  name: string;
  icon: AgentIconKind;
  lastUsed?: string;
};

export type CreedSettings = {
  requireApproval: boolean;
  integrations: Record<
    IntegrationProvider,
    {
      provider: IntegrationProvider;
      label: string;
      status: IntegrationConnectionStatus;
      disconnectable: boolean;
      accountLabel?: string;
    }
  >;
  versionControl: {
    provider: "github";
    repoOwner: string;
    repoName: string;
    branch: string;
    path: "creed.md";
    lastRemoteSha?: string;
    lastRemoteMessage?: string;
    lastRemoteCommittedAt?: string;
    lastSyncedContentHash?: string;
    syncStatus: GitHubSyncStatus;
  };
};

export type OnboardingState = {
  // Three open answers. The vibe picker and per-field forms were removed: the
  // questions are now open prose that compile into the core seed spine
  // (Identity, Goals, Work, Preferences, Routines). The user's own assistant
  // fleshes the rest off the copy-paste compose prompt, and optional sections
  // grow in-app via proposals. This object is client-only and never persisted.
  identity: string; // who they are, what they do, the tools they live in
  goals: string; // what they are working toward
  preferences: string; // how AI should treat them, always / never
};

export type CreedState = {
  user: {
    name: string;
    handle: string;
    avatarInitials: string;
    avatarUrl?: string;
    email: string;
  };
  readUrl: string;
  readToken: string;
  writeToken: string;
  directEditToken: string;
  mcpUrl: string;
  mcpStatus: "waiting" | "connected";
  mcpLastUsed?: string;
  mcpLastClientName?: string;
  mcpClients: McpClient[];
  locked: boolean;
  // Sections whose effective lock state is the opposite of `locked`. Lets a
  // user keep one section editable while the file is otherwise locked, or
  // pin a single section read-only inside an unlocked file. Cleared whenever
  // the global lock toggles.
  sectionLockOverrides: string[];
  // Epoch ms of the last successful save (or the most recent edit known at
  // load time), used to render a relative "Saved Xm ago" label. `saving` is
  // true only while a persist is actually in flight, so the indicator waits
  // for a typing pause instead of flickering on every keystroke.
  lastSavedAt: number | null;
  saving: boolean;
  sections: CreedSection[];
  proposals: Proposal[];
  activity: ActivityEntry[];
  settings: CreedSettings;
  connections: ConnectionItem[];
  onboarding: OnboardingState;
  mutationTick: number;
  sectionRevisions: Partial<Record<string, number>>;
};

export const initialOnboardingState: OnboardingState = {
  identity: "",
  goals: "",
  preferences: "",
};

export const accentColorMap: Record<AccentKey, string> = {
  identity: "#7C3AED",
  stack: "#2563EB",
  "operating-principles": "#059669",
  decisions: "#D97706",
  preferences: "#0E7490",
  workflows: "#4F46E5",
  tools: "#0284C7",
  boundaries: "#DC2626",
  questions: "#9333EA",
  skills: "#DB2777",
  "mini-skills": "#65A30D",
  projects: "#EA580C",
  output: "#0D9488",
  rose: "#E11D48",
  yellow: "#EAB308",
  // Mono resolves through a CSS variable so it swaps black ↔ white when
  // the document theme flips. Inline `style={{ color: ... }}` and `fill`
  // attrs that read this value will pick up the swap automatically.
  mono: "var(--accent-color-mono)",
  // Legacy: existing sections may still hold accent: "custom". Render it
  // the same as mono so older data inherits the new theme-aware behaviour.
  custom: "var(--accent-color-mono)",
};

// Tints resolve via CSS vars so light/dark variants are managed in one place
// (see `--accent-tint-*` in app/globals.css).
export const accentTintMap: Record<AccentKey, string> = {
  identity: "var(--accent-tint-identity)",
  stack: "var(--accent-tint-stack)",
  "operating-principles": "var(--accent-tint-operating-principles)",
  decisions: "var(--accent-tint-decisions)",
  preferences: "var(--accent-tint-preferences)",
  workflows: "var(--accent-tint-workflows)",
  tools: "var(--accent-tint-tools)",
  boundaries: "var(--accent-tint-boundaries)",
  questions: "var(--accent-tint-questions)",
  skills: "var(--accent-tint-skills)",
  "mini-skills": "var(--accent-tint-mini-skills)",
  projects: "var(--accent-tint-projects)",
  yellow: "var(--accent-tint-yellow)",
  mono: "var(--accent-tint-mono)",
  output: "var(--accent-tint-output)",
  rose: "var(--accent-tint-rose)",
  // Legacy alias - render with the same theme-aware tint as mono.
  custom: "var(--accent-tint-mono)",
};

export const accentLabelMap: Record<AccentKey, string> = {
  identity: "Violet",
  stack: "Blue",
  "operating-principles": "Emerald",
  decisions: "Amber",
  preferences: "Cyan",
  workflows: "Indigo",
  tools: "Sky",
  boundaries: "Red",
  questions: "Purple",
  skills: "Pink",
  "mini-skills": "Lime",
  projects: "Orange",
  output: "Teal",
  rose: "Rose",
  yellow: "Yellow",
  mono: "Mono",
  // Legacy storage value - surface it under the new name so users see the
  // same label regardless of when their section was created.
  custom: "Mono",
};

// Convert the editor's HTML content back to portable markdown for the agent
// read payload. The section heading itself is `## Name`, so any h2/h3 inside
// the section content is shifted down one level (h2 → h3, h3 → h4) to keep a
// clean markdown hierarchy without colliding levels.
//
//   <h2>...</h2>                                → ### ...
//   <h3>...</h3>                                → #### ...
//   <ul><li>...</li></ul>                       → - ...
//   <ol><li>...</li></ol>                       → 1. ...
//   <blockquote class="creed-callout">...</...> → > ...   (rendered as callout)
//   <pre><code>...</code></pre>                 → ```...```
//   <hr />                                      → ---
//   <span data-tag="slug">label</span>          → #slug   (inline tag mark)
//
// Anything else falls back to plain text after tag stripping.
export function richHtmlToMarkdown(
  content: string,
  options: { headingOffset?: number } = {}
) {
  const headingOffset = Math.max(0, Math.floor(options.headingOffset ?? 0));
  let text = content;

  // Document/folder references first: convert the chip (inline span) and card
  // (block div) nodes back to their Markdown tokens before any generic tag
  // stripping runs, otherwise stripTags would erase them. Attribute order is
  // not guaranteed by the serializer, so we pull kind/slug out of the matched
  // tag rather than relying on positional capture groups.
  const referenceTokenFromTag = (tag: string, form: "inline" | "card") => {
    const kind = /data-ref-kind="([^"]*)"/.exec(tag)?.[1] ?? "doc";
    const slug = /data-ref-slug="([^"]*)"/.exec(tag)?.[1] ?? "";
    if (!slug) return "";
    const safeKind = isDocReferenceKind(kind) ? kind : "doc";
    const token = referenceToken(safeKind, slug, form);
    return form === "card" ? `\n\n${token}\n\n` : token;
  };
  text = text.replace(
    /<span\b[^>]*\bdata-doc-ref="inline"[^>]*><\/span>/g,
    (tag) => referenceTokenFromTag(tag, "inline")
  );
  text = text.replace(
    /<div\b[^>]*\bdata-doc-ref="card"[^>]*><\/div>/g,
    (tag) => referenceTokenFromTag(tag, "card")
  );

  // External URL references: mention chip (inline), bookmark card + embed
  // (block). Serialize back to `[mention|bookmark|embed](url)` before the
  // generic tag stripper runs. Node views render richer DOM, but getHTML emits
  // the empty `<span/div data-url-ref data-url>` from renderHTML, which is what
  // we match here. See components/creed/extensions/url-reference.tsx.
  const urlFromTag = (tag: string) => decodeEntities(/data-url="([^"]*)"/.exec(tag)?.[1] ?? "");
  text = text.replace(/<span\b[^>]*\bdata-url-ref="mention"[^>]*><\/span>/g, (tag) => {
    const url = urlFromTag(tag);
    return url ? `[mention](${url})` : "";
  });
  text = text.replace(/<div\b[^>]*\bdata-url-ref="bookmark"[^>]*><\/div>/g, (tag) => {
    const url = urlFromTag(tag);
    return url ? `\n\n[bookmark](${url})\n\n` : "";
  });
  text = text.replace(/<div\b[^>]*\bdata-url-ref="embed"[^>]*><\/div>/g, (tag) => {
    const url = urlFromTag(tag);
    return url ? `\n\n[embed](${url})\n\n` : "";
  });

  // Inline tag marks first so we don't strip them in the generic tag
  // stripper below.
  text = text.replace(
    /<span\s+[^>]*data-tag="([^"]+)"[^>]*>[^<]*<\/span>/g,
    "#$1"
  );

  // Block code must run before inline `<code>` handling. Otherwise the code
  // child inside `<pre><code>` is turned into inline-backtick markdown first,
  // which corrupts Mermaid blocks when an unrelated editor save serializes the
  // document.
  text = text.replace(
    /<pre[^>]*data-type="mermaid"[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/g,
    (_match, body: string) =>
      `\n\`\`\`mermaid\n${decodeEntities(body).trim()}\n\`\`\`\n`
  );

  // Fenced code blocks. Keep the contents verbatim; if the editor stored a
  // language hint as a class, surface it on the opening fence.
  text = text.replace(
    /<pre[^>]*>\s*<code(?:\s+class="(?:language-)?([a-zA-Z0-9_-]+)")?[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/g,
    (_match, lang: string | undefined, body: string) =>
      `\n\`\`\`${lang ?? ""}\n${decodeEntities(body).trimEnd().replace(/^\n+/, "")}\n\`\`\`\n`
  );

  // Inline formatting - convert rich-text spans to their markdown
  // equivalents BEFORE the generic stripTags pass runs at the end of
  // this function. Without these conversions, bold / italic / links /
  // inline code / strikethrough / highlight all get stripped to plain
  // text and never make it back on pull. Each pattern emits standard
  // markdown (or GFM / Obsidian-style extensions), all of which survive
  // stripTags as plain characters and are parsed back to HTML on the
  // pull side by `inline()` in rich-text.ts.
  //
  // Order matters: inline `<code>` runs FIRST so we don't accidentally
  // re-process its inner text as emphasis. Links run before emphasis so
  // the `[text](url)` brackets don't get nibbled. Block code has already
  // run, so by the time we get here the only `<code>` left is inline.
  text = text.replace(
    /<code\b[^>]*>([\s\S]*?)<\/code>/g,
    (_match, body: string) => `\`${stripTags(body).trim()}\``
  );
  text = text.replace(
    /<a\b[^>]*?href=("|')([^"']+)\1[^>]*>([\s\S]*?)<\/a>/g,
    (_match, _q: string, href: string, body: string) =>
      `[${stripTags(body).trim()}](${href})`
  );
  text = text.replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/g, "**$1**");
  text = text.replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/g, "*$1*");
  text = text.replace(/<(?:s|del|strike)\b[^>]*>([\s\S]*?)<\/(?:s|del|strike)>/g, "~~$1~~");
  text = text.replace(/<mark\b[^>]*>([\s\S]*?)<\/mark>/g, "==$1==");
  text = text.replace(/<u\b[^>]*>([\s\S]*?)<\/u>/g, "__$1__");

  // Tables - a `<table>` of `<tr>`/`<th>`/`<td>` becomes a GFM pipe table.
  // Runs before the generic list / paragraph strippers so a cell's inner
  // `<p>` wrapper doesn't get turned into stray newlines. Inline marks
  // (bold / links / code) were already converted above, so cell text only
  // needs its block tags stripped, newlines flattened, and pipes escaped.
  text = text.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/g, (_match, tableBody: string) => {
    const rowMatches = Array.from(tableBody.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g));
    const rows = rowMatches.map((row) =>
      Array.from(row[1].matchAll(/<(t[hd])\b[^>]*>([\s\S]*?)<\/\1>/g)).map((cell) =>
        stripTags(cell[2]).replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|").trim()
      )
    );
    if (rows.length === 0) return "";
    const colCount = Math.max(...rows.map((cells) => cells.length));
    const pad = (cells: string[]) => {
      const padded = [...cells];
      while (padded.length < colCount) padded.push("");
      return padded;
    };
    const lines = [
      `| ${pad(rows[0]).join(" | ")} |`,
      `| ${Array.from({ length: colCount }, () => "---").join(" | ")} |`,
      ...rows.slice(1).map((cells) => `| ${pad(cells).join(" | ")} |`),
    ];
    return `\n\n${lines.join("\n")}\n\n`;
  });

  // Headings. Personal-profile sections call this with headingOffset=1 so
  // inner h2/h3 blocks nest below the section's own `## Name`; shared
  // documents call it without an offset so H1-H3 are first-class blocks.
  text = text.replace(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/g, (_match, level: string, body: string) => {
    const markdownLevel = Math.min(6, Number.parseInt(level, 10) + headingOffset);
    return `\n${"#".repeat(markdownLevel)} ${stripTags(body).trim()}\n`;
  });

  // Horizontal rule.
  text = text.replace(/<hr\s*\/?>/g, "\n\n---\n\n");

  // Blockquotes (rendered as callouts in the editor) → markdown `> `.
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/g, (_match, body: string) => {
    const inner = stripTags(body).trim();
    if (!inner) return "";
    return `\n${inner.split("\n").map((line) => `> ${line}`).join("\n")}\n`;
  });

  // Numbered lists.
  text = text.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, (_match, body: string) => {
    const items = Array.from(body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g))
      .map((match, index) => `${index + 1}. ${stripTags(match[1]).trim()}`)
      .filter((line) => line.replace(/^\d+\.\s*/, "").length > 0);
    return items.length ? `\n${items.join("\n")}\n` : "";
  });

  // Bullet lists.
  text = text.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, (_match, body: string) => {
    const items = Array.from(body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g))
      .map((match) => `- ${stripTags(match[1]).trim()}`)
      .filter((line) => line.length > 2);
    return items.length ? `\n${items.join("\n")}\n` : "";
  });

  // Paragraphs - drop empty paragraphs entirely so we don't emit blank lines
  // for `<p></p>` placeholders that the editor sometimes leaves behind.
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (_match, body: string) => {
    const inner = stripTags(body).trim();
    return inner ? `\n${inner}\n` : "";
  });

  // Strip any remaining tags + tidy whitespace. Collapse 3+ newlines to a
  // single blank line, kill trailing whitespace on each line, and trim.
  const cleaned = stripTags(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

export function sectionToMarkdown(section: CreedSection) {
  const cleaned = richHtmlToMarkdown(section.content, { headingOffset: 1 });

  // Nesting is carried by an invisible HTML comment on the heading line so it
  // round-trips through GitHub without changing the visible `##` heading level
  // (heading depth is reserved for in-content sub-headings). See
  // lib/section-hierarchy.ts and parseCreedMarkdown for the inverse.
  const depth = Math.min(MAX_SECTION_DEPTH, Math.max(0, Math.floor(section.depth ?? 0)));
  const depthMarker = depth > 0 ? ` <!-- creed:depth=${depth} -->` : "";

  return cleaned
    ? `## ${section.name}${depthMarker}\n\n${cleaned}\n`
    : `## ${section.name}${depthMarker}\n`;
}

function stripTags(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, ""));
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function buildVisibleCreedMarkdown(sections: CreedSection[]) {
  // One blank line between sections so the rendered file reads cleanly with
  // a single visual gap, not a stack of trailing newlines. Depths are
  // normalized against the visible (non-archived) order so the serialized
  // nesting markers are always valid.
  return normalizeSectionDepths(sections.filter((section) => !section.archived))
    .map((section) => sectionToMarkdown(section).trim())
    .filter(Boolean)
    .join("\n\n")
    .concat("\n");
}

export function buildAgentReadPayload(
  state: Pick<CreedState, "sections" | "writeToken" | "directEditToken" | "settings">,
  options?: {
    proposalUrl?: string;
    directEditUrl?: string;
    docsUrl?: string;
  }
) {
  void state;
  const docsUrl = options?.docsUrl ?? "https://creed.md/docs";
  return [
    "<!-- BEGIN CREED WORKSPACE CONTRACT -->",
    "Creed's personal profile has been removed. Do not ask for, read, create, update, or propose changes to a personal Creed profile or 10-section profile contract.",
    "",
    "Creed is now a shared Markdown document workspace. Use the document MCP tools as the source of truth:",
    "- `creed_list_documents` to find documents and folders.",
    "- `creed_get_folder` to inspect one folder's direct children.",
    "- `creed_read_document` before editing; use its `revision` as `expectedRevision`.",
    "- `creed_update_document` for content changes.",
    "- `creed_update_document_metadata` for title, description, status, type, stage, lifecycle, priority, and size.",
    "- `creed_create_document`, `creed_create_folder`, `creed_archive_document`, and `creed_archive_folder` for workspace organization.",
    "- `creed_list_document_comments`, `creed_create_document_comment`, and `creed_reply_to_document_comment` for review context and comments.",
    "",
    "Document edit policy:",
    "- Preserve unchanged Markdown exactly and make the smallest targeted edit.",
    "- Do not re-upload or reformat a whole document for a small change.",
    "- Do not submit if there is no visible change.",
    "- The server may apply the edit directly, turn each changed hunk into its own pending proposal, or reject it. Check the returned `outcome`.",
    "- Proposal/change labels must be short: 2 to 5 words, under 44 characters. Do not write sentence-length proposal names.",
    "- Re-read and retry on revision conflicts.",
    "",
    "Editor Markdown contract:",
    "- Body only. Do not add YAML frontmatter.",
    "- The document title is metadata. Do not repeat it as an H1 in the body unless the user explicitly asks.",
    "- Use `#`, `##`, and `###` headings for outline/navigation. Headings are visual structure only; they do not create separate section records.",
    "- A document may start at H2; the sidebar treats the highest heading level present as root and indents deeper headings from there.",
    "- Do not use `<!-- creed:depth -->` markers.",
    "- Supported blocks: headings, paragraphs, bullet lists, numbered lists, `>` callouts, `---` dividers, inline `#tags`, fenced code blocks, GFM pipe tables, and fenced ```mermaid diagrams.",
    "- Supported internal references: `[[doc:SLUG]]`, `[[folder:SLUG]]`, `![[doc:SLUG]]`, and `![[folder:SLUG]]`.",
    "- Supported URL references: `[mention](https://url)`, `[bookmark](https://url)`, `[embed](https://url)`, and ordinary Markdown links.",
    "",
    "Choose structure by meaning:",
    "- Use a table for comparisons across repeated fields.",
    "- Use Mermaid for branching flows, sequences, relationships, journeys, and data models.",
    "- Use numbered lists for ordered steps.",
    "- Use callouts for constraints, warnings, or decisions that should stand out.",
    "- Use concise prose for single facts.",
    "",
    `Docs: ${docsUrl}`,
    "<!-- END CREED WORKSPACE CONTRACT -->",
  ].join("\n");
}

// Starter section presets were removed from the add-section composer: the
// product no longer ships opinionated templates (Beliefs / Constraints / etc.).
// The export stays as an empty list so `createStarterContent` keeps a single
// lookup path and any remaining importers compile.
export const sectionSuggestions: {
  name: string;
  description: string;
  starter: string;
}[] = [];

export function createStarterContent(name: string) {
  const suggestion = sectionSuggestions.find((item) => item.name === name);
  if (suggestion) {
    return suggestion.starter;
  }

  return `<h2>${name}</h2><p>Start shaping this section. Keep it specific enough that an agent can act on it without guessing.</p>`;
}

export function getProposalPreviewText(draft: ProposalDraft) {
  const normalizedDraft = normalizeLegacyProposalDraft(draft);

  if (normalizedDraft.kind === "new-section") {
    return (
      normalizedDraft.contentMarkdown?.trim() ||
      normalizedDraft.contentHtml?.trim() ||
      normalizedDraft.name.trim()
    );
  }

  if (normalizedDraft.kind === "delete-section") {
    return "Delete section";
  }

  if (normalizedDraft.kind === "rename-section") {
    return normalizedDraft.name.trim() || "Rename section";
  }

  if (normalizedDraft.kind === "recolor-section") {
    const label = accentLabelMap[normalizedDraft.accent] ?? normalizedDraft.accent;
    return `Change accent to ${label}`;
  }

  if (normalizedDraft.kind === "reorder-section") {
    if (normalizedDraft.position === "first") return "Move to top";
    if (normalizedDraft.position === "last") return "Move to bottom";
    if (normalizedDraft.afterSectionId)
      return `Move after ${normalizedDraft.afterSectionId}`;
    return "Reorder section";
  }

  return normalizedDraft.contentMarkdown?.trim() || normalizedDraft.contentHtml?.trim() || "";
}

// Activity rows render before/after through a word-level diff. For meta
// proposals (delete / rename / recolor), the raw content vs. a short summary
// produces a misleading "everything was deleted" diff. This helper returns
// before/after strings tailored to the meta kind so the diff stays useful
// and proportional. Returns null for non-meta drafts; callers should fall
// back to their existing behaviour in that case.
export function getMetaProposalDiffText(
  draft: ProposalDraft,
  section?: { name?: string; accent?: AccentKey } | null
): { before: string; after: string } | null {
  if (draft.kind === "delete-section") {
    const name = section?.name ?? "section";
    return {
      before: `Keep ${name}`,
      after: `Delete ${name}`,
    };
  }
  if (draft.kind === "rename-section") {
    const next = draft.name.trim() || "(unnamed)";
    return {
      before: `Name: ${section?.name ?? "(current)"}`,
      after: `Name: ${next}`,
    };
  }
  if (draft.kind === "recolor-section") {
    const beforeLabel = section?.accent ? accentLabelMap[section.accent] ?? section.accent : "(current)";
    const afterLabel = accentLabelMap[draft.accent] ?? draft.accent;
    return {
      before: `Accent: ${beforeLabel}`,
      after: `Accent: ${afterLabel}`,
    };
  }
  if (draft.kind === "reorder-section") {
    const target =
      draft.position === "first"
        ? "top of file"
        : draft.position === "last"
          ? "bottom of file"
          : draft.afterSectionId
            ? `after ${draft.afterSectionId}`
            : "(unspecified position)";
    const name = section?.name ?? "section";
    return {
      before: `Keep ${name} in place`,
      after: `Move ${name} to ${target}`,
    };
  }
  return null;
}

// Pure helper used by both client and server. Returns a new sections array
// with the targeted section moved per the reorder draft, or the input array
// unchanged when the draft is malformed / target missing.
export function applyReorderDraft<T extends { id: string }>(
  sections: T[],
  sectionId: string,
  draft: { afterSectionId?: string; position?: "first" | "last" }
): T[] {
  const fromIndex = sections.findIndex((section) => section.id === sectionId);
  if (fromIndex === -1) return sections;
  const next = [...sections];
  const [moved] = next.splice(fromIndex, 1);
  if (draft.position === "first") {
    next.unshift(moved);
    return next;
  }
  if (draft.position === "last") {
    next.push(moved);
    return next;
  }
  if (draft.afterSectionId) {
    const anchorIndex = next.findIndex((section) => section.id === draft.afterSectionId);
    if (anchorIndex === -1) {
      next.splice(fromIndex, 0, moved);
      return next;
    }
    next.splice(anchorIndex + 1, 0, moved);
    return next;
  }
  next.splice(fromIndex, 0, moved);
  return next;
}

export function inferAgentSectionAccent(input: {
  name: string;
  content?: string;
  insertAfterSectionId?: string;
}): AccentKey {
  const source = `${input.name} ${input.content ?? ""}`.toLowerCase();

  if (input.insertAfterSectionId) {
    if (input.insertAfterSectionId === "identity") return "identity";
    if (input.insertAfterSectionId === "stack") return "stack";
    if (input.insertAfterSectionId === "operating-principles") return "operating-principles";
    if (input.insertAfterSectionId === "decisions") return "decisions";
    if (input.insertAfterSectionId === "output") return "output";
    if (input.insertAfterSectionId === "preferences") return "preferences";
    if (input.insertAfterSectionId === "workflows") return "workflows";
    if (input.insertAfterSectionId === "tools-and-spaces") return "tools";
    if (input.insertAfterSectionId === "boundaries") return "boundaries";
    if (input.insertAfterSectionId === "open-questions") return "questions";
  }

  if (/\b(identity|about|profile|who i am|background)\b/.test(source)) {
    return "identity";
  }

  if (/\b(stack|tech stack|tools|frameworks|languages|platforms|spaces|apps|accounts|environment)\b/.test(source)) {
    return "tools";
  }

  if (/\b(convention|principle|operating principle|rule|guideline|standard|review standard)\b/.test(source)) {
    return "operating-principles";
  }

  if (/\b(preference|tone|communication|uncertainty|style|response)\b/.test(source)) {
    return "preferences";
  }

  if (/\b(workflow|process|ritual|checklist|sequence|cadence)\b/.test(source)) {
    return "workflows";
  }

  if (/\b(decision|tradeoff|chose|choice|adopted|switched)\b/.test(source)) {
    return "decisions";
  }

  if (/\b(boundary|privacy|secret|avoid|risk|never|constraint)\b/.test(source)) {
    return "boundaries";
  }

  if (/\b(open question|question|unresolved|undecided|unknown)\b/.test(source)) {
    return "questions";
  }

  if (/\b(skill|playbook|pattern|reference|research notes|notes|knowledge)\b/.test(source)) {
    return "skills";
  }

  if (/\b(project|roadmap|milestone|plan|launch|shipping)\b/.test(source)) {
    return "projects";
  }

  if (/\b(output|writing|delivery)\b/.test(source)) {
    return "output";
  }

  return "custom";
}

// Placeholder values used as a fallback when no signed-in user state is
// available (SSR loading, marketing routes, demo mode). Real user state
// always overwrites these via `loadCreedState` before the app renders.
//
// The example agent prompts below hard-code `https://creed.md` because
// they illustrate what a real, hosted Creed deployment looks like - not
// because the runtime depends on that origin. If you fork Creed and host
// it at a different domain, the live read / MCP / write URLs the user
// sees in their own Connect modal come from server-state at request time
// and reflect YOUR origin correctly; only these dormant example strings
// still mention `creed.md`. They're shown in onboarding example screens
// and copy-prompt previews. Swap them to your domain if you want forks
// to demo against their own host out of the box.
const EXAMPLE_READ_TOKEN = "xt_example_read_0000";
const EXAMPLE_WRITE_TOKEN = "xt_example_write_0000";
const EXAMPLE_DIRECT_TOKEN = "xt_example_direct_0000";

export const initialCreedState: CreedState = {
  user: {
    name: "",
    handle: "",
    avatarInitials: "",
    avatarUrl: undefined,
    email: "",
  },
  readUrl: `https://creed.md/u/example?token=${EXAMPLE_READ_TOKEN}`,
  readToken: EXAMPLE_READ_TOKEN,
  writeToken: EXAMPLE_WRITE_TOKEN,
  directEditToken: EXAMPLE_DIRECT_TOKEN,
  mcpUrl: "https://creed.md/mcp",
  mcpStatus: "waiting",
  mcpLastUsed: undefined,
  mcpLastClientName: undefined,
  mcpClients: [],
  locked: false,
  sectionLockOverrides: [],
  lastSavedAt: null,
  saving: false,
  sections: [
    {
      id: IDENTITY_SECTION_ID,
      kind: "rich-text",
      template: "identity",
      name: "Identity",
      accent: "identity",
      agentWritable: true,
      agentPermission: "propose",
      lastEditedBy: "You",
      lastEditedType: "user",
      lastEditedLabel: "just now",
      content:
        "<p>Use this section to give every AI a stable picture of who you are, how you think, and what should stay true across every conversation.</p>",
    },
    {
      id: GOALS_SECTION_ID,
      kind: "rich-text",
      template: "focus",
      name: "Goals",
      accent: "projects",
      agentWritable: true,
      agentPermission: "propose",
      lastEditedBy: "You",
      lastEditedType: "user",
      lastEditedLabel: "just now",
      content:
        "<p>What you're working toward right now. Keep it specific so AI can pull on the same thread you are.</p>",
    },
    {
      id: WORK_SECTION_ID,
      kind: "rich-text",
      template: "freeform",
      name: "Work",
      accent: "tools",
      agentWritable: true,
      agentPermission: "propose",
      lastEditedBy: "You",
      lastEditedType: "user",
      lastEditedLabel: "just now",
      content:
        "<p>What you do, the tools you reach for, and how you like to work. Anything an AI should default to about your craft goes here.</p>",
    },
    {
      id: PREFERENCES_SECTION_ID,
      kind: "rich-text",
      template: "principles",
      name: "Preferences",
      accent: "preferences",
      agentWritable: true,
      agentPermission: "propose",
      lastEditedBy: "You",
      lastEditedType: "user",
      lastEditedLabel: "just now",
      content:
        "<ul class=\"creed-list creed-list-bullet\"><li>Lead with the answer, then the supporting detail.</li><li>Keep replies tight unless depth genuinely helps.</li><li>Skip filler, hedging, and over-praise.</li></ul>",
    },
    {
      id: ROUTINES_SECTION_ID,
      kind: "rich-text",
      template: "principles",
      name: "Routines",
      accent: "workflows",
      agentWritable: true,
      agentPermission: "propose",
      lastEditedBy: "You",
      lastEditedType: "user",
      lastEditedLabel: "just now",
      content:
        "<ul class=\"creed-list creed-list-bullet\"><li>Habits and rhythms an AI should respect when planning, scheduling, or following up.</li></ul>",
    },
  ],
  proposals: [],
  activity: [],
  settings: {
    requireApproval: true,
    integrations: {
      google: {
        provider: "google",
        label: "Google",
        status: "not-connected",
        disconnectable: false,
        accountLabel: undefined,
      },
      github: {
        provider: "github",
        label: "GitHub",
        status: "not-connected",
        disconnectable: true,
      },
    },
    versionControl: {
      provider: "github",
      repoOwner: "",
      repoName: "",
      branch: "",
      path: "creed.md",
      syncStatus: "not-configured",
    },
  },
  connections: [
    {
      id: "chatgpt",
      name: "ChatGPT",
      icon: "chatgpt",
      status: "not-connected",
      description: "Add Creed as a connector so ChatGPT starts from your context.",
      connectHint:
        "In ChatGPT, open Settings > Apps & Connectors, turn on Developer mode, then Create a connector with the URL. (Plus, Pro, or Business.)",
    },
    {
      id: "claude",
      name: "Claude",
      icon: "claude",
      status: "not-connected",
      description: "Connect Creed as a custom connector in Claude.",
      connectHint:
        "In Claude, open Settings > Connectors > Add custom connector, paste the URL above, then Connect to authorize in the browser.",
    },
    {
      id: "codex",
      name: "Codex",
      icon: "codex",
      status: "not-connected",
      description: "Add Creed as a remote MCP server for agentic coding runs.",
      connectHint:
        "Run the command, then codex mcp login creed. If Codex later reports OAuth authorization required, run codex mcp login creed again.",
      command: "codex mcp add creed --url https://creed.md/mcp",
    },
    {
      id: "claudecode",
      name: "Claude Code",
      icon: "claudecode",
      status: "not-connected",
      description: "Connect Creed so every Claude Code session starts with your context.",
      connectHint: "Run the command, then /mcp in Claude Code to authorize in the browser.",
      command: "claude mcp add -t http creed https://creed.md/mcp",
    },
    {
      id: "openclaw",
      name: "OpenClaw",
      icon: "openclaw",
      status: "not-connected",
      description: "Add Creed to OpenClaw as a remote MCP server.",
      connectHint:
        "Add a custom MCP server pointing at the URL above, then authorize Creed in the browser window your client opens.",
    },
    {
      id: "hermes",
      name: "Hermes",
      icon: "hermes",
      status: "not-connected",
      description: "Add Creed to Hermes as a remote MCP server.",
      connectHint:
        "Add a custom MCP server pointing at the URL above, then authorize Creed in the browser window your client opens.",
    },
    {
      id: "grok",
      name: "Grok",
      icon: "grok",
      status: "not-connected",
      description: "Add Creed to Grok as a custom connector.",
      connectHint:
        "In Grok, go to grok.com/connectors, create a New Connector > Custom, paste the URL above, and authorize.",
    },
    {
      id: "opencode",
      name: "OpenCode",
      icon: "opencode",
      status: "not-connected",
      description: "Add Creed to OpenCode as a remote MCP server.",
      connectHint:
        "Add the URL to opencode.json as a remote server, then run opencode mcp auth creed to authorize in the browser.",
    },
    {
      id: "cursor",
      name: "Cursor",
      icon: "cursor",
      status: "not-connected",
      description: "One-click install Creed into Cursor, then authorize.",
      connectHint:
        "Use the one-click button to add Creed to Cursor as a remote MCP server, then authorize Creed in the browser window Cursor opens.",
    },
    {
      id: "devin",
      name: "Devin",
      icon: "devin",
      status: "not-connected",
      description: "Add Creed to Devin from the MCP Marketplace.",
      connectHint:
        "In Devin, open Settings > MCP Marketplace, add your own MCP with Transport HTTP and the URL above, set Authentication to OAuth, then authorize.",
    },
    {
      id: "v0",
      name: "v0",
      icon: "v0",
      status: "not-connected",
      description: "Add Creed to v0 as a custom MCP connection.",
      connectHint:
        "In v0, open MCP Connections (or Add MCP in the prompt bar), add a custom server with the URL above, and choose OAuth.",
    },
    {
      id: "custom",
      name: "Custom Agent",
      icon: "custom",
      status: "not-connected",
      description: "Any client that speaks MCP can connect with the URL above.",
      connectHint: "Add a custom MCP server pointing at the URL above, then authorize Creed in the browser.",
    },
  ],
  onboarding: initialOnboardingState,
  mutationTick: 0,
  sectionRevisions: {},
};
