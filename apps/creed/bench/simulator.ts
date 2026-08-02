import { CREED_BENCH_INSTRUCTIONS } from "./tool-contract.ts";
import type {
  BenchSection,
  BenchWorld,
  MutationRecord,
  Permission,
  ToolTraceEntry,
} from "./types.ts";

const ACCENTS = new Set([
  "identity", "stack", "operating-principles", "decisions", "preferences",
  "workflows", "tools", "boundaries", "questions", "skills", "mini-skills",
  "projects", "output", "rose", "yellow", "mono", "custom",
]);

function stringArg(args: Record<string, unknown>, key: string, required = true) {
  const value = args[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!required) return "";
  throw new Error(`${key} must be a non-empty string`);
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "section";
}

function cloneWorld(world: BenchWorld): BenchWorld {
  return structuredClone(world);
}

function markdown(world: BenchWorld) {
  return world.sections
    .filter((section) => section.permission !== "hidden")
    .map((section) => `## ${section.name}\n${section.contentMarkdown}`)
    .join("\n\n");
}

function markdownToFixtureHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function wireMode(mode: "proposal" | "direct") {
  return mode === "proposal" ? "proposed" : "direct";
}

export class CreedBenchSimulator {
  readonly initialWorld: BenchWorld;
  readonly trace: ToolTraceEntry[] = [];
  readonly mutations: MutationRecord[] = [];
  world: BenchWorld;

  constructor(world: BenchWorld) {
    this.initialWorld = cloneWorld(world);
    this.world = cloneWorld(world);
  }

  private section(value: string) {
    const normalized = value.toLowerCase();
    const exact = this.world.sections.find(
      (section) =>
        section.id.toLowerCase() === normalized ||
        section.name.toLowerCase() === normalized,
    );
    if (exact) return exact;
    const fuzzy = this.world.sections.find(
      (section) =>
        section.id.toLowerCase().includes(normalized) ||
        section.name.toLowerCase().includes(normalized),
    );
    if (!fuzzy) {
      throw new Error(
        `Unknown section "${value}". Valid section IDs: ${this.world.sections.map((item) => item.id).join(", ")}`,
      );
    }
    return fuzzy;
  }

  private writable(section: BenchSection) {
    if (section.permission === "hidden" || section.permission === "read-only") {
      throw new Error(`Section "${section.id}" is ${section.permission} and cannot be changed`);
    }
  }

  private mutationMode(section?: BenchSection) {
    const permission: Permission = section?.permission ?? "direct";
    return this.world.writePolicy === "proposals_only" || permission === "propose"
      ? "proposal"
      : "direct";
  }

  private recordMutation(record: MutationRecord) {
    this.mutations.push(record);
    return record.mode;
  }

  private applyUpdate(
    tool: string,
    sectionId: string,
    contentMarkdown: string,
    operation: "update" | "append",
    args: Record<string, unknown>,
  ) {
    const section = this.section(sectionId);
    this.writable(section);
    const mode = this.mutationMode(section);
    this.recordMutation({
      tool,
      operation,
      sectionId: section.id,
      mode,
      contentTermGroups: [[contentMarkdown]],
      arguments: args,
    });
    if (mode === "direct") {
      section.contentMarkdown =
        operation === "append"
          ? `${section.contentMarkdown.trim()}\n\n---\n\n${contentMarkdown.trim()}`
          : contentMarkdown.trim();
    }
    return { ok: true, mode: wireMode(mode), operation, sectionId: section.id };
  }

  async call(name: string, args: Record<string, unknown>, turn: number) {
    let result: unknown;
    let error: string | null = null;
    try {
      result = this.execute(name, args);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Unknown tool error";
      result = { ok: false, error };
    }
    this.trace.push({ turn, name, arguments: structuredClone(args), result, error });
    return result;
  }

  private execute(name: string, args: Record<string, unknown>): unknown {
    if (name === "list_creeds") {
      return [
        {
          id: "synthetic-creed",
          name: this.world.creedName,
          type: "personal",
          role: "owner",
          access: "read-write",
        },
      ];
    }
    if (name === "read_creed") {
      return `${markdown(this.world)}\n\n---\n\nAgent operating contract:\n${CREED_BENCH_INSTRUCTIONS}`;
    }
    if (name === "get_write_policy") {
      const visible = this.world.sections.filter(
        (section) => section.permission !== "hidden",
      );
      const direct = visible
        .filter((section) => section.permission === "direct")
        .map((section) => section.id);
      const propose = visible
        .filter((section) => section.permission === "propose")
        .map((section) => section.id);
      return {
        preferredMode: direct.length ? "direct-edit" : "proposal",
        requireApproval: this.world.writePolicy === "proposals_only",
        modeIsMixed: direct.length > 0 && propose.length > 0,
        sectionPermissions: Object.fromEntries(
          visible.map((section) => [section.id, section.permission]),
        ),
        recommendedTools: [
          "creed_update_section", "creed_create_section", "creed_delete_section",
          "creed_rename_section", "creed_recolor_section", "creed_append_to_section",
          "creed_reorder_section",
        ],
        proposalDraftKinds: [
          "rich-text", "new-section", "delete-section", "rename-section",
          "recolor-section", "reorder-section",
        ],
        directEditOperations: [
          "update_section", "create_section", "delete_section", "rename_section",
          "recolor_section", "append_to_section", "reorder_section",
        ],
        proposalTargets: propose,
        directEditTargets: direct,
        proposeSections: propose,
        directSections: direct,
        editableSections: [...direct, ...propose],
        writableSections: [...direct, ...propose],
        validAccentKeys: [...ACCENTS],
      };
    }
    if (name === "list_sections") {
      return this.world.sections
        .filter((section) => section.permission !== "hidden")
        .map((section) => ({
          id: section.id,
          name: section.name,
          kind: "rich-text",
          accent: section.accent,
          permission: section.permission,
        }));
    }
    if (name === "creed_get_section") {
      const section = this.section(stringArg(args, "sectionId"));
      if (section.permission === "hidden") throw new Error("Section is hidden");
      return {
        id: section.id,
        name: section.name,
        accent: section.accent,
        agentWritable: section.permission === "propose" || section.permission === "direct",
        permission: section.permission,
        contentHtml: markdownToFixtureHtml(section.contentMarkdown),
        lastEditedBy: "Synthetic fixture",
        lastEditedType: "manual",
        lastEditedLabel: "Synthetic fixture",
      };
    }
    if (name === "creed_search") {
      const terms = stringArg(args, "query").toLowerCase().split(/\s+/);
      const limit = Math.min(25, Math.max(1, Number(args.limit) || 5));
      return this.world.sections
          .filter((section) => section.permission !== "hidden")
          .filter((section) => {
            const text = `${section.name} ${section.contentMarkdown}`.toLowerCase();
            return terms.every((term) => text.includes(term));
          })
          .slice(0, limit)
          .map((section) => ({
            sectionId: section.id,
            sectionName: section.name,
            score: terms.length,
            snippet: section.contentMarkdown.slice(0, 240),
            matchedTerms: terms,
          }));
    }
    if (name === "creed_get_recent_activity") {
      const limit = Math.min(100, Math.max(1, Number(args.limit) || 20));
      const since = typeof args.sinceISO === "string" ? Date.parse(args.sinceISO) : 0;
      return this.world.activity
          .filter((entry) => !since || Date.parse(entry.createdAt) > since)
          .slice(0, limit);
    }
    if (name === "creed_get_quality_report") {
      const sectionId = typeof args.sectionId === "string" ? args.sectionId : "";
      const sections = sectionId
        ? this.world.quality.filter((slice) => slice.sectionId === this.section(sectionId).id)
        : this.world.quality;
      if (!sections.length) {
        return { available: false, reason: "No quality report is available." };
      }
      if (sectionId) {
        return {
          available: true,
          generatedAt: "2026-07-25T00:00:00.000Z",
          section: sections[0],
        };
      }
      return {
        available: true,
        report: {
          generatedAt: "2026-07-25T00:00:00.000Z",
          sections,
        },
      };
    }
    if (name === "creed_update_section") {
      return this.applyUpdate(
        name,
        stringArg(args, "sectionId"),
        stringArg(args, "contentMarkdown"),
        "update",
        args,
      );
    }
    if (name === "creed_append_to_section") {
      return this.applyUpdate(
        name,
        stringArg(args, "sectionId"),
        stringArg(args, "contentMarkdown"),
        "append",
        args,
      );
    }
    if (name === "creed_create_section") {
      const nameArg = stringArg(args, "name");
      const content = stringArg(args, "contentMarkdown");
      const accent = stringArg(args, "accent", false) || "custom";
      if (!ACCENTS.has(accent)) throw new Error(`Invalid accent "${accent}"`);
      const id = slug(nameArg);
      if (this.world.sections.some((section) => section.id === id || section.name.toLowerCase() === nameArg.toLowerCase())) {
        throw new Error(`Section "${nameArg}" already exists`);
      }
      const mode = this.mutationMode();
      const afterSectionId =
        typeof args.insertAfterSectionId === "string" ? this.section(args.insertAfterSectionId).id : undefined;
      this.recordMutation({
        tool: name,
        operation: "create",
        sectionId: id,
        mode,
        name: nameArg,
        accent,
        afterSectionId,
        contentTermGroups: [[content]],
        arguments: args,
      });
      if (mode === "direct") {
        const section: BenchSection = {
          id,
          name: nameArg,
          accent,
          contentMarkdown: content,
          permission: "direct",
        };
        const anchor = afterSectionId
          ? this.world.sections.findIndex((item) => item.id === afterSectionId)
          : -1;
        this.world.sections.splice(anchor >= 0 ? anchor + 1 : this.world.sections.length, 0, section);
      }
      return {
        ok: true,
        mode: wireMode(mode),
        operation: "create",
        sectionId: id,
        sectionName: nameArg,
      };
    }
    if (name === "creed_delete_section") {
      const section = this.section(stringArg(args, "sectionId"));
      this.writable(section);
      const mode = this.mutationMode(section);
      this.recordMutation({ tool: name, operation: "delete", sectionId: section.id, mode, arguments: args });
      if (mode === "direct") {
        this.world.sections = this.world.sections.filter((item) => item.id !== section.id);
      }
      return {
        ok: true,
        mode: wireMode(mode),
        operation: "delete",
        sectionId: section.id,
      };
    }
    if (name === "creed_rename_section") {
      const section = this.section(stringArg(args, "sectionId"));
      const newName = stringArg(args, "name");
      this.writable(section);
      const mode = this.mutationMode(section);
      this.recordMutation({
        tool: name,
        operation: "rename",
        sectionId: section.id,
        mode,
        name: newName,
        arguments: args,
      });
      if (mode === "direct") section.name = newName;
      return {
        ok: true,
        mode: wireMode(mode),
        operation: "rename",
        sectionId: section.id,
      };
    }
    if (name === "creed_recolor_section") {
      const section = this.section(stringArg(args, "sectionId"));
      const accent = stringArg(args, "accent");
      if (!ACCENTS.has(accent)) throw new Error(`Invalid accent "${accent}"`);
      this.writable(section);
      const mode = this.mutationMode(section);
      this.recordMutation({
        tool: name,
        operation: "recolor",
        sectionId: section.id,
        mode,
        accent,
        arguments: args,
      });
      if (mode === "direct") section.accent = accent;
      return {
        ok: true,
        mode: wireMode(mode),
        operation: "recolor",
        sectionId: section.id,
      };
    }
    if (name === "creed_reorder_section") {
      const section = this.section(stringArg(args, "sectionId"));
      this.writable(section);
      const position = args.position === "first" || args.position === "last" ? args.position : undefined;
      const afterSectionId =
        typeof args.afterSectionId === "string" ? this.section(args.afterSectionId).id : undefined;
      if ((!position && !afterSectionId) || (position && afterSectionId)) {
        throw new Error("Provide exactly one of position or afterSectionId");
      }
      const mode = this.mutationMode(section);
      this.recordMutation({
        tool: name,
        operation: "reorder",
        sectionId: section.id,
        mode,
        position,
        afterSectionId,
        arguments: args,
      });
      if (mode === "direct") {
        this.world.sections = this.world.sections.filter((item) => item.id !== section.id);
        if (position === "first") this.world.sections.unshift(section);
        else if (position === "last") this.world.sections.push(section);
        else {
          const anchor = this.world.sections.findIndex((item) => item.id === afterSectionId);
          this.world.sections.splice(anchor + 1, 0, section);
        }
      }
      return {
        ok: true,
        mode: wireMode(mode),
        operation: "reorder",
        sectionId: section.id,
      };
    }
    if (name === "propose_creed_update") {
      return this.executeLegacyProposal(args);
    }
    if (name === "direct_edit_creed") {
      if (this.world.writePolicy !== "direct_edit") {
        throw new Error("Direct editing is disabled. Use propose_creed_update or a creed_* tool.");
      }
      return this.executeLegacyDirect(args);
    }
    throw new Error(`Unknown tool "${name}"`);
  }

  private executeLegacyProposal(args: Record<string, unknown>) {
    const draft = args.draft;
    if (typeof draft !== "object" || draft === null || Array.isArray(draft)) {
      throw new Error("draft must be an object");
    }
    const value = draft as Record<string, unknown>;
    const kind = stringArg(value, "kind");
    const sectionId = stringArg(args, "sectionId");
    const mappings: Record<string, MutationRecord["operation"]> = {
      "rich-text": "update",
      "new-section": "create",
      "delete-section": "delete",
      "rename-section": "rename",
      "recolor-section": "recolor",
    };
    const operation = mappings[kind];
    if (!operation) throw new Error(`Unsupported draft kind "${kind}"`);
    const record: MutationRecord = {
      tool: "propose_creed_update",
      operation,
      sectionId,
      mode: "proposal",
      name: typeof value.name === "string" ? value.name : undefined,
      accent: typeof value.accent === "string" ? value.accent : undefined,
      contentTermGroups:
        typeof value.contentMarkdown === "string" ? [[value.contentMarkdown]] : undefined,
      arguments: args,
    };
    this.recordMutation(record);
    return { ok: true };
  }

  private executeLegacyDirect(args: Record<string, unknown>) {
    const operation = stringArg(args, "operation");
    if (operation === "append_to_section") {
      return this.applyUpdate(
        "direct_edit_creed",
        stringArg(args, "sectionId"),
        stringArg(args, "contentMarkdown"),
        "append",
        args,
      );
    }
    if (operation === "delete_section") {
      return this.execute("creed_delete_section", args);
    }
    if (operation === "rename_section") {
      return this.execute("creed_rename_section", args);
    }
    if (operation === "recolor_section") {
      return this.execute("creed_recolor_section", args);
    }
    if (operation === "reorder_section") {
      return this.execute("creed_reorder_section", args);
    }
    const sectionPayload =
      typeof args.section === "object" && args.section !== null && !Array.isArray(args.section)
        ? (args.section as Record<string, unknown>)
        : {};
    if (operation === "update_section") {
      return this.applyUpdate(
        "direct_edit_creed",
        stringArg(args, "sectionId"),
        stringArg(sectionPayload, "contentMarkdown"),
        "update",
        args,
      );
    }
    if (operation === "create_section") {
      return this.execute("creed_create_section", {
        name: stringArg(sectionPayload, "name"),
        contentMarkdown: stringArg(sectionPayload, "contentMarkdown"),
        accent: stringArg(sectionPayload, "accent", false),
      });
    }
    throw new Error(`Unsupported operation "${operation}"`);
  }
}
