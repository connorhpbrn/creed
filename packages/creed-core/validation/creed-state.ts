import { ACCENT_KEYS, type CreedState } from "@creed/core/creed-data";

const MAX_STRING = 50_000;
const MAX_SHORT_STRING = 2_000;
const MAX_ARRAY = 5_000;
const MAX_SECTIONS = 200;
const MAX_SECTION_BODY = 100_000;
const AGENT_PERMISSIONS = new Set(["hidden", "read-only", "propose", "direct"]);
const ACCENTS = new Set<string>(ACCENT_KEYS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

function isBoundedString(value: unknown, max = MAX_STRING): boolean {
  return typeof value === "string" && value.length <= max;
}

function isBoundedArray(value: unknown, max = MAX_ARRAY): boolean {
  return Array.isArray(value) && value.length <= max;
}

function isOptionalString(value: unknown, max = MAX_SHORT_STRING) {
  return value === undefined || isBoundedString(value, max);
}

export type CreedStateValidationResult =
  | { ok: true; data: CreedState }
  | { ok: false; error: string };

export function validateCreedState(input: unknown): CreedStateValidationResult {
  if (!isPlainObject(input)) {
    return { ok: false, error: "state must be an object" };
  }

  const user = input.user;
  if (!isPlainObject(user)) {
    return { ok: false, error: "state.user must be an object" };
  }

  if (
    !isBoundedString(user.name, MAX_SHORT_STRING) ||
    !isBoundedString(user.handle, MAX_SHORT_STRING) ||
    !isBoundedString(user.avatarInitials, MAX_SHORT_STRING) ||
    !isBoundedString(user.email, MAX_SHORT_STRING) ||
    !isOptionalString(user.avatarUrl)
  ) {
    return { ok: false, error: "state.user has invalid fields" };
  }

  const required: Array<[string, unknown]> = [
    ["readUrl", input.readUrl],
    ["readToken", input.readToken],
    ["writeToken", input.writeToken],
    ["directEditToken", input.directEditToken],
    ["mcpUrl", input.mcpUrl],
  ];

  for (const [key, value] of required) {
    if (!isBoundedString(value)) {
      return { ok: false, error: `state.${key} must be a bounded string` };
    }
  }

  if (
    input.lastSavedAt !== null &&
    (typeof input.lastSavedAt !== "number" || !Number.isFinite(input.lastSavedAt))
  ) {
    return { ok: false, error: "state.lastSavedAt must be a number or null" };
  }

  if (typeof input.saving !== "boolean") {
    return { ok: false, error: "state.saving must be boolean" };
  }

  if (input.mcpStatus !== "waiting" && input.mcpStatus !== "connected") {
    return { ok: false, error: "state.mcpStatus invalid" };
  }

  if (typeof input.locked !== "boolean") {
    return { ok: false, error: "state.locked must be boolean" };
  }

  if (typeof input.mutationTick !== "number" || !Number.isFinite(input.mutationTick)) {
    return { ok: false, error: "state.mutationTick must be a number" };
  }

  if (
    !isOptionalString(input.mcpLastUsed) ||
    !isOptionalString(input.mcpLastClientName)
  ) {
    return { ok: false, error: "state mcp metadata invalid" };
  }

  const arrayKeys: Array<keyof CreedState> = [
    "sections",
    "proposals",
    "activity",
    "connections",
    "mcpClients",
  ];

  for (const key of arrayKeys) {
    const max = key === "sections" ? MAX_SECTIONS : MAX_ARRAY;
    if (!isBoundedArray(input[key as string], max)) {
      return { ok: false, error: `state.${String(key)} must be a bounded array` };
    }
  }

  const sections = input.sections as unknown[];
  for (const section of sections) {
    if (
      !isPlainObject(section) ||
      !isBoundedString(section.id, MAX_SHORT_STRING) ||
      !isBoundedString(section.name, MAX_SHORT_STRING) ||
      !isBoundedString(section.content, MAX_SECTION_BODY) ||
      !ACCENTS.has(String(section.accent)) ||
      !AGENT_PERMISSIONS.has(String(section.agentPermission)) ||
      typeof section.agentWritable !== "boolean"
    ) {
      return { ok: false, error: "state.sections contains an invalid section" };
    }
    const permissionShouldBeWritable =
      section.agentPermission === "propose" || section.agentPermission === "direct";
    if (section.agentWritable !== permissionShouldBeWritable) {
      return { ok: false, error: "state.sections contains an inconsistent permission" };
    }
  }

  if (!isPlainObject(input.settings)) {
    return { ok: false, error: "state.settings must be an object" };
  }

  if (!isPlainObject(input.onboarding)) {
    return { ok: false, error: "state.onboarding must be an object" };
  }

  if (!isPlainObject(input.sectionRevisions)) {
    return { ok: false, error: "state.sectionRevisions must be an object" };
  }

  return { ok: true, data: input as unknown as CreedState };
}
