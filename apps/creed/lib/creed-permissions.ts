// Pure permission logic for Company Creeds.
//
// No IO, no DB, no React - just the rules that decide what a role, a member, or
// a member's agent may do to a section, plus the derived billing-access state.
// Kept pure and dependency-free (only a type-only import) so it is unit-testable
// with `node --test` and shared byte-identically by three call sites:
//
//   1. the server payload builders (strip Hidden sections before they leave),
//   2. the company write-route guards (reject writes the caller may not make),
//   3. the client UI (grey out / lock what the member cannot do).
//
// The DB helpers creed_role() and creed_section_permission() encode the same
// rules in SQL for RLS; this module is their TypeScript twin. Keep them in sync.

import type { AgentPermission } from "@/lib/creed-data";

// A Creed is a single-user personal file or a shared company file.
export type CreedType = "personal" | "company";

// The three V1 roles. Exactly one owner per Creed (enforced in the schema).
export type CreedRole = "owner" | "admin" | "member";

// The four member section-permission levels ARE the AgentPermission vocabulary,
// reused so the member ceiling and the agent ceiling share one lattice.
//   hidden       -> section invisible to the member and their agents
//   read-only    -> visible, not editable
//   propose      -> may suggest edits (owner/admin approve)  [UI: "Proposal-only"]
//   direct       -> may edit directly                        [UI: "Direct edit"]

// The mode a user picks for one of their MCP agents on one Creed. Spelled
// "proposal-only" (user-facing) vs the section permission's "propose"; mapped
// into the shared lattice by MODE_TO_PERMISSION below.
export type McpAgentMode = "read-only" | "proposal-only" | "direct";

// Derived access state for a company Creed, from its billing status.
export type CompanyAccessState = "active" | "past_due" | "frozen";

// The permission lattice. Higher rank = more power. Every ceiling operation is
// a `min` over this order, so combining two ceilings never grants more than
// either allows.
const PERMISSION_RANK: Record<AgentPermission, number> = {
  hidden: 0,
  "read-only": 1,
  propose: 2,
  direct: 3,
};

const MODE_TO_PERMISSION: Record<McpAgentMode, AgentPermission> = {
  "read-only": "read-only",
  "proposal-only": "propose",
  direct: "direct",
};

/**
 * The effective permission a member has on a section.
 *
 * Owner and Admin always have Direct edit on every section (they are never
 * looked up in the override table). A Member gets their per-section override, or
 * Direct edit when there is no override row (the permissive default).
 */
export function resolveSectionPermission(
  role: CreedRole,
  override: AgentPermission | null | undefined,
): AgentPermission {
  if (role === "owner" || role === "admin") return "direct";
  return override ?? "direct";
}

/** Can the member see the section at all? (Everything except Hidden.) */
export function canViewSection(permission: AgentPermission): boolean {
  return permission !== "hidden";
}

/** Can the member edit the section directly (no proposal step)? */
export function canDirectEditSection(permission: AgentPermission): boolean {
  return permission === "direct";
}

/** Can the member suggest an edit (either propose, or direct which implies it)? */
export function canProposeToSection(permission: AgentPermission): boolean {
  return permission === "propose" || permission === "direct";
}

/**
 * May the caller approve/reject a proposal on this section?
 * Owner/Admin may approve anything; a Member may approve only on sections where
 * they themselves hold Direct edit.
 */
export function canApproveProposal(
  role: CreedRole,
  sectionPermission: AgentPermission,
): boolean {
  if (role === "owner" || role === "admin") return true;
  return sectionPermission === "direct";
}

/** Owner/Admin: invite, remove, change roles, change section permissions. */
export function canManageMembers(role: CreedRole): boolean {
  return role === "owner" || role === "admin";
}

/** Owner/Admin: archive, delete, and reorder sections. */
export function canManageSectionsLifecycle(role: CreedRole): boolean {
  return role === "owner" || role === "admin";
}

/** Owner/Admin: run shared company quality analysis. */
export function canRunAnalysis(role: CreedRole): boolean {
  return role === "owner" || role === "admin";
}

/** Owner only: billing, seats, top-ups, BYOK, cancel, transfer, delete Creed. */
export function canManageBilling(role: CreedRole): boolean {
  return role === "owner";
}

/**
 * The permission levels at or below `ceiling`, weakest first. A member may only
 * grant their own agent up to what they themselves hold on a section, so the UI
 * caps the choices to this set (e.g. a member with Proposal-only cannot pick
 * Direct edit). Mirrors the server's `min`-over-the-lattice clamp.
 */
export function permissionsUpTo(ceiling: AgentPermission): AgentPermission[] {
  return (Object.keys(PERMISSION_RANK) as AgentPermission[])
    .filter((p) => PERMISSION_RANK[p] <= PERMISSION_RANK[ceiling])
    .sort((a, b) => PERMISSION_RANK[a] - PERMISSION_RANK[b]);
}

/**
 * The effective ceiling for a member's agent on a section: the lower of what the
 * member may do (memberPermission) and what the member has allowed this agent to
 * do (agentMode). An agent can never exceed its user (non-negotiable #9).
 */
export function effectiveAgentPermission(
  memberPermission: AgentPermission,
  agentMode: McpAgentMode,
): AgentPermission {
  const modePermission = MODE_TO_PERMISSION[agentMode];
  return PERMISSION_RANK[memberPermission] <= PERMISSION_RANK[modePermission]
    ? memberPermission
    : modePermission;
}

/**
 * The weaker of two permissions on the shared lattice. Combining two ceilings
 * always narrows: an agent's reach on a company section is min(owner/admin
 * ceiling, the member's own agent ceiling), so neither can be exceeded.
 */
export function minPermission(
  a: AgentPermission,
  b: AgentPermission,
): AgentPermission {
  return PERMISSION_RANK[a] <= PERMISSION_RANK[b] ? a : b;
}

/**
 * Derive the access state of a company Creed from its billing status.
 * `past_due` still grants full access (Stripe's smart-retry grace window) but
 * warrants a fix-billing banner. `frozen` is read-only: no writes, proposals,
 * invites, or AI, but data is retained and recovers when billing is fixed.
 */
export function deriveCompanyAccessState(
  status: string | null | undefined,
): CompanyAccessState {
  switch (status) {
    case "paid":
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    // refunded, canceled, incomplete, unknown -> locked.
    default:
      return "frozen";
  }
}

/** Writes (manual, MCP, proposals, invites, AI) are allowed unless frozen. */
export function companyIsWritable(state: CompanyAccessState): boolean {
  return state !== "frozen";
}
