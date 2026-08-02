import "server-only";
// Server-side execution of Agent actions - the in-app "Creed" agent behaves
// exactly like an external MCP agent:
//   • a section set to DIRECT is edited immediately and persisted (survives a
//     refresh), just like /api/creed/write;
//   • every other permission (propose, read-only, hidden) becomes a pending
//     proposal the user reviews, filed into creed_proposals like the proposals
//     API;
//   • delete is ALWAYS a proposal;
//   • reversible meta (archive / restore / set-permission) applies immediately.
// The user's own agent can see and edit hidden sections; the route includes
// them. The client never mutates - it just refreshes once we've persisted, so
// there is no client/server race (the old bug where accepted edits vanished on
// refresh).

import { randomBytes } from "crypto";
import type { User } from "@supabase/supabase-js";
import {
  applyReorderDraft,
  getMetaProposalDiffText,
  getProposalPreviewText,
  permissionToWritable,
  type AccentKey,
  type ActivityEntry,
  type CreedSection,
  type CreedState,
  type ProposalDraft,
} from "@/lib/creed-data";
import { markdownToRichHtml, normalizeRichTextInput } from "@/lib/rich-text";
import { loadCreedState, persistCreedState } from "@/lib/creed-backend";
import {
  companyMcpWrite,
  setCompanySectionArchived,
  type CompanyMcpOp,
} from "@/lib/company-sections";
import { getPersonalCreedId } from "@/lib/creed-membership";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/observability";
import type { AgentAction, AgentExecResult } from "@/lib/panel/agent";

export const CREED_AGENT_NAME = "Creed";

type UpsertTable = {
  upsert: (
    values: Record<string, unknown>,
    options: { onConflict: string }
  ) => Promise<{ error: { message: string } | null }>;
};

export type AgentExecution = {
  ok: boolean;
  reason: string;
  results: AgentExecResult[];
};

const KIND_META: Record<string, { changeType: string; impact: string; confidence: string }> = {
  "rich-text": { changeType: "refines-existing", impact: "future-responses", confidence: "repeated" },
  "new-section": { changeType: "new-memory", impact: "future-responses", confidence: "durable" },
  "delete-section": { changeType: "refines-existing", impact: "future-responses", confidence: "durable" },
  "rename-section": { changeType: "refines-existing", impact: "future-responses", confidence: "durable" },
  "recolor-section": { changeType: "refines-existing", impact: "future-responses", confidence: "durable" },
  "reorder-section": { changeType: "refines-existing", impact: "future-responses", confidence: "durable" },
};

const META_SUMMARY: Record<string, (name: string) => string> = {
  "delete-section": (name) => `Suggested deleting ${name.toLowerCase()}`,
  "rename-section": (name) => `Suggested renaming ${name.toLowerCase()}`,
  "recolor-section": (name) => `Suggested recolouring ${name.toLowerCase()}`,
  "reorder-section": (name) => `Suggested moving ${name.toLowerCase()}`,
};

// A model reply that echoes HTML into a "markdown" field would render as escaped
// tags; route obvious block HTML to contentHtml instead.
const HTML_BLOCK = /<\/?(p|div|span|h[1-6]|ul|ol|li|blockquote|strong|em|code|pre|br|hr|a|mark|s|u|b|i)\b/i;
function richContent(content: string): { contentHtml?: string; contentMarkdown?: string } {
  return HTML_BLOCK.test(content) ? { contentHtml: content } : { contentMarkdown: content };
}

function stamp(section: CreedSection): CreedSection {
  return { ...section, lastEditedBy: CREED_AGENT_NAME, lastEditedType: "agent", lastEditedLabel: "just now" };
}

function activity(entry: Omit<ActivityEntry, "dayLabel" | "timeLabel" | "actorType">): ActivityEntry {
  return { dayLabel: "Today", timeLabel: "just now", actorType: "agent", ...entry };
}

export async function executeAgentActions({
  user,
  actions,
  state: preloaded,
}: {
  user: User;
  actions: AgentAction[];
  state?: CreedState;
}): Promise<AgentExecution> {
  const admin = getSupabaseAdminClient();
  const baseState =
    preloaded ?? (await loadCreedState(admin as never, user, { proposalLimit: 1, activityLimit: 1 })).state;
  const creedId = baseState.creedId ?? (await getPersonalCreedId(admin as never, user.id));
  if (!creedId) {
    return { ok: false, reason: "Could not resolve Creed for proposal.", results: [] };
  }

  // Route direct-vs-proposal against the ORIGINAL permissions, so a
  // set-permission earlier in the same run can't silently upgrade a later
  // edit from "reviewable proposal" to "applied without review".
  const originalPermission = new Map(baseState.sections.map((s) => [s.id, s.agentPermission]));
  const wasDirect = (id: string) => originalPermission.get(id) === "direct";

  // Working copies for direct application.
  let sections = [...baseState.sections];
  const newActivity: ActivityEntry[] = [];
  const results: AgentExecResult[] = [];
  let directChanged = false;

  // Strictly-increasing timestamps so multiple rows filed in one run keep a
  // stable created_at order (loadCreedState orders by created_at DESC).
  const baseMs = Date.now();
  let seq = 0;
  const nextNow = () => new Date(baseMs + seq++).toISOString();
  const proposalTable = admin.from("creed_proposals") as unknown as UpsertTable;
  const activityTable = admin.from("creed_activity") as unknown as UpsertTable;

  const byId = (id: string) => sections.find((section) => section.id === id && !section.archived);

  // File one proposal row (+ activity row) and record the result.
  async function fileProposal(params: {
    sectionId: string;
    sectionName: string;
    accent: AccentKey;
    draft: ProposalDraft;
    reason: string;
    beforeText: string | null;
    baseSection: CreedSection | null;
  }): Promise<AgentExecResult | null> {
    const proposalId = `panel-${baseMs.toString(36)}-${randomBytes(4).toString("hex")}`;
    const rowNow = nextNow();
    const meta = KIND_META[params.draft.kind] ?? KIND_META["rich-text"];
    const isNew = params.draft.kind === "new-section";
    const metaDiff = getMetaProposalDiffText(params.draft, params.baseSection);

    const { error: proposalError } = await proposalTable.upsert(
      {
        id: proposalId,
        creed_id: creedId,
        user_id: user.id,
        section_id: isNew ? "new-section" : params.sectionId,
        section_name: params.sectionName,
        accent: params.accent,
        agent_name: CREED_AGENT_NAME,
        change_type: meta.changeType,
        reason: params.reason,
        impact: meta.impact,
        confidence: meta.confidence,
        draft: params.draft,
        status: "pending",
        base_revision: params.baseSection ? baseState.sectionRevisions[params.baseSection.id] ?? null : null,
        created_at: rowNow,
        updated_at: rowNow,
      },
      { onConflict: "id" }
    );
    if (proposalError) {
      log.error("agent_proposal_insert_failed", { userId: user.id, message: proposalError.message });
      return null;
    }
    // Activity is best-effort. The Supabase builder is a thenable, not a real
    // Promise, so `.catch()` on it throws "catch is not a function" - await it
    // inside try/catch instead, or the whole run fails after the edit lands.
    try {
      await activityTable.upsert(
        {
          id: `activity-${proposalId}`,
          creed_id: creedId,
          user_id: user.id,
          proposal_id: proposalId,
          section_id: isNew ? "new-section" : params.sectionId,
          section_name: params.sectionName,
          accent: params.accent,
          actor: CREED_AGENT_NAME,
          actor_type: "agent",
          summary: META_SUMMARY[params.draft.kind]?.(params.sectionName) ?? `Suggested ${params.sectionName.toLowerCase()} update`,
          status: "pending",
          change_type: meta.changeType,
          reason: params.reason,
          impact: meta.impact,
          confidence: meta.confidence,
          before_text: metaDiff ? metaDiff.before : params.beforeText,
          after_text: metaDiff ? metaDiff.after : getProposalPreviewText(params.draft),
          created_at: rowNow,
        },
        { onConflict: "id" }
      );
    } catch {
      // ignore
    }
    return { kind: "proposal", proposalId, sectionId: params.sectionId, label: "" };
  }

  for (const action of actions) {
    const label = labelFor(action, sections);

    switch (action.kind) {
      // --- reversible meta: always applied directly ---
      case "archive-section": {
        const section = byId(action.sectionId);
        if (!section) return notFound();
        sections = sections.map((s) => (s.id === section.id ? { ...s, archived: true } : s));
        newActivity.unshift(
          activity({
            id: `activity-direct-${Date.now()}-${randomBytes(3).toString("hex")}`,
            sectionId: section.id, sectionName: section.name, accent: section.accent, actor: CREED_AGENT_NAME,
            summary: `Archived ${section.name.toLowerCase()}`, status: "direct", changeType: "refines-existing",
            reason: action.reason || "Archived from Panel", impact: "future-responses", confidence: "durable",
            beforeText: `Keep ${section.name}`, afterText: `Archive ${section.name}`,
          })
        );
        directChanged = true;
        results.push({ kind: "applied", sectionId: section.id, label });
        break;
      }
      case "restore-section": {
        const section = sections.find((s) => s.id === action.sectionId && s.archived);
        if (!section) return notFound("Couldn't find that archived section.");
        sections = sections.map((s) => (s.id === section.id ? { ...s, archived: false } : s));
        directChanged = true;
        results.push({ kind: "applied", sectionId: section.id, label });
        break;
      }
      case "set-permission": {
        const section = byId(action.sectionId);
        if (!section) return notFound();
        sections = sections.map((s) =>
          s.id === section.id
            ? { ...s, agentPermission: action.permission, agentWritable: permissionToWritable(action.permission) }
            : s
        );
        directChanged = true;
        results.push({ kind: "applied", sectionId: section.id, label });
        break;
      }

      // --- delete: always a proposal ---
      case "delete-section": {
        const section = byId(action.sectionId);
        if (!section) return notFound();
        const filed = await fileProposal({
          sectionId: section.id, sectionName: section.name, accent: section.accent,
          draft: { kind: "delete-section" }, reason: action.reason || "Requested from Panel",
          beforeText: section.content, baseSection: section,
        });
        if (!filed) return failed();
        results.push({ ...filed, label });
        break;
      }

      // --- new-section: always a proposal (review new content) ---
      case "new-section": {
        const filed = await fileProposal({
          sectionId: "new-section", sectionName: action.name, accent: (action.accent as AccentKey) ?? "custom",
          draft: { kind: "new-section", name: action.name, accent: action.accent as AccentKey | undefined, ...(action.content ? richContent(action.content) : {}) },
          reason: action.reason || "Requested from Panel", beforeText: null, baseSection: null,
        });
        if (!filed) return failed();
        results.push({ ...filed, label });
        break;
      }

      // --- duplicate: direct if the source is direct, else a proposal ---
      case "duplicate-section": {
        const source = byId(action.sectionId);
        if (!source) return notFound();
        if (wasDirect(source.id)) {
          const copy = stamp({
            ...source,
            id: `section-${Date.now()}-${randomBytes(3).toString("hex")}`,
            name: `${source.name} Copy`,
          });
          const index = sections.findIndex((s) => s.id === source.id);
          sections = [...sections.slice(0, index + 1), copy, ...sections.slice(index + 1)];
          directChanged = true;
          results.push({ kind: "applied", sectionId: copy.id, label });
        } else {
          const filed = await fileProposal({
            sectionId: source.id, sectionName: `${source.name} Copy`, accent: source.accent,
            draft: { kind: "new-section", name: `${source.name} Copy`, contentHtml: source.content, accent: source.accent, insertAfterSectionId: source.id },
            reason: action.reason || "Duplicated from Panel", beforeText: null, baseSection: null,
          });
          if (!filed) return failed();
          results.push({ ...filed, label });
        }
        break;
      }

      // --- content edits: direct on direct sections, else a proposal ---
      case "edit":
      case "rename-section":
      case "recolor-section":
      case "reorder-section": {
        const section = byId(action.sectionId);
        if (!section) return notFound();

        if (wasDirect(section.id)) {
          sections = applyDirectEdit(sections, section, action, newActivity);
          directChanged = true;
          results.push({ kind: "applied", sectionId: section.id, label });
        } else {
          const draft = editDraft(action);
          const filed = await fileProposal({
            sectionId: section.id, sectionName: section.name, accent: section.accent, draft,
            reason: action.reason || "Requested from Panel", beforeText: section.content, baseSection: section,
          });
          if (!filed) return failed();
          results.push({ ...filed, label });
        }
        break;
      }
    }
  }

  // Persist all direct changes in one authoritative write (like the write API).
  if (directChanged) {
    try {
      await persistCreedState(admin as never, user.id, {
        ...baseState,
        sections,
        activity: [...newActivity, ...baseState.activity],
        mutationTick: baseState.mutationTick + 1,
      });
    } catch (error) {
      log.error("agent_persist_failed", { userId: user.id, message: error instanceof Error ? error.message : "unknown" });
      return { ok: false, reason: "Couldn't save the changes. Try again", results: [] };
    }
  }

  return { ok: true, reason: "", results };
}

function notFound(reason = "Couldn't find that section anymore."): AgentExecution {
  return { ok: false, reason, results: [] };
}
function failed(): AgentExecution {
  return { ok: false, reason: "Couldn't save the change. Try again", results: [] };
}

// Build the proposal draft for a content-shaped action.
function editDraft(action: AgentAction): ProposalDraft {
  switch (action.kind) {
    case "edit":
      return { kind: "rich-text", ...richContent(action.content) };
    case "rename-section":
      return { kind: "rename-section", name: action.name };
    case "recolor-section":
      return { kind: "recolor-section", accent: action.accent as AccentKey };
    case "reorder-section":
      return { kind: "reorder-section", position: action.position, afterSectionId: action.afterSectionId };
    default:
      return { kind: "rich-text" };
  }
}

// Apply a content-shaped action directly to the sections array + log activity.
function applyDirectEdit(
  sections: CreedSection[],
  section: CreedSection,
  action: AgentAction,
  activityLog: ActivityEntry[]
): CreedSection[] {
  const push = (entry: Omit<ActivityEntry, "dayLabel" | "timeLabel" | "actorType">) => activityLog.unshift(activity(entry));
  const id = `activity-direct-${Date.now()}-${randomBytes(3).toString("hex")}`;
  const common = {
    id, sectionId: section.id, accent: section.accent, actor: CREED_AGENT_NAME, status: "direct" as const,
    changeType: "refines-existing" as const, reason: action.reason || "Applied directly", impact: "future-responses" as const, confidence: "durable" as const,
  };

  if (action.kind === "edit") {
    const content = normalizeRichTextInput(richContent(action.content)) || section.content;
    push({ ...common, sectionName: section.name, summary: `Updated ${section.name.toLowerCase()}`, beforeText: section.content, afterText: content });
    return sections.map((s) => (s.id === section.id ? stamp({ ...s, content }) : s));
  }
  if (action.kind === "rename-section") {
    push({ ...common, sectionName: action.name, summary: `Renamed ${section.name.toLowerCase()} → ${action.name.toLowerCase()}`, beforeText: `Name: ${section.name}`, afterText: `Name: ${action.name}` });
    return sections.map((s) => (s.id === section.id ? stamp({ ...s, name: action.name }) : s));
  }
  if (action.kind === "recolor-section") {
    push({ ...common, sectionName: section.name, summary: `Recoloured ${section.name.toLowerCase()}`, beforeText: `Accent: ${section.accent}`, afterText: `Accent: ${action.accent}` });
    return sections.map((s) => (s.id === section.id ? stamp({ ...s, accent: action.accent as AccentKey }) : s));
  }
  // reorder
  push({ ...common, sectionName: section.name, summary: `Moved ${section.name.toLowerCase()}`, beforeText: `Keep ${section.name} in place`, afterText: `Move ${section.name}` });
  return applyReorderDraft(sections, section.id, {
    position: action.kind === "reorder-section" ? action.position : undefined,
    afterSectionId: action.kind === "reorder-section" ? action.afterSectionId : undefined,
  });
}

// A short human label for the panel result card, per action.
function labelFor(action: AgentAction, sections: CreedSection[]): string {
  const name = (id: string) => sections.find((s) => s.id === id)?.name ?? "section";
  switch (action.kind) {
    case "edit":
      return `Edited ${name(action.sectionId)}`;
    case "new-section":
      return `New section “${action.name}”`;
    case "delete-section":
      return `Delete ${name(action.sectionId)}`;
    case "rename-section":
      return `Renamed to “${action.name}”`;
    case "recolor-section":
      return `Recoloured ${name(action.sectionId)}`;
    case "reorder-section":
      return `Moved ${name(action.sectionId)}`;
    case "duplicate-section":
      return `Duplicated ${name(action.sectionId)}`;
    case "archive-section":
      return `Archived ${name(action.sectionId)}`;
    case "restore-section":
      return `Restored ${name(action.sectionId)}`;
    case "set-permission":
      return `${name(action.sectionId)} → ${action.permission}`;
  }
}

// Company execution of the in-app "Creed" agent. Same behaviour as personal -
// the model plans the same actions - but each one runs through companyMcpWrite,
// which is the SINGLE company write path: it re-derives the acting member's
// effective per-section permission (min of the owner/admin ceiling and the
// member's own agent ceiling), applies a Direct edit or files a proposal
// accordingly, versions + logs activity, and attributes it to the member as
// "[member]'s Creed". Nothing about the write logic differs from personal; only
// the persistence target (company tables) and the attribution do.
function toHtml(content: string): string {
  if (!content.trim()) return "";
  return HTML_BLOCK.test(content) ? content : markdownToRichHtml(content);
}

function companyOpForAction(
  action: AgentAction,
  byId: (id: string) => CreedSection | undefined
): CompanyMcpOp | null {
  switch (action.kind) {
    case "edit":
      return { kind: "update", sectionId: action.sectionId, contentHtml: toHtml(action.content) };
    case "new-section":
      return {
        kind: "create",
        name: action.name,
        contentHtml: toHtml(action.content),
        accent: action.accent as string | undefined,
      };
    case "delete-section":
      return { kind: "delete", sectionId: action.sectionId };
    case "rename-section":
      return { kind: "rename", sectionId: action.sectionId, name: action.name };
    case "recolor-section":
      return { kind: "recolor", sectionId: action.sectionId, accent: action.accent as string };
    case "reorder-section":
      return {
        kind: "reorder",
        sectionId: action.sectionId,
        afterSectionId: action.afterSectionId,
        position: action.position,
      };
    case "duplicate-section": {
      const source = byId(action.sectionId);
      if (!source) return null;
      return {
        kind: "create",
        name: `${source.name} Copy`,
        contentHtml: source.content,
        accent: source.accent,
        insertAfterSectionId: source.id,
      };
    }
    default:
      return null;
  }
}

export async function executeCompanyAgentActions({
  user,
  creedId,
  actions,
  sections,
}: {
  user: User;
  creedId: string;
  actions: AgentAction[];
  sections: CreedSection[];
}): Promise<AgentExecution> {
  const results: AgentExecResult[] = [];
  const byId = (id: string) => sections.find((s) => s.id === id && !s.archived);

  for (const action of actions) {
    const label = labelFor(action, sections);

    // Archive / restore are owner/admin lifecycle; route through the company
    // admin path (it re-checks role and freeze). set-permission is not something
    // the agent reassigns on a shared team file, so it is skipped for company.
    if (action.kind === "archive-section" || action.kind === "restore-section") {
      const res = await setCompanySectionArchived({
        creedId,
        user,
        sectionId: action.sectionId,
        archived: action.kind === "archive-section",
      });
      if (!res.ok) return { ok: false, reason: res.error, results };
      results.push({ kind: "applied", sectionId: action.sectionId, label });
      continue;
    }
    if (action.kind === "set-permission") continue;

    const op = companyOpForAction(action, byId);
    if (!op) continue;

    const res = await companyMcpWrite({ creedId, user, agentName: CREED_AGENT_NAME, op });
    if (!res.ok) return { ok: false, reason: res.error, results };

    const sectionId = "sectionId" in op ? op.sectionId : "";
    results.push(
      res.filedProposal
        ? { kind: "proposal", proposalId: res.proposalId ?? "", sectionId, label }
        : { kind: "applied", sectionId, label }
    );
  }

  return { ok: true, reason: "", results };
}
