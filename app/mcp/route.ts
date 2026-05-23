import { NextResponse } from "next/server";
import type { AccentKey, CreedSection, CreedState, GovernedSectionId } from "@/lib/creed-data";
import {
  buildAgentReadPayload,
  collaborationRules,
  isAccentKey,
} from "@/lib/creed-data";
import {
  findUserIdByMcpToken,
  loadCreedState,
  recordMcpCredentialUsage,
} from "@/lib/creed-backend";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl, isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { readLatestQualityReport, validateQualityReport } from "@/lib/ai/quality";
import type { CreedQualityReport } from "@/lib/ai/quality";
import { markdownToRichHtml } from "@/lib/rich-text";

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

type McpToolCallParams = {
  name?: string;
  arguments?: Record<string, unknown>;
};

// Keep the MCP route self-contained for schema/error text so a route-module
// evaluation issue cannot break policy reads for connected agents.
const MCP_ACCENT_KEYS = [
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
  "custom",
] as const satisfies readonly AccentKey[];

const tools = [
  {
    name: "read_creed",
    description: "Read the user's Creed, including the private operating contract for connected agents.",
    inputSchema: {
      type: "object",
      properties: {
        agentName: { type: "string" },
      },
    },
  },
  {
    name: "get_write_policy",
    description: "Return the current Creed write mode and allowed write behavior.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_self_improvement_contract",
    description: "Return the start-of-work, end-of-work, and file-maintenance contract agents should follow to keep Creed sharp.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_sections",
    description: "List the current Creed sections with ids, names, kinds, and accents.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "propose_creed_update",
    // Top-level description stays short to fit MCP clients that truncate
    // around 1024 chars. Per-kind shapes live in the draft schema below
    // where there's more headroom, and the full prose lives in read_creed.
    description:
      "Submit a Creed proposal. Works in every approval mode and is the path for ALL mutations (update / create / delete / rename / recolor) when approval is on. See draft.kind in the schema for the supported draft shapes; call get_write_policy for the live capability list.",
    inputSchema: {
      type: "object",
      properties: {
        sectionId: { type: "string", description: "Section id, or 'new-section' for new-section drafts." },
        sectionName: { type: "string" },
        agentName: { type: "string" },
        changeType: {
          type: "string",
          enum: ["new-memory", "refines-existing", "conflicts-existing"],
          description: "Optional for delete-section / rename-section / recolor-section (server defaults to 'refines-existing').",
        },
        reason: {
          type: "string",
          description: "Optional for meta proposals; server fills in a sensible default.",
        },
        impact: {
          type: "string",
          enum: ["future-responses", "code-generation", "project-context"],
          description: "Optional for meta proposals.",
        },
        confidence: {
          type: "string",
          enum: ["tentative", "repeated", "durable"],
          description: "Optional for meta proposals.",
        },
        draft: {
          type: "object",
          description: [
            "One of the following shapes (set draft.kind accordingly):",
            "- rich-text: { kind: 'rich-text', contentMarkdown: '...' }  → update body of an existing section.",
            "- new-section: { kind: 'new-section', name, accent?, insertAfterSectionId?, contentMarkdown }  → create a section; set proposal sectionId='new-section'.",
            "- delete-section: { kind: 'delete-section' }  → remove an existing section; proposal sectionId selects which.",
            "- rename-section: { kind: 'rename-section', name: 'New name' }",
            "- recolor-section: { kind: 'recolor-section', accent: '<one of accent keys>' }. Valid accents: identity, stack, operating-principles, decisions, preferences, workflows, tools, boundaries, questions, skills, mini-skills, projects, output, rose, custom.",
          ].join("\n"),
        },
      },
      required: ["sectionId", "sectionName", "agentName", "draft"],
    },
  },
  {
    name: "direct_edit_creed",
    description:
      "Apply a Creed change immediately. Only works when the user has approval turned off; otherwise the server rejects with 403 and you should use propose_creed_update. See `operation` in the schema for supported operations.",
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "update_section",
            "create_section",
            "delete_section",
            "rename_section",
            "recolor_section",
          ],
          description: [
            "Payload shape per operation:",
            "- update_section: { sectionId, section: { kind: 'rich-text', contentMarkdown? } }.",
            "- create_section: { section: { name, kind: 'rich-text', accent?, insertAfterSectionId?, contentMarkdown? } }.",
            "- delete_section: { sectionId }.",
            "- rename_section: { sectionId, name: 'New name' }.",
            "- recolor_section: { sectionId, accent: '<accent key>' }. Valid accents: identity, stack, operating-principles, decisions, preferences, workflows, tools, boundaries, questions, skills, mini-skills, projects, output, rose, custom.",
          ].join("\n"),
        },
        sectionId: { type: "string" },
        agentName: { type: "string" },
        name: { type: "string", description: "New name (rename_section only)." },
        accent: { type: "string", description: "Accent key (recolor_section only)." },
        section: {
          type: "object",
          description: "Section payload for update_section / create_section.",
        },
      },
      required: ["agentName", "operation"],
    },
  },
  // ---------------------------------------------------------------------------
  // Bulletproof single-purpose tools (preferred). One tool per operation, flat
  // parameters, no nested discriminated unions, no "pick a mode" decision. The
  // server figures out whether to apply directly or submit a proposal based on
  // the user's approval setting. Every tool returns a clear `{ ok, mode, ... }`
  // payload so the agent knows exactly what happened. Errors include the list
  // of valid section IDs / accent keys so agents can self-correct without
  // re-reading docs.
  // ---------------------------------------------------------------------------
  {
    name: "creed_update_section",
    description:
      "Update a section's body. Flat params, applies directly when approval is off, otherwise submits a proposal. Example: { sectionId: 'beliefs', contentMarkdown: '## Beliefs\\n- ...' }.",
    inputSchema: {
      type: "object",
      properties: {
        sectionId: {
          type: "string",
          description: "ID of the section to update. Get IDs via creed_list_sections or list_sections.",
        },
        contentMarkdown: {
          type: "string",
          description: "Full new body for the section, in Creed markdown.",
        },
        reason: {
          type: "string",
          description: "Optional. One short sentence explaining why this update is worth storing.",
        },
      },
      required: ["sectionId", "contentMarkdown"],
    },
  },
  {
    name: "creed_create_section",
    description:
      "Create a new section. Applies directly when approval is off, otherwise submits a proposal. Example: { name: 'Working Style', contentMarkdown: '...', accent: 'preferences' }.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Display name of the new section." },
        contentMarkdown: {
          type: "string",
          description: "Initial body in Creed markdown.",
        },
        accent: {
          type: "string",
          enum: [...MCP_ACCENT_KEYS],
          description: "Optional accent colour. If omitted, the server picks one based on the section name and content.",
        },
        insertAfterSectionId: {
          type: "string",
          description: "Optional. If set, the new section is placed immediately after this existing section.",
        },
        reason: { type: "string", description: "Optional rationale." },
      },
      required: ["name", "contentMarkdown"],
    },
  },
  {
    name: "creed_delete_section",
    description:
      "Delete a section. Applies directly when approval is off, otherwise submits a delete-section proposal. Example: { sectionId: 'old-rituals' }.",
    inputSchema: {
      type: "object",
      properties: {
        sectionId: { type: "string", description: "ID of the section to delete." },
        reason: { type: "string", description: "Optional rationale for the delete." },
      },
      required: ["sectionId"],
    },
  },
  {
    name: "creed_rename_section",
    description:
      "Rename a section. Applies directly when approval is off, otherwise submits a rename-section proposal. Example: { sectionId: 'beliefs', name: 'Values' }.",
    inputSchema: {
      type: "object",
      properties: {
        sectionId: { type: "string" },
        name: { type: "string", description: "The new display name." },
        reason: { type: "string", description: "Optional rationale." },
      },
      required: ["sectionId", "name"],
    },
  },
  {
    name: "creed_recolor_section",
    description:
      "Change a section's accent colour. Applies directly when approval is off, otherwise submits a recolor-section proposal. Example: { sectionId: 'beliefs', accent: 'identity' }.",
    inputSchema: {
      type: "object",
      properties: {
        sectionId: { type: "string" },
        accent: {
          type: "string",
          enum: [...MCP_ACCENT_KEYS],
          description: "One of the canonical accent keys.",
        },
        reason: { type: "string", description: "Optional rationale." },
      },
      required: ["sectionId", "accent"],
    },
  },
  // -------------------------------------------------------------------------
  // Read + targeted helpers. Cheap, side-effect-free tools that let agents
  // operate with surgical precision instead of re-reading the whole profile.
  // -------------------------------------------------------------------------
  {
    name: "creed_get_section",
    description:
      "Fetch a single section by id (or by name, case-insensitive). Returns name, accent, agent-writable flag, contentMarkdown, contentHtml, and last-edited metadata. Use this before update / append instead of re-reading the full Creed.",
    inputSchema: {
      type: "object",
      properties: {
        sectionId: {
          type: "string",
          description: "Section id or display name. Case-insensitive fuzzy match.",
        },
      },
      required: ["sectionId"],
    },
  },
  {
    name: "creed_search",
    description:
      "Search section names and bodies for a query string. Returns the top matches with a short snippet around each hit. Cheaper than reading the full Creed when you need to find where a fact lives.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Substring to search for (case-insensitive). One or more whitespace-separated terms.",
        },
        limit: {
          type: "integer",
          description: "Maximum number of matches to return. Defaults to 5; max 25.",
          minimum: 1,
          maximum: 25,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "creed_get_recent_activity",
    description:
      "Return the most recent activity entries (accepted, rejected, stale, direct) so you can see what other agents have been doing and avoid duplicate proposals.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "How many entries to return, newest first. Defaults to 20; max 100.",
          minimum: 1,
          maximum: 100,
        },
        sinceISO: {
          type: "string",
          description: "Optional ISO-8601 timestamp. Only entries newer than this are returned.",
        },
      },
    },
  },
  {
    name: "creed_get_quality_report",
    description:
      "Read the latest auto-generated quality report. Tells you which sections are thin, vague, or stale so you can target the weakest ones first. Returns null if the user hasn't run an analysis yet.",
    inputSchema: {
      type: "object",
      properties: {
        sectionId: {
          type: "string",
          description: "Optional: filter to a single section's slice of the report.",
        },
      },
    },
  },
  // -------------------------------------------------------------------------
  // Two more single-purpose mutation tools. Same theme as creed_update_section
  // — flat params, server picks the mode, errors enumerate valid options.
  // -------------------------------------------------------------------------
  {
    name: "creed_append_to_section",
    description:
      "Append a new chunk to a section's body without rewriting it. The server preserves existing content and inserts a horizontal rule before the new chunk. Prefer this over creed_update_section when adding new context to an existing section, since it eliminates the read-then-rewrite pattern that can lose content. Applies directly when approval is off, otherwise submits a rich-text proposal containing the merged body.",
    inputSchema: {
      type: "object",
      properties: {
        sectionId: { type: "string" },
        contentMarkdown: {
          type: "string",
          description: "Markdown to append. Use rich components (callouts, lists, tags) for non-trivial additions.",
        },
        reason: { type: "string", description: "Optional rationale." },
      },
      required: ["sectionId", "contentMarkdown"],
    },
  },
  {
    name: "creed_reorder_section",
    description:
      "Move a section to a new position in the file. Provide EITHER afterSectionId (puts the section right after that one) OR position ('first' | 'last'). Applies directly when approval is off, otherwise submits a reorder-section proposal.",
    inputSchema: {
      type: "object",
      properties: {
        sectionId: { type: "string", description: "Section to move." },
        afterSectionId: {
          type: "string",
          description: "If set, the section is placed immediately after this existing section.",
        },
        position: {
          type: "string",
          enum: ["first", "last"],
          description: "Move to the top or bottom of the file. Mutually exclusive with afterSectionId.",
        },
        reason: { type: "string", description: "Optional rationale." },
      },
      required: ["sectionId"],
    },
  },
];

function textToolResult(value: string) {
  return {
    content: [
      {
        type: "text",
        text: value,
      },
    ],
  };
}

function jsonToolResult(value: unknown) {
  return textToolResult(JSON.stringify(value, null, 2));
}

function responseFor(id: JsonRpcRequest["id"], result: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function errorFor(id: JsonRpcRequest["id"], code: number, message: string) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  };
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7).trim();
}

function getClientName(request: JsonRpcRequest, args?: Record<string, unknown>) {
  const explicitAgentName = args?.agentName;
  if (typeof explicitAgentName === "string" && explicitAgentName.trim()) {
    return explicitAgentName.trim();
  }

  const clientInfo = request.params?.clientInfo;
  if (clientInfo && typeof clientInfo === "object" && "name" in clientInfo) {
    const name = (clientInfo as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) {
      return name.trim();
    }
  }

  return null;
}

function stringArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

// The canonical machine-readable view of what an agent can do. Mirrors the
// AgentWritePolicy shape in lib/creed-data.ts but exposed as its own MCP
// tool so agents can poll it without reading the full markdown contract.
const PROPOSAL_DRAFT_KINDS = [
  "rich-text",
  "new-section",
  "delete-section",
  "rename-section",
  "recolor-section",
  "reorder-section",
] as const;

const DIRECT_EDIT_OPERATIONS = [
  "update_section",
  "append_to_section",
  "create_section",
  "delete_section",
  "rename_section",
  "recolor_section",
  "reorder_section",
] as const;

function buildWritePolicy(state: CreedState) {
  // Writable = section.agentWritable === true. Don't hardcode IDs; the
  // legacy three-ID filter that lived here for too long made the policy
  // tell agents "writable: none" on every modern Creed.
  const writableSectionIds: GovernedSectionId[] = state.sections
    .filter((section) => section.agentWritable)
    .map((section) => section.id);
  const editableSections = state.sections
    .filter((section) => section.agentWritable)
    .map((section) => ({
      id: section.id,
      name: section.name,
      kind: section.kind,
    }));

  const proposalTargets = [...writableSectionIds, "new-section"];
  const directEditTargets = state.settings.requireApproval
    ? []
    : [...writableSectionIds, "new-section"];

  return {
    preferredMode: state.settings.requireApproval ? "proposals_only" : "direct_edit",
    requireApproval: state.settings.requireApproval,
    // The recommended surface for every agent. These five tools have flat
    // parameters, no mode-picking, no nested discriminators. Use them.
    recommendedTools: [
      "creed_update_section",
      "creed_append_to_section",
      "creed_create_section",
      "creed_delete_section",
      "creed_rename_section",
      "creed_recolor_section",
      "creed_reorder_section",
      "creed_get_section",
      "creed_search",
      "creed_get_recent_activity",
      "creed_get_quality_report",
    ],
    // What kinds of proposal drafts the legacy `propose_creed_update` tool
    // accepts. Same list regardless of approval setting — proposals are
    // how agents do meta operations (delete/rename/recolor) when approval
    // is on. Prefer the recommended tools above.
    proposalDraftKinds: [...PROPOSAL_DRAFT_KINDS],
    // What operations the legacy `direct_edit_creed` tool accepts when
    // approval is off.
    directEditOperations: state.settings.requireApproval
      ? []
      : [...DIRECT_EDIT_OPERATIONS],
    proposalTargets,
    directEditTargets,
    // Both keys point to the same agent-writable section list so consumers
    // don't have to reconcile two near-identical terms. `writableSections`
    // is kept as an alias for older agents already trained on the name.
    editableSections,
    writableSections: editableSections,
    validAccentKeys: [...MCP_ACCENT_KEYS],
  };
}

async function callInternalCreedRoute(
  _request: Request,
  path: string,
  writeToken: string,
  body: Record<string, unknown>
) {
  const baseUrl = getSiteUrl();
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${writeToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || `Creed write failed with status ${response.status}.`);
  }

  return payload;
}

async function handleToolCall(
  request: Request,
  rpcRequest: JsonRpcRequest,
  state: CreedState,
  userId: string
) {
  const params = (rpcRequest.params ?? {}) as McpToolCallParams;
  const name = params.name;
  const args = params.arguments ?? {};
  const agentName = getClientName(rpcRequest, args);

  if (name === "read_creed") {
    return textToolResult(
      buildAgentReadPayload(state, {
        proposalUrl: `${getSiteUrl()}/api/creed/proposals`,
        directEditUrl: `${getSiteUrl()}/api/creed/write`,
        docsUrl: `${getSiteUrl()}/docs`,
      })
    );
  }

  if (name === "get_write_policy") {
    return jsonToolResult(buildWritePolicy(state));
  }

  if (name === "get_self_improvement_contract") {
    return jsonToolResult(collaborationRules.selfImprovement);
  }

  if (name === "list_sections") {
    return jsonToolResult(
      state.sections.map((section) => ({
        id: section.id,
        name: section.name,
        kind: section.kind,
        accent: section.accent,
      }))
    );
  }

  if (name === "propose_creed_update") {
    const proposalBody = {
      id: typeof args.id === "string" ? args.id : `mcp-proposal-${Date.now()}`,
      sectionId: stringArg(args, "sectionId"),
      sectionName: stringArg(args, "sectionName"),
      agentName,
      changeType: stringArg(args, "changeType"),
      reason: stringArg(args, "reason"),
      impact: stringArg(args, "impact"),
      confidence: stringArg(args, "confidence"),
      draft: args.draft,
      integration: "mcp",
    };

    await callInternalCreedRoute(request, "/api/creed/proposals", state.writeToken, proposalBody);
    return jsonToolResult({ ok: true });
  }

  if (name === "direct_edit_creed") {
    if (state.settings.requireApproval) {
      throw new Error("Direct edits are disabled while approval is required. Use propose_creed_update instead.");
    }

    await callInternalCreedRoute(request, "/api/creed/write", state.directEditToken, {
      ...args,
      agentName,
      integration: "mcp",
    });
    return jsonToolResult({ ok: true });
  }

  // -----------------------------------------------------------------------
  // The bulletproof single-purpose tools below all flow through the same
  // dispatcher: resolve target section, pick direct vs proposal, return a
  // structured result. Errors include lists of valid section IDs / accent
  // keys so the agent can correct without re-reading docs.
  // -----------------------------------------------------------------------
  if (name === "creed_update_section") {
    const sectionId = stringArg(args, "sectionId");
    const contentMarkdown = stringArg(args, "contentMarkdown");
    const reason = stringArg(args, "reason");
    const section = resolveSectionOrThrow(state, sectionId);
    return await runSectionMutation(
      request,
      state,
      "update",
      section,
      { contentMarkdown, reason },
      agentName
    );
  }

  if (name === "creed_create_section") {
    const newName = stringArg(args, "name");
    const contentMarkdown = stringArg(args, "contentMarkdown");
    const accent = args.accent;
    const insertAfterSectionId = stringArg(args, "insertAfterSectionId");
    const reason = stringArg(args, "reason");

    if (!newName.trim()) {
      throw new Error("creed_create_section requires a non-empty `name`.");
    }
    if (!contentMarkdown.trim()) {
      throw new Error("creed_create_section requires a non-empty `contentMarkdown` (start the section with at least one heading or paragraph).");
    }
    if (accent !== undefined && !isAccentKey(accent)) {
      throw new Error(
        `creed_create_section: invalid accent. Use one of: ${MCP_ACCENT_KEYS.join(", ")}.`
      );
    }
    if (insertAfterSectionId) {
      // Be helpful: fail fast if the agent referenced a section that
      // doesn't exist, instead of silently appending at the end.
      resolveSectionOrThrow(state, insertAfterSectionId);
    }

    return await runCreate(
      request,
      state,
      {
        name: newName.trim(),
        contentMarkdown,
        accent: isAccentKey(accent) ? accent : undefined,
        insertAfterSectionId: insertAfterSectionId || undefined,
        reason,
      },
      agentName
    );
  }

  if (name === "creed_delete_section") {
    const sectionId = stringArg(args, "sectionId");
    const reason = stringArg(args, "reason");
    const section = resolveSectionOrThrow(state, sectionId);
    return await runSectionMutation(
      request,
      state,
      "delete",
      section,
      { reason },
      agentName
    );
  }

  if (name === "creed_rename_section") {
    const sectionId = stringArg(args, "sectionId");
    const newName = stringArg(args, "name");
    const reason = stringArg(args, "reason");
    if (!newName.trim()) {
      throw new Error("creed_rename_section requires a non-empty `name`.");
    }
    const section = resolveSectionOrThrow(state, sectionId);
    return await runSectionMutation(
      request,
      state,
      "rename",
      section,
      { name: newName.trim(), reason },
      agentName
    );
  }

  if (name === "creed_recolor_section") {
    const sectionId = stringArg(args, "sectionId");
    const accent = args.accent;
    const reason = stringArg(args, "reason");
    if (!isAccentKey(accent)) {
      throw new Error(
        `creed_recolor_section: invalid accent. Use one of: ${MCP_ACCENT_KEYS.join(", ")}.`
      );
    }
    const section = resolveSectionOrThrow(state, sectionId);
    return await runSectionMutation(
      request,
      state,
      "recolor",
      section,
      { accent, reason },
      agentName
    );
  }

  // -----------------------------------------------------------------------
  // Targeted read tools
  // -----------------------------------------------------------------------
  if (name === "creed_get_section") {
    const sectionId = stringArg(args, "sectionId");
    const section = resolveSectionOrThrow(state, sectionId);
    return jsonToolResult({
      id: section.id,
      name: section.name,
      kind: section.kind,
      accent: section.accent,
      agentWritable: section.agentWritable,
      contentHtml: section.content,
      lastEditedBy: section.lastEditedBy,
      lastEditedType: section.lastEditedType,
      lastEditedLabel: section.lastEditedLabel,
    });
  }

  if (name === "creed_search") {
    const query = stringArg(args, "query");
    const rawLimit =
      typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.max(1, Math.min(25, Math.trunc(args.limit)))
        : 5;
    if (!query.trim()) {
      throw new Error("creed_search requires a non-empty `query`.");
    }
    return jsonToolResult(searchSections(state, query, rawLimit));
  }

  if (name === "creed_get_recent_activity") {
    const rawLimit =
      typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.max(1, Math.min(100, Math.trunc(args.limit)))
        : 20;
    const sinceISO = stringArg(args, "sinceISO");
    const since = sinceISO ? Date.parse(sinceISO) : NaN;
    const entries = state.activity
      .filter((entry) => {
        if (!Number.isFinite(since)) return true;
        const createdAt = entry.createdAt ? Date.parse(entry.createdAt) : NaN;
        return Number.isFinite(createdAt) && createdAt > since;
      })
      .slice(0, rawLimit)
      .map((entry) => ({
        id: entry.id,
        proposalId: entry.proposalId,
        createdAt: entry.createdAt,
        sectionId: entry.sectionId,
        sectionName: entry.sectionName,
        accent: entry.accent,
        actor: entry.actor,
        actorType: entry.actorType,
        status: entry.status,
        summary: entry.summary,
        changeType: entry.changeType,
        reason: entry.reason,
        impact: entry.impact,
        confidence: entry.confidence,
      }));
    return jsonToolResult(entries);
  }

  if (name === "creed_get_quality_report") {
    const optionalSectionId = stringArg(args, "sectionId");
    const report = await loadLatestQualityReport(state, userId);
    if (!report) {
      return jsonToolResult({
        available: false,
        reason: "No quality report yet. The user hasn't run an analysis on this Creed.",
      });
    }
    if (optionalSectionId) {
      const sectionReport = report.sections.find(
        (entry) => entry.sectionId === optionalSectionId
      );
      if (!sectionReport) {
        // Try fuzzy resolve through the regular section resolver, then
        // re-match by id.
        const section = resolveSectionOrThrow(state, optionalSectionId);
        const matched = report.sections.find((entry) => entry.sectionId === section.id);
        return jsonToolResult({
          available: true,
          generatedAt: report.generatedAt,
          section: matched ?? null,
        });
      }
      return jsonToolResult({
        available: true,
        generatedAt: report.generatedAt,
        section: sectionReport,
      });
    }
    return jsonToolResult({ available: true, report });
  }

  // -----------------------------------------------------------------------
  // append / reorder — single-purpose mutations that need their own runners
  // because their state transitions don't fit the shared section mutation
  // helper.
  // -----------------------------------------------------------------------
  if (name === "creed_append_to_section") {
    const sectionId = stringArg(args, "sectionId");
    const contentMarkdown = stringArg(args, "contentMarkdown");
    const reason = stringArg(args, "reason");
    if (!contentMarkdown.trim()) {
      throw new Error("creed_append_to_section requires non-empty `contentMarkdown`.");
    }
    const section = resolveSectionOrThrow(state, sectionId);
    return await runAppend(request, state, section, { contentMarkdown, reason }, agentName);
  }

  if (name === "creed_reorder_section") {
    const sectionId = stringArg(args, "sectionId");
    const afterSectionId = stringArg(args, "afterSectionId");
    const positionArg = args.position;
    const position =
      positionArg === "first" || positionArg === "last" ? positionArg : undefined;
    const reason = stringArg(args, "reason");

    if (!afterSectionId && !position) {
      throw new Error(
        "creed_reorder_section requires either `afterSectionId` or `position` ('first' | 'last')."
      );
    }
    if (afterSectionId && position) {
      throw new Error(
        "creed_reorder_section: provide exactly one of `afterSectionId` or `position`, not both."
      );
    }
    const section = resolveSectionOrThrow(state, sectionId);
    let resolvedAnchorId: string | undefined;
    if (afterSectionId) {
      const anchor = resolveSectionOrThrow(state, afterSectionId);
      if (anchor.id === section.id) {
        throw new Error(
          "creed_reorder_section: afterSectionId cannot be the section being moved."
        );
      }
      resolvedAnchorId = anchor.id;
    }
    return await runReorder(
      request,
      state,
      section,
      { afterSectionId: resolvedAnchorId, position, reason },
      agentName
    );
  }

  throw new Error(`Unknown Creed MCP tool: ${name || "missing"}.`);
}

// ---------------------------------------------------------------------------
// Helpers for the bulletproof tools
// ---------------------------------------------------------------------------

function resolveSectionOrThrow(state: CreedState, sectionId: string): CreedSection {
  if (!sectionId) {
    const available = state.sections
      .map((s) => `${s.name} (${s.id})`)
      .join("; ");
    throw new Error(
      `Missing sectionId. Available sections: ${available || "none"}.`
    );
  }
  const exact = state.sections.find((section) => section.id === sectionId);
  if (exact) return exact;

  // Be forgiving: agents sometimes pass the section *name* (e.g. "Beliefs")
  // instead of the slug ID ("beliefs"). Resolve case-insensitively against
  // both the ID and the display name before failing.
  const lower = sectionId.toLowerCase();
  const fuzzy = state.sections.find(
    (section) =>
      section.id.toLowerCase() === lower ||
      section.name.toLowerCase() === lower
  );
  if (fuzzy) return fuzzy;

  const available = state.sections
    .map((s) => `${s.name} (${s.id})`)
    .join("; ");
  throw new Error(
    `No section matches "${sectionId}". Available sections: ${available || "none"}.`
  );
}

type MutationKind = "update" | "delete" | "rename" | "recolor";

async function runSectionMutation(
  request: Request,
  state: CreedState,
  kind: MutationKind,
  section: CreedSection,
  payload: {
    contentMarkdown?: string;
    name?: string;
    accent?: AccentKey;
    reason?: string;
  },
  agentName: string | null
) {
  if (!section.agentWritable) {
    throw new Error(
      `Section ${section.id} is not agent-writable. Ask the user to flip its agent-writable toggle to grant access.`
    );
  }

  const useDirectEdit = !state.settings.requireApproval;

  if (useDirectEdit) {
    const body =
      kind === "update"
        ? {
            operation: "update_section",
            sectionId: section.id,
            agentName,
            integration: "mcp",
            section: { kind: "rich-text", contentMarkdown: payload.contentMarkdown },
          }
        : kind === "delete"
          ? {
              operation: "delete_section",
              sectionId: section.id,
              agentName,
              integration: "mcp",
            }
          : kind === "rename"
            ? {
                operation: "rename_section",
                sectionId: section.id,
                name: payload.name,
                agentName,
                integration: "mcp",
              }
            : {
                operation: "recolor_section",
                sectionId: section.id,
                accent: payload.accent,
                agentName,
                integration: "mcp",
              };

    await callInternalCreedRoute(request, "/api/creed/write", state.directEditToken, body);
    return jsonToolResult({
      ok: true,
      mode: "direct",
      operation: directOperationName(kind),
      sectionId: section.id,
    });
  }

  // Approval is on — submit a proposal. Defaults handle the categorisation
  // fields server-side so the agent doesn't have to invent them.
  const draft =
    kind === "update"
      ? { kind: "rich-text", contentMarkdown: payload.contentMarkdown }
      : kind === "delete"
        ? { kind: "delete-section" }
        : kind === "rename"
          ? { kind: "rename-section", name: payload.name }
          : { kind: "recolor-section", accent: payload.accent };

  const proposalId = `mcp-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await callInternalCreedRoute(request, "/api/creed/proposals", state.writeToken, {
    id: proposalId,
    sectionId: section.id,
    sectionName: section.name,
    agentName,
    reason: payload.reason || defaultReasonFor(kind),
    draft,
    integration: "mcp",
  });
  return jsonToolResult({
    ok: true,
    mode: "proposed",
    operation: directOperationName(kind),
    sectionId: section.id,
    proposalId,
  });
}

async function runCreate(
  request: Request,
  state: CreedState,
  payload: {
    name: string;
    contentMarkdown: string;
    accent?: AccentKey;
    insertAfterSectionId?: string;
    reason?: string;
  },
  agentName: string | null
) {
  const useDirectEdit = !state.settings.requireApproval;

  if (useDirectEdit) {
    await callInternalCreedRoute(request, "/api/creed/write", state.directEditToken, {
      operation: "create_section",
      agentName,
      integration: "mcp",
      section: {
        kind: "rich-text",
        name: payload.name,
        accent: payload.accent,
        insertAfterSectionId: payload.insertAfterSectionId,
        contentMarkdown: payload.contentMarkdown,
      },
    });
    return jsonToolResult({
      ok: true,
      mode: "direct",
      operation: "create_section",
      sectionName: payload.name,
    });
  }

  const proposalId = `mcp-create-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await callInternalCreedRoute(request, "/api/creed/proposals", state.writeToken, {
    id: proposalId,
    sectionId: "new-section",
    sectionName: payload.name,
    agentName,
    reason: payload.reason || "Captured useful context that didn't fit an existing section.",
    draft: {
      kind: "new-section",
      name: payload.name,
      accent: payload.accent,
      insertAfterSectionId: payload.insertAfterSectionId,
      contentMarkdown: payload.contentMarkdown,
    },
    integration: "mcp",
  });
  return jsonToolResult({
    ok: true,
    mode: "proposed",
    operation: "create_section",
    sectionName: payload.name,
    proposalId,
  });
}

function directOperationName(kind: MutationKind) {
  return kind === "update"
    ? "update_section"
    : kind === "delete"
      ? "delete_section"
      : kind === "rename"
        ? "rename_section"
        : "recolor_section";
}

function defaultReasonFor(kind: MutationKind) {
  if (kind === "delete") return "Section is no longer useful.";
  if (kind === "rename") return "Clearer name.";
  if (kind === "recolor") return "Better-matching accent.";
  return "Captured durable context worth remembering.";
}

// ---------------------------------------------------------------------------
// Append / Reorder runners. Kept as separate functions from runSectionMutation
// because their state transitions (append merges content, reorder mutates an
// array) don't share the per-section update pattern.
// ---------------------------------------------------------------------------

async function runAppend(
  request: Request,
  state: CreedState,
  section: CreedSection,
  payload: { contentMarkdown: string; reason?: string },
  agentName: string | null
) {
  if (!section.agentWritable) {
    throw new Error(
      `Section ${section.id} is not agent-writable. Ask the user to flip its agent-writable toggle to grant access.`
    );
  }

  if (!state.settings.requireApproval) {
    await callInternalCreedRoute(request, "/api/creed/write", state.directEditToken, {
      operation: "append_to_section",
      sectionId: section.id,
      agentName,
      integration: "mcp",
      contentMarkdown: payload.contentMarkdown,
    });
    return jsonToolResult({
      ok: true,
      mode: "direct",
      operation: "append_to_section",
      sectionId: section.id,
    });
  }

  // Approval-on path: submit a rich-text proposal with the merged body so
  // the user reviews the FULL resulting section (existing + appended). We
  // build the merged body here rather than relying on the user to mentally
  // combine the two snippets — they should accept/reject the actual end
  // state.
  const existing = (section.content ?? "").trim();
  const appendedHtml = markdownToRichHtml(payload.contentMarkdown);
  const separator = existing ? `<hr class="creed-hr" />` : "";
  const mergedHtml = `${existing}${separator}${appendedHtml}`;

  const proposalId = `mcp-append-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await callInternalCreedRoute(request, "/api/creed/proposals", state.writeToken, {
    id: proposalId,
    sectionId: section.id,
    sectionName: section.name,
    agentName,
    reason: payload.reason || "Captured new context that adds to the existing section.",
    draft: { kind: "rich-text", contentHtml: mergedHtml },
    integration: "mcp",
  });
  return jsonToolResult({
    ok: true,
    mode: "proposed",
    operation: "append_to_section",
    sectionId: section.id,
    proposalId,
  });
}

async function runReorder(
  request: Request,
  state: CreedState,
  section: CreedSection,
  payload: {
    afterSectionId?: string;
    position?: "first" | "last";
    reason?: string;
  },
  agentName: string | null
) {
  if (!section.agentWritable) {
    throw new Error(
      `Section ${section.id} is not agent-writable. Ask the user to flip its agent-writable toggle to grant access.`
    );
  }

  if (!state.settings.requireApproval) {
    await callInternalCreedRoute(request, "/api/creed/write", state.directEditToken, {
      operation: "reorder_section",
      sectionId: section.id,
      agentName,
      integration: "mcp",
      afterSectionId: payload.afterSectionId,
      position: payload.position,
    });
    return jsonToolResult({
      ok: true,
      mode: "direct",
      operation: "reorder_section",
      sectionId: section.id,
    });
  }

  const proposalId = `mcp-reorder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await callInternalCreedRoute(request, "/api/creed/proposals", state.writeToken, {
    id: proposalId,
    sectionId: section.id,
    sectionName: section.name,
    agentName,
    reason: payload.reason || "Better-flowing section order.",
    draft: {
      kind: "reorder-section",
      afterSectionId: payload.afterSectionId,
      position: payload.position,
    },
    integration: "mcp",
  });
  return jsonToolResult({
    ok: true,
    mode: "proposed",
    operation: "reorder_section",
    sectionId: section.id,
    proposalId,
  });
}

// ---------------------------------------------------------------------------
// Search + quality report helpers. Pure read paths.
// ---------------------------------------------------------------------------

function stripHtmlForSearch(html: string): string {
  // Strip tags, collapse whitespace. Keep accents/casing — we lowercase at
  // the match site, not here, so snippets preserve the original casing.
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function searchSections(state: CreedState, query: string, limit: number) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (terms.length === 0) return [];

  const results: Array<{
    sectionId: string;
    sectionName: string;
    score: number;
    snippet: string;
    matchedTerms: string[];
  }> = [];

  for (const section of state.sections) {
    const plainBody = stripHtmlForSearch(section.content ?? "");
    const haystack = `${section.name} ${plainBody}`.toLowerCase();
    const matched = terms.filter((term) => haystack.includes(term));
    if (matched.length === 0) continue;

    // Score: terms matched + bonus if any term hits the name.
    const nameLower = section.name.toLowerCase();
    const nameHits = terms.filter((term) => nameLower.includes(term)).length;
    const score = matched.length * 10 + nameHits * 5;

    // Build a snippet centered on the first matching term within the body.
    const bodyLower = plainBody.toLowerCase();
    const firstHitTerm = matched.find((term) => bodyLower.includes(term));
    let snippet = "";
    if (firstHitTerm) {
      const hitIndex = bodyLower.indexOf(firstHitTerm);
      const start = Math.max(0, hitIndex - 60);
      const end = Math.min(plainBody.length, hitIndex + firstHitTerm.length + 60);
      const prefix = start > 0 ? "…" : "";
      const suffix = end < plainBody.length ? "…" : "";
      snippet = `${prefix}${plainBody.slice(start, end)}${suffix}`;
    } else {
      // All matches were against the name. Fall back to the start of the body.
      snippet = plainBody.slice(0, 120) + (plainBody.length > 120 ? "…" : "");
    }

    results.push({
      sectionId: section.id,
      sectionName: section.name,
      score,
      snippet,
      matchedTerms: matched,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

async function loadLatestQualityReport(
  state: CreedState,
  userId: string
): Promise<CreedQualityReport | null> {
  // userId is threaded down from the request entry where we already
  // resolved it once via findUserIdByMcpToken — avoids a second indexed
  // lookup + token hashing pass on every quality-report read.
  const admin = getSupabaseAdminClient();
  const row = await readLatestQualityReport(admin as never, userId);
  if (!row?.report) return null;
  try {
    return validateQualityReport(
      row.report,
      state.sections,
      typeof row.content_hash === "string" ? row.content_hash : ""
    );
  } catch {
    // Stored report doesn't validate against the current sections (probably
    // schema drift or a section was deleted). Return null — agents should
    // re-run analysis rather than act on a stale report.
    return null;
  }
}


async function handleRpcRequest(
  request: Request,
  rpcRequest: JsonRpcRequest,
  state: CreedState,
  userId: string
) {
  if (!rpcRequest.method) {
    return errorFor(rpcRequest.id, -32600, "Missing JSON-RPC method.");
  }

  if (rpcRequest.method === "initialize") {
    return responseFor(rpcRequest.id, {
      protocolVersion: "2025-06-18",
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: "Creed",
        version: "0.1.0",
      },
    });
  }

  if (rpcRequest.method === "notifications/initialized") {
    return null;
  }

  if (rpcRequest.method === "tools/list") {
    return responseFor(rpcRequest.id, { tools });
  }

  if (rpcRequest.method === "tools/call") {
    try {
      const result = await handleToolCall(request, rpcRequest, state, userId);
      return responseFor(rpcRequest.id, result);
    } catch (error) {
      return errorFor(
        rpcRequest.id,
        -32000,
        error instanceof Error ? error.message : "Creed MCP tool call failed."
      );
    }
  }

  return errorFor(rpcRequest.id, -32601, `Unsupported MCP method: ${rpcRequest.method}.`);
}

export async function GET() {
  return NextResponse.json({
    name: "Creed MCP",
    transport: "streamable-http",
  });
}

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Supabase admin configuration is missing." }, { status: 503 });
  }

  const mcpToken = getBearerToken(request);
  if (!mcpToken) {
    return NextResponse.json(
      {
        error: "Missing MCP credential.",
        auth: "bearer",
        message:
          "Configure Creed MCP with an Authorization: Bearer <mcp_token> header. Creed does not use OAuth for MCP.",
        docs: `${getSiteUrl()}/docs`,
      },
      { status: 401 }
    );
  }

  const verdict = checkRateLimit({
    scope: "creed-mcp",
    identifier: mcpToken,
    limit: 120,
    windowMs: 60_000,
  });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } }
    );
  }

  const admin = getSupabaseAdminClient();
  const userId = await findUserIdByMcpToken(admin as never, mcpToken);

  if (!userId) {
    return NextResponse.json({ error: "Invalid MCP credential." }, { status: 401 });
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !userData.user) {
    return NextResponse.json({ error: userError?.message ?? "Could not load MCP credential owner." }, { status: 500 });
  }

  const body = (await request.json()) as JsonRpcRequest | JsonRpcRequest[];
  // MCP only needs recent activity for the `creed_get_recent_activity`
  // tool — 100 rows is plenty of "what other agents did lately". Proposals
  // are only used for validation lookups (none of the per-tool handlers
  // iterate the list), so a tight cap is safe.
  const { state } = await loadCreedState(admin as never, userData.user, {
    proposalLimit: 100,
    activityLimit: 100,
  });
  const requests = Array.isArray(body) ? body : [body];
  const firstRequest = requests[0];
  const firstToolArgs =
    firstRequest?.method === "tools/call"
      ? ((firstRequest.params as McpToolCallParams | undefined)?.arguments ?? {})
      : undefined;

  await recordMcpCredentialUsage(admin as never, userId, getClientName(firstRequest ?? {}, firstToolArgs));

  const results = (
    await Promise.all(requests.map((rpcRequest) => handleRpcRequest(request, rpcRequest, state, userId)))
  ).filter(Boolean);

  if (results.length === 0) {
    return new NextResponse(null, { status: 202 });
  }

  return NextResponse.json(Array.isArray(body) ? results : results[0]);
}
