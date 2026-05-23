import { NextResponse } from "next/server";
import type {
  AccentKey,
  ActivityEntry,
  CreedSection,
} from "@/lib/creed-data";
import {
  ACCENT_KEYS,
  accentLabelMap,
  getProposalPreviewText,
  inferAgentSectionAccent,
  inferSectionTemplate,
  isAccentKey,
  normalizeLegacyAccent,
  normalizeLegacyProposalDraft,
  normalizeLegacySectionId,
} from "@/lib/creed-data";
import {
  findUserIdByDirectEditToken,
  loadCreedState,
  persistCreedState,
  recordConnectionUsage,
} from "@/lib/creed-backend";
import { checkRateLimit } from "@/lib/rate-limit";
import { markdownToRichHtml, normalizeRichTextInput } from "@/lib/rich-text";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

// Under the unified model every section is rich-text. Legacy patch kinds are
// accepted for back-compat with older agents and coerced into rich-text
// content through the standard normalizers.

type RichTextPatch = {
  kind: "rich-text";
  contentHtml?: string;
  contentMarkdown?: string;
};

type LegacyChipsPatch = { kind: "chips"; chips: string[] };
type LegacyFocusPatch = { kind: "focus"; content: string };
type LegacyDecisionsPatch = { kind: "decisions"; title: string; details?: string };
type LegacyRulesPatch = { kind: "rules"; items?: string[]; appendItem?: string };

type DirectSectionPatch =
  | RichTextPatch
  | LegacyChipsPatch
  | LegacyFocusPatch
  | LegacyDecisionsPatch
  | LegacyRulesPatch;

type CreateSectionInput = {
  name: string;
  kind: "rich-text";
  accent?: AccentKey;
  insertAfterSectionId?: string;
  contentHtml?: string;
  contentMarkdown?: string;
};

type LegacyGovernedDraft =
  | { kind: "operating-principles" | "conventions"; text: string; replacedRuleId?: string }
  | { kind: "decisions"; title: string; details?: string }
  | { kind: "current-focus"; content: string };

type DirectWriteBody =
  | {
      operation?: "legacy_governed_edit";
      sectionId?: "operating-principles" | "conventions" | "decisions" | "current-focus";
      sectionName?: string;
      agentName?: string;
      integration?: string;
      draft?: LegacyGovernedDraft;
    }
  | {
      operation: "update_section";
      sectionId: string;
      agentName: string;
      integration?: string;
      section: DirectSectionPatch;
    }
  | {
      operation: "create_section";
      agentName: string;
      integration?: string;
      section: CreateSectionInput;
    }
  | {
      operation: "delete_section";
      sectionId: string;
      agentName: string;
      integration?: string;
    }
  | {
      operation: "rename_section";
      sectionId: string;
      name: string;
      agentName: string;
      integration?: string;
    }
  | {
      operation: "recolor_section";
      sectionId: string;
      accent: AccentKey;
      agentName: string;
      integration?: string;
    }
  | {
      operation: "reorder_section";
      sectionId: string;
      afterSectionId?: string;
      position?: "first" | "last";
      agentName: string;
      integration?: string;
    }
  | {
      operation: "append_to_section";
      sectionId: string;
      agentName: string;
      integration?: string;
      contentMarkdown?: string;
      contentHtml?: string;
    };

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tagSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Convert any legacy patch shape into a rich-text patch the editor stores.
function patchToRichText(
  patch: DirectSectionPatch,
  existingContent: string
): RichTextPatch | null {
  if (patch.kind === "rich-text") {
    return patch;
  }

  if (patch.kind === "rules") {
    const items = (patch.items ?? (patch.appendItem ? [patch.appendItem] : []))
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length === 0) return null;
    const html = `<ul class="creed-list creed-list-bullet">${items
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("")}</ul>`;
    if (patch.appendItem) {
      return { kind: "rich-text", contentHtml: existingContent + html };
    }
    return { kind: "rich-text", contentHtml: html };
  }

  if (patch.kind === "chips") {
    const tags = patch.chips.map((chip) => chip.trim()).filter(Boolean);
    if (tags.length === 0) return null;
    const html = `<p>${tags
      .map((tag) => {
        const slug = tagSlug(tag) || tag.toLowerCase();
        return `<span class="creed-inline-tag" data-tag="${escapeHtml(slug)}">${escapeHtml(tag)}</span>`;
      })
      .join(" ")}</p>`;
    return { kind: "rich-text", contentHtml: html };
  }

  if (patch.kind === "focus") {
    return { kind: "rich-text", contentHtml: `<p>${escapeHtml(patch.content.trim())}</p>` };
  }

  // decisions: append a single bullet to existing content.
  const title = patch.title.trim();
  const details = patch.details?.trim();
  const bullet = `<ul class="creed-list creed-list-bullet"><li><strong>${escapeHtml(title)}</strong>${details ? `: ${escapeHtml(details)}` : ""}</li></ul>`;
  return { kind: "rich-text", contentHtml: existingContent + bullet };
}

function applySectionPatch(section: CreedSection, patch: DirectSectionPatch, agentName: string) {
  const richPatch = patchToRichText(patch, section.content);
  if (!richPatch) return section;

  const content = normalizeRichTextInput(richPatch);
  if (!content) return section;

  return {
    ...section,
    content,
    lastEditedBy: agentName,
    lastEditedType: "agent" as const,
    lastEditedLabel: "just now",
  };
}

function applyLegacyGovernedEdit(
  section: CreedSection,
  draft: LegacyGovernedDraft,
  agentName: string
) {
  // normalizeLegacyProposalDraft already collapses legacy kinds to rich-text
  // markdown. We apply the result as a rich-text patch (markdown will be
  // rendered to HTML in normalizeRichTextInput).
  const normalized = normalizeLegacyProposalDraft(draft);
  if (normalized.kind !== "rich-text") {
    return section;
  }

  return applySectionPatch(
    section,
    {
      kind: "rich-text",
      contentHtml: normalized.contentHtml,
      contentMarkdown: normalized.contentMarkdown,
    },
    agentName
  );
}

function buildAfterTextFromLegacyDraft(draft: LegacyGovernedDraft) {
  return getProposalPreviewText(normalizeLegacyProposalDraft(draft));
}

function createNewSection(input: CreateSectionInput, agentName: string): CreedSection {
  const content = normalizeRichTextInput(input);
  return {
    id: `section-${Date.now()}`,
    kind: "rich-text",
    template: inferSectionTemplate(undefined, undefined),
    name: input.name.trim(),
    accent:
      input.accent ??
      inferAgentSectionAccent({
        name: input.name,
        content: input.contentMarkdown ?? input.contentHtml,
        insertAfterSectionId: input.insertAfterSectionId,
      }),
    content: content || markdownToRichHtml("Start shaping this section."),
    agentWritable: true,
    lastEditedBy: agentName,
    lastEditedType: "agent",
    lastEditedLabel: "just now",
  };
}

function buildAfterTextFromPatch(patch: DirectSectionPatch) {
  if (patch.kind === "rich-text") {
    return patch.contentMarkdown?.trim() || patch.contentHtml?.trim() || "";
  }
  if (patch.kind === "rules") {
    return patch.appendItem?.trim() || patch.items?.join(" | ") || "";
  }
  if (patch.kind === "chips") {
    return patch.chips.join(", ");
  }
  if (patch.kind === "focus") {
    return patch.content.trim();
  }
  return `${patch.title}${patch.details ? ` — ${patch.details}` : ""}`;
}

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Supabase admin configuration is missing." }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  const writeToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!writeToken) {
    return NextResponse.json(
      { error: "Missing write token. Send via Authorization: Bearer <token>." },
      { status: 401 }
    );
  }

  const verdict = checkRateLimit({
    scope: "creed-write",
    identifier: writeToken,
    limit: 60,
    windowMs: 60_000,
  });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } }
    );
  }

  const admin = getSupabaseAdminClient();
  const userId = await findUserIdByDirectEditToken(admin as never, writeToken);
  if (!userId) {
    return NextResponse.json({ error: "Invalid write token." }, { status: 401 });
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !userData.user) {
    return NextResponse.json({ error: userError?.message ?? "Could not load token owner." }, { status: 500 });
  }

  // Write route only uses sections + tokens for its mutation. Skip the
  // 500-row historical proposal / activity scans.
  const result = await loadCreedState(admin as never, userData.user, {
    proposalLimit: 1,
    activityLimit: 1,
  });
  if (result.state.settings.requireApproval) {
    return NextResponse.json({ error: "Direct edits are disabled while approval is required." }, { status: 403 });
  }

  const body = (await request.json()) as DirectWriteBody;

  let nextSections = result.state.sections;
  let activityEntry: ActivityEntry | null = null;
  let revisedSectionId: string | null = null;
  let integration: string | undefined;
  let agentName = "";

  if (body.operation === "create_section") {
    agentName = body.agentName;
    integration = body.integration;

    if (!body.section?.name?.trim()) {
      return NextResponse.json(
        { error: "create_section requires `section.name` (a non-empty display name)." },
        { status: 400 }
      );
    }
    if (body.section.accent !== undefined && !isAccentKey(body.section.accent)) {
      return NextResponse.json(
        {
          error: `create_section accents must be one of: ${ACCENT_KEYS.join(", ")}.`,
        },
        { status: 400 }
      );
    }
    // `kind` is informational right now (every section is rich-text under
    // the unified model). Accept any value the caller sends — or none — and
    // normalize to "rich-text" internally so agents don't have to ship a
    // discriminator field whose only legal value is the default.
    const normalizedSection: CreateSectionInput = {
      ...body.section,
      kind: "rich-text",
    };

    const newSection = createNewSection(normalizedSection, agentName);
    const insertAfterIndex = normalizedSection.insertAfterSectionId
      ? result.state.sections.findIndex((section) => section.id === normalizedSection.insertAfterSectionId)
      : -1;

    if (insertAfterIndex === -1) {
      nextSections = [...result.state.sections, newSection];
    } else {
      nextSections = [...result.state.sections];
      nextSections.splice(insertAfterIndex + 1, 0, newSection);
    }

    revisedSectionId = newSection.id;
    activityEntry = {
      id: `activity-direct-${Date.now()}`,
      dayLabel: "Today",
      sectionId: newSection.id,
      sectionName: newSection.name,
      accent: newSection.accent,
      actor: agentName,
      actorType: "agent",
      summary: `Created ${newSection.name.toLowerCase()}`,
      timeLabel: "just now",
      status: "direct",
      changeType: "new-memory",
      reason: "Applied directly because approval was off.",
      impact: "future-responses",
      confidence: "durable",
      afterText:
        normalizedSection.contentMarkdown?.trim() ||
        normalizedSection.contentHtml?.trim() ||
        newSection.name,
    };
  } else if (body.operation === "delete_section") {
    agentName = body.agentName;
    integration = body.integration;

    const target = result.state.sections.find((section) => section.id === body.sectionId);
    if (!target) {
      return NextResponse.json(
        { error: "Target section is not present in this Creed." },
        { status: 400 }
      );
    }
    if (!target.agentWritable) {
      return NextResponse.json(
        { error: `Section ${target.id} is not agent-writable.` },
        { status: 403 }
      );
    }

    nextSections = result.state.sections.filter((section) => section.id !== target.id);
    revisedSectionId = target.id;
    activityEntry = {
      id: `activity-direct-${Date.now()}`,
      dayLabel: "Today",
      sectionId: target.id,
      sectionName: target.name,
      accent: target.accent,
      actor: agentName,
      actorType: "agent",
      summary: `Deleted ${target.name.toLowerCase()}`,
      timeLabel: "just now",
      status: "direct",
      changeType: "refines-existing",
      reason: "Applied directly because approval was off.",
      impact: "future-responses",
      confidence: "durable",
      // Use proportional before/after labels so the activity sidebar's diff
      // renders "Keep Boundaries" → "Delete Boundaries" instead of an empty
      // "No textual change" body.
      beforeText: `Keep ${target.name}`,
      afterText: `Delete ${target.name}`,
    };
  } else if (body.operation === "rename_section") {
    agentName = body.agentName;
    integration = body.integration;

    const nextName = typeof body.name === "string" ? body.name.trim() : "";
    if (!nextName) {
      return NextResponse.json({ error: "rename_section requires a non-empty name." }, { status: 400 });
    }

    const target = result.state.sections.find((section) => section.id === body.sectionId);
    if (!target) {
      return NextResponse.json(
        { error: "Target section is not present in this Creed." },
        { status: 400 }
      );
    }
    if (!target.agentWritable) {
      return NextResponse.json(
        { error: `Section ${target.id} is not agent-writable.` },
        { status: 403 }
      );
    }

    nextSections = result.state.sections.map((section) =>
      section.id === target.id
        ? {
            ...section,
            name: nextName,
            lastEditedBy: agentName,
            lastEditedType: "agent" as const,
            lastEditedLabel: "just now",
          }
        : section
    );
    revisedSectionId = target.id;
    activityEntry = {
      id: `activity-direct-${Date.now()}`,
      dayLabel: "Today",
      sectionId: target.id,
      sectionName: nextName,
      accent: target.accent,
      actor: agentName,
      actorType: "agent",
      summary: `Renamed ${target.name.toLowerCase()} → ${nextName.toLowerCase()}`,
      timeLabel: "just now",
      status: "direct",
      changeType: "refines-existing",
      reason: "Applied directly because approval was off.",
      impact: "future-responses",
      confidence: "durable",
      beforeText: `Name: ${target.name}`,
      afterText: `Name: ${nextName}`,
    };
  } else if (body.operation === "recolor_section") {
    agentName = body.agentName;
    integration = body.integration;

    if (!isAccentKey(body.accent)) {
      return NextResponse.json(
        {
          error: `recolor_section requires accent to be one of: ${ACCENT_KEYS.join(", ")}.`,
        },
        { status: 400 }
      );
    }
    const accent: AccentKey = body.accent;

    const target = result.state.sections.find((section) => section.id === body.sectionId);
    if (!target) {
      return NextResponse.json(
        { error: "Target section is not present in this Creed." },
        { status: 400 }
      );
    }
    if (!target.agentWritable) {
      return NextResponse.json(
        { error: `Section ${target.id} is not agent-writable.` },
        { status: 403 }
      );
    }

    nextSections = result.state.sections.map((section) =>
      section.id === target.id
        ? {
            ...section,
            accent,
            lastEditedBy: agentName,
            lastEditedType: "agent" as const,
            lastEditedLabel: "just now",
          }
        : section
    );
    const previousAccentLabel = accentLabelMap[target.accent] ?? target.accent;
    const nextAccentLabel = accentLabelMap[accent] ?? accent;
    revisedSectionId = target.id;
    activityEntry = {
      id: `activity-direct-${Date.now()}`,
      dayLabel: "Today",
      sectionId: target.id,
      sectionName: target.name,
      accent,
      actor: agentName,
      actorType: "agent",
      summary: `Recoloured ${target.name.toLowerCase()}`,
      timeLabel: "just now",
      status: "direct",
      changeType: "refines-existing",
      reason: "Applied directly because approval was off.",
      impact: "future-responses",
      confidence: "durable",
      beforeText: `Accent: ${previousAccentLabel}`,
      afterText: `Accent: ${nextAccentLabel}`,
    };
  } else if (body.operation === "reorder_section") {
    agentName = body.agentName;
    integration = body.integration;

    const target = result.state.sections.find((section) => section.id === body.sectionId);
    if (!target) {
      return NextResponse.json(
        { error: "Target section is not present in this Creed." },
        { status: 400 }
      );
    }
    if (!target.agentWritable) {
      return NextResponse.json(
        { error: `Section ${target.id} is not agent-writable.` },
        { status: 403 }
      );
    }

    const hasAfter = typeof body.afterSectionId === "string" && body.afterSectionId.length > 0;
    const hasPosition = body.position === "first" || body.position === "last";
    if (!hasAfter && !hasPosition) {
      return NextResponse.json(
        {
          error:
            'reorder_section requires either `afterSectionId` or `position` ("first" | "last").',
        },
        { status: 400 }
      );
    }
    if (hasAfter && hasPosition) {
      return NextResponse.json(
        {
          error:
            "reorder_section requires exactly one of `afterSectionId` or `position`, not both.",
        },
        { status: 400 }
      );
    }
    if (hasAfter && body.afterSectionId === target.id) {
      return NextResponse.json(
        { error: "reorder_section.afterSectionId cannot be the section being moved." },
        { status: 400 }
      );
    }
    if (hasAfter) {
      const anchorExists = result.state.sections.some(
        (section) => section.id === body.afterSectionId
      );
      if (!anchorExists) {
        return NextResponse.json(
          {
            error: `reorder_section.afterSectionId "${body.afterSectionId}" doesn't exist. Available: ${result.state.sections.map((s) => s.id).join(", ")}.`,
          },
          { status: 400 }
        );
      }
    }

    const withoutTarget = result.state.sections.filter((section) => section.id !== target.id);
    if (body.position === "first") {
      nextSections = [target, ...withoutTarget];
    } else if (body.position === "last") {
      nextSections = [...withoutTarget, target];
    } else {
      const anchorIndex = withoutTarget.findIndex((section) => section.id === body.afterSectionId);
      nextSections = [...withoutTarget];
      nextSections.splice(anchorIndex + 1, 0, target);
    }

    const destinationDescription =
      body.position === "first"
        ? "top of file"
        : body.position === "last"
          ? "bottom of file"
          : `after ${body.afterSectionId}`;

    revisedSectionId = target.id;
    activityEntry = {
      id: `activity-direct-${Date.now()}`,
      dayLabel: "Today",
      sectionId: target.id,
      sectionName: target.name,
      accent: target.accent,
      actor: agentName,
      actorType: "agent",
      summary: `Moved ${target.name.toLowerCase()} to ${destinationDescription}`,
      timeLabel: "just now",
      status: "direct",
      changeType: "refines-existing",
      reason: "Applied directly because approval was off.",
      impact: "future-responses",
      confidence: "durable",
      beforeText: `Keep ${target.name} in place`,
      afterText: `Move ${target.name} to ${destinationDescription}`,
    };
  } else if (body.operation === "append_to_section") {
    agentName = body.agentName;
    integration = body.integration;

    const target = result.state.sections.find((section) => section.id === body.sectionId);
    if (!target) {
      return NextResponse.json(
        { error: "Target section is not present in this Creed." },
        { status: 400 }
      );
    }
    if (!target.agentWritable) {
      return NextResponse.json(
        { error: `Section ${target.id} is not agent-writable.` },
        { status: 403 }
      );
    }
    if (!body.contentMarkdown?.trim() && !body.contentHtml?.trim()) {
      return NextResponse.json(
        { error: "append_to_section requires `contentMarkdown` or `contentHtml`." },
        { status: 400 }
      );
    }

    // Build the appended chunk in HTML form. Markdown gets converted; raw
    // HTML passes through. We insert a horizontal rule between the existing
    // body and the new chunk so the join is always visually clear.
    const appendedHtml = body.contentMarkdown?.trim()
      ? markdownToRichHtml(body.contentMarkdown)
      : body.contentHtml ?? "";
    const existingContent = (target.content ?? "").trim();
    const separator = existingContent ? `<hr class="creed-hr" />` : "";
    const mergedHtml = `${existingContent}${separator}${appendedHtml}`;

    nextSections = result.state.sections.map((section) =>
      section.id === target.id ? applySectionPatch(section, { kind: "rich-text", contentHtml: mergedHtml }, agentName) : section
    );
    const updatedSection = nextSections.find((section) => section.id === target.id);
    if (!updatedSection) {
      return NextResponse.json(
        { error: `Append could not be applied to ${target.id}.` },
        { status: 500 }
      );
    }
    revisedSectionId = target.id;
    activityEntry = {
      id: `activity-direct-${Date.now()}`,
      dayLabel: "Today",
      sectionId: target.id,
      sectionName: target.name,
      accent: target.accent,
      actor: agentName,
      actorType: "agent",
      summary: `Appended to ${target.name.toLowerCase()}`,
      timeLabel: "just now",
      status: "direct",
      changeType: "new-memory",
      reason: "Applied directly because approval was off.",
      impact: "future-responses",
      confidence: "durable",
      beforeText: target.content,
      afterText: mergedHtml,
    };
  } else if (body.operation === "update_section") {
    agentName = body.agentName;
    integration = body.integration;

    if (!body.sectionId || !body.section) {
      return NextResponse.json({ error: "Malformed direct edit." }, { status: 400 });
    }

    const currentSection = result.state.sections.find((section) => section.id === body.sectionId);
    if (!currentSection) {
      return NextResponse.json({ error: "Target section is not present in this Creed." }, { status: 400 });
    }
    if (!currentSection.agentWritable) {
      return NextResponse.json(
        { error: `Section ${currentSection.id} is not agent-writable.` },
        { status: 403 }
      );
    }

    nextSections = result.state.sections.map((section) =>
      section.id === body.sectionId ? applySectionPatch(section, body.section, agentName) : section
    );

    const updatedSection = nextSections.find((section) => section.id === body.sectionId);
    if (!updatedSection) {
      // Should never fire because we found currentSection above and map() doesn't
      // drop items, but kept defensive to make the type narrow below honest.
      return NextResponse.json(
        { error: `Direct edit could not be applied to ${body.sectionId}.` },
        { status: 500 }
      );
    }
    // No-op detection. applySectionPatch returns the original section when
    // the patch is empty / unparsable / produces the same content. Tell the
    // agent we received the request and applied nothing, so it doesn't
    // assume the route is broken when its payload was just empty.
    if (
      updatedSection.content === currentSection.content &&
      updatedSection.name === currentSection.name &&
      updatedSection.accent === currentSection.accent
    ) {
      return NextResponse.json({ ok: true, applied: false, reason: "noop" });
    }

    revisedSectionId = body.sectionId;
    activityEntry = {
      id: `activity-direct-${Date.now()}`,
      dayLabel: "Today",
      sectionId: currentSection.id,
      sectionName: currentSection.name,
      accent: currentSection.accent,
      actor: agentName,
      actorType: "agent",
      summary: `Directly updated ${currentSection.name.toLowerCase()}`,
      timeLabel: "just now",
      status: "direct",
      changeType: "refines-existing",
      reason: "Applied directly because approval was off.",
      impact: currentSection.id === "current-focus" ? "project-context" : "future-responses",
      confidence: "durable",
      afterText: buildAfterTextFromPatch(body.section),
    };
  } else {
    const legacy = body as Extract<DirectWriteBody, { operation?: "legacy_governed_edit" }>;
    agentName = legacy.agentName ?? "";
    integration = legacy.integration;

    if (!legacy.sectionId || !legacy.agentName || !legacy.draft) {
      return NextResponse.json({ error: "Malformed direct edit." }, { status: 400 });
    }

    const legacySectionId = normalizeLegacySectionId(legacy.sectionId);
    const legacyDraft = legacy.draft as LegacyGovernedDraft;
    const legacySectionName =
      legacy.sectionName ?? (legacySectionId === "operating-principles" ? "Operating Principles" : legacySectionId);

    const currentSection = result.state.sections.find((section) => section.id === legacySectionId);
    if (!currentSection) {
      return NextResponse.json({ error: "Target section is not present in this Creed." }, { status: 400 });
    }

    if (!currentSection.agentWritable) {
      return NextResponse.json(
        { error: `Section ${legacySectionId} is not agent-writable.` },
        { status: 403 }
      );
    }

    nextSections = result.state.sections.map((section) =>
      section.id === legacySectionId ? applyLegacyGovernedEdit(section, legacyDraft, legacy.agentName!) : section
    );

    const updatedSection = nextSections.find((section) => section.id === legacySectionId);
    if (!updatedSection) {
      return NextResponse.json(
        { error: `Direct edit could not be applied to ${legacySectionId}.` },
        { status: 500 }
      );
    }
    if (
      updatedSection.content === currentSection.content &&
      updatedSection.name === currentSection.name &&
      updatedSection.accent === currentSection.accent
    ) {
      return NextResponse.json({ ok: true, applied: false, reason: "noop" });
    }

    revisedSectionId = legacySectionId;
    activityEntry = {
      id: `activity-direct-${Date.now()}`,
      dayLabel: "Today",
      sectionId: legacySectionId,
      sectionName:
        legacy.sectionName ?? result.state.sections.find((section) => section.id === legacySectionId)?.name ?? legacySectionName,
      accent: normalizeLegacyAccent(
        legacySectionId === "operating-principles" ? "operating-principles" : legacySectionId === "decisions" ? "decisions" : "custom"
      ),
      actor: legacy.agentName,
      actorType: "agent",
      summary: `Directly updated ${legacySectionName.toLowerCase()}`,
      timeLabel: "just now",
      status: "direct",
      changeType: legacyDraft.kind === "decisions" ? "new-memory" : "refines-existing",
      reason: "Applied directly because approval was off.",
      impact: legacySectionId === "current-focus" ? "project-context" : "future-responses",
      confidence: "durable",
      afterText: buildAfterTextFromLegacyDraft(legacyDraft),
    };
  }

  if (!activityEntry || !revisedSectionId) {
    return NextResponse.json({ error: "Direct edit could not be applied." }, { status: 400 });
  }

  const nextState = {
    ...result.state,
    mutationTick: result.state.mutationTick + 1,
    sections: nextSections,
    sectionRevisions: {
      ...result.state.sectionRevisions,
      [revisedSectionId]: (result.state.sectionRevisions[revisedSectionId] ?? 0) + 1,
    },
    activity: [activityEntry, ...result.state.activity],
  };

  await persistCreedState(admin as never, userId, nextState);
  await recordConnectionUsage(admin as never, userId, integration, agentName, "proposal");
  return NextResponse.json({ ok: true });
}
