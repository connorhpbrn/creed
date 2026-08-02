import "server-only";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseLikeClient } from "@/lib/supabase/types";
import { getCreedRole } from "@/lib/creed-membership";
import { encryptSecret, hashSecret } from "@/lib/secret-crypto";
import type { AgentPermission } from "@/lib/creed-data";
import { recordAuditEvent } from "@/lib/audit-log";
import { getCompanyBilling } from "@/lib/company-billing";
import { deriveCompanyAccessState } from "@/lib/creed-permissions";
import { getDisplayName } from "@/lib/user-name";

// Owner/admin management operations for a company Creed: roles, member removal,
// per-section permissions, rename, ownership transfer, delete, and BYOK. All run
// on the service-role admin client after an app-level role check, and record an
// audit row + (where member-visible) an activity row.

export type AdminResult =
  { ok: true } | { ok: false; error: string; status: number };

function admin(): SupabaseLikeClient {
  return getSupabaseAdminClient() as unknown as SupabaseLikeClient;
}

// A frozen (billing-lapsed) company is read-only: management ops are rejected,
// consistent with the content/invite/AI paths. The escape hatches - transfer
// ownership and delete - are deliberately NOT gated so a lapsed owner can still
// hand off or wind down.
async function frozenResult(creedId: string): Promise<AdminResult | null> {
  const billing = await getCompanyBilling(creedId);
  if (billing && deriveCompanyAccessState(billing.status) === "frozen") {
    return {
      ok: false,
      error: "This company is read-only until billing is fixed.",
      status: 403,
    };
  }
  return null;
}

function actorName(user: User): string {
  return getDisplayName(user, "Someone");
}

async function activity(
  creedId: string,
  user: User,
  summary: string,
  eventKind: string,
): Promise<void> {
  const db = admin();
  const { randomBytes } = await import("node:crypto");
  await db.from("creed_activity").insert({
    id: randomBytes(16).toString("hex"),
    creed_id: creedId,
    user_id: user.id,
    actor_user_id: user.id,
    actor: actorName(user),
    actor_type: "user",
    summary,
    status: "direct",
    event_kind: eventKind,
  });
}

/**
 * Change a member's role between admin and member. Owner-only: an admin cannot
 * promote a member to admin or demote another admin - only the owner sets roles.
 * The owner's own role is never changed here (transfer ownership instead).
 */
export async function setMemberRole(params: {
  creedId: string;
  actor: User;
  targetUserId: string;
  role: "admin" | "member";
}): Promise<AdminResult> {
  const db = admin();
  const actorRole = await getCreedRole(db, params.actor.id, params.creedId);
  if (actorRole !== "owner") {
    return {
      ok: false,
      error: "Only the owner can change roles.",
      status: 403,
    };
  }
  const frozen = await frozenResult(params.creedId);
  if (frozen) return frozen;
  const targetRole = await getCreedRole(
    db,
    params.targetUserId,
    params.creedId,
  );
  if (targetRole === "owner") {
    return {
      ok: false,
      error: "The owner's role cannot be changed here.",
      status: 400,
    };
  }
  const { error } = await db
    .from("creed_members")
    .update({ role: params.role })
    .eq("creed_id", params.creedId)
    .eq("user_id", params.targetUserId);
  if (error)
    return { ok: false, error: "Could not change the role.", status: 500 };
  await recordAuditEvent({
    userId: params.actor.id,
    action: "company.role_changed",
    metadata: {
      creedId: params.creedId,
      targetUserId: params.targetUserId,
      role: params.role,
    },
  });
  await activity(
    params.creedId,
    params.actor,
    `${actorName(params.actor)} changed a member's role to ${params.role}`,
    "role",
  );
  return { ok: true };
}

/**
 * Remove a member. Owner/admin only. An admin can remove members but NOT another
 * admin (only the owner manages admins); the owner can remove anyone but
 * themselves (transfer ownership first). Clears the removed member's overrides +
 * MCP grants.
 */
export async function removeMember(params: {
  creedId: string;
  actor: User;
  targetUserId: string;
}): Promise<AdminResult> {
  const db = admin();
  const actorRole = await getCreedRole(db, params.actor.id, params.creedId);
  if (actorRole !== "owner" && actorRole !== "admin") {
    return {
      ok: false,
      error: "Only an owner or admin can remove members.",
      status: 403,
    };
  }
  const frozen = await frozenResult(params.creedId);
  if (frozen) return frozen;
  const targetRole = await getCreedRole(
    db,
    params.targetUserId,
    params.creedId,
  );
  if (targetRole === "owner") {
    return {
      ok: false,
      error: "The owner cannot be removed. Transfer ownership first.",
      status: 400,
    };
  }
  if (!targetRole)
    return { ok: false, error: "That person is not a member.", status: 404 };
  if (targetRole === "admin" && actorRole !== "owner") {
    return {
      ok: false,
      error: "Only the owner can remove an admin.",
      status: 403,
    };
  }

  const { error: removeError } = await db
    .from("creed_members")
    .delete()
    .eq("creed_id", params.creedId)
    .eq("user_id", params.targetUserId);
  if (removeError) {
    return { ok: false, error: "Could not remove the member.", status: 500 };
  }
  await db
    .from("creed_member_section_permissions")
    .delete()
    .eq("creed_id", params.creedId)
    .eq("user_id", params.targetUserId);
  // Revoke the removed member's MCP grants for this Creed (their token rows stay;
  // only the per-Creed grant is dropped).
  const { data: tokens } = (await db
    .from("oauth_tokens")
    .select("id")
    .eq("user_id", params.targetUserId)) as {
    data: Array<{ id: string }> | null;
  };
  if (tokens && tokens.length > 0) {
    await db
      .from("oauth_token_creeds")
      .delete()
      .eq("creed_id", params.creedId)
      .in(
        "token_id",
        tokens.map((t) => t.id),
      );
  }
  await recordAuditEvent({
    userId: params.actor.id,
    action: "company.member_removed",
    metadata: { creedId: params.creedId, targetUserId: params.targetUserId },
  });
  await activity(
    params.creedId,
    params.actor,
    `${actorName(params.actor)} removed a member`,
    "membership",
  );
  return { ok: true };
}

/** Set (or clear, when permission is the default) a member's per-section permission. */
export async function setSectionPermission(params: {
  creedId: string;
  actor: User;
  targetUserId: string;
  sectionId: string;
  permission: AgentPermission;
}): Promise<AdminResult> {
  const db = admin();
  const actorRole = await getCreedRole(db, params.actor.id, params.creedId);
  if (actorRole !== "owner" && actorRole !== "admin") {
    return {
      ok: false,
      error: "Only an owner or admin can change permissions.",
      status: 403,
    };
  }
  const frozen = await frozenResult(params.creedId);
  if (frozen) return frozen;
  // Do not let a permission be set on an owner/admin (they are always direct).
  const targetRole = await getCreedRole(
    db,
    params.targetUserId,
    params.creedId,
  );
  if (targetRole !== "member") {
    return {
      ok: false,
      error: "Permissions only apply to members.",
      status: 400,
    };
  }
  const { error } = await db.from("creed_member_section_permissions").upsert(
    {
      creed_id: params.creedId,
      user_id: params.targetUserId,
      section_id: params.sectionId,
      permission: params.permission,
      updated_by: params.actor.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "creed_id,user_id,section_id" },
  );
  if (error)
    return {
      ok: false,
      error: "Could not change the permission.",
      status: 500,
    };
  // Recorded in the audit log only - access changes are deliberately NOT shown
  // in the activity sidebar, which is reserved for content edits / proposals.
  await recordAuditEvent({
    userId: params.actor.id,
    action: "company.permission_changed",
    metadata: {
      creedId: params.creedId,
      targetUserId: params.targetUserId,
      sectionId: params.sectionId,
      permission: params.permission,
    },
  });
  return { ok: true };
}

/** Rename the company Creed (owner/admin). */
// Update the company's General settings: its name and/or its shared contact
// email (owner/admin). Each field is optional so the settings screen can save
// them independently on blur. Passing email as "" clears it.
export async function updateCompanyGeneral(params: {
  creedId: string;
  actor: User;
  name?: string;
  email?: string;
  avatarUrl?: string;
}): Promise<AdminResult> {
  const db = admin();
  const actorRole = await getCreedRole(db, params.actor.id, params.creedId);
  if (actorRole !== "owner" && actorRole !== "admin") {
    return {
      ok: false,
      error: "Only an owner or admin can update company settings.",
      status: 403,
    };
  }
  const frozen = await frozenResult(params.creedId);
  if (frozen) return frozen;
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (params.name !== undefined) {
    const name = params.name.trim();
    if (!name) return { ok: false, error: "Name is required.", status: 400 };
    patch.name = name;
  }
  if (params.email !== undefined) {
    const email = params.email.trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { ok: false, error: "Enter a valid email.", status: 400 };
    }
    patch.company_email = email || null;
  }
  if (params.avatarUrl !== undefined) {
    const avatarUrl = params.avatarUrl.trim();
    if (!avatarUrl) {
      return { ok: false, error: "Avatar URL is required.", status: 400 };
    }
    patch.avatar_url = avatarUrl;
  }
  const { error } = await db
    .from("creeds")
    .update(patch)
    .eq("id", params.creedId);
  if (error) {
    return { ok: false, error: "Could not update company settings.", status: 500 };
  }
  return { ok: true };
}

/**
 * Transfer ownership to another member. The old owner becomes admin, the target
 * becomes owner, and both owner_user_id columns (creeds + creed_company_billing)
 * follow. Owner-only. Frozen billing does NOT block this: an owner must be able
 * to hand off a lapsed company so the new owner can fix billing.
 */
export async function transferOwnership(params: {
  creedId: string;
  actor: User;
  targetUserId: string;
}): Promise<AdminResult> {
  const db = admin();
  const actorRole = await getCreedRole(db, params.actor.id, params.creedId);
  if (actorRole !== "owner") {
    return { ok: false, error: "Only the owner can transfer ownership.", status: 403 };
  }
  if (params.targetUserId === params.actor.id) {
    return { ok: false, error: "You already own this company.", status: 400 };
  }
  const targetRole = await getCreedRole(db, params.targetUserId, params.creedId);
  if (!targetRole) {
    return { ok: false, error: "That person is not a member.", status: 404 };
  }

  // All four writes (both membership roles + both owner_user_id columns) move in
  // one transaction via the RPC, so a partial failure can't leave creed_members
  // and creeds.owner_user_id disagreeing with no safe retry. The RPC demotes
  // before promoting to satisfy the one-owner-per-creed index.
  const rpc = getSupabaseAdminClient() as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
  const { error: transferError } = await rpc.rpc("transfer_creed_ownership", {
    p_creed_id: params.creedId,
    p_from: params.actor.id,
    p_to: params.targetUserId,
  });
  if (transferError) {
    return { ok: false, error: "Could not transfer ownership.", status: 500 };
  }

  await recordAuditEvent({
    userId: params.actor.id,
    action: "company.ownership_transferred",
    metadata: { creedId: params.creedId, from: params.actor.id, to: params.targetUserId },
  });
  await activity(
    params.creedId,
    params.actor,
    `${actorName(params.actor)} transferred ownership`,
    "ownership",
  );
  return { ok: true };
}

/** Delete the company Creed (owner-only). Cascades all content via FKs. */
export async function deleteCompany(params: {
  creedId: string;
  actor: User;
}): Promise<AdminResult> {
  const db = admin();
  const actorRole = await getCreedRole(db, params.actor.id, params.creedId);
  if (actorRole !== "owner") {
    return {
      ok: false,
      error: "Only the owner can delete the company Creed.",
      status: 403,
    };
  }
  await recordAuditEvent({
    userId: params.actor.id,
    action: "company.deleted",
    metadata: { creedId: params.creedId },
  });
  const { error } = await db
    .from("creeds")
    .delete()
    .eq("id", params.creedId);
  if (error) {
    return { ok: false, error: "Could not delete the company Creed.", status: 500 };
  }
  return { ok: true };
}

/** Set or clear the company BYOK OpenRouter key (owner-only, encrypted at rest). */
export async function setCompanyByok(params: {
  creedId: string;
  actor: User;
  key: string | null;
  mode?: "credits" | "byok";
}): Promise<AdminResult> {
  const db = admin();
  const actorRole = await getCreedRole(db, params.actor.id, params.creedId);
  if (actorRole !== "owner") {
    return { ok: false, error: "Only the owner can manage BYOK.", status: 403 };
  }
  const frozen = await frozenResult(params.creedId);
  if (frozen) return frozen;
  const row: Record<string, unknown> = {
    creed_id: params.creedId,
    updated_by: params.actor.id,
    updated_at: new Date().toISOString(),
  };
  if (params.key === null || params.key.trim() === "") {
    row.encrypted_openrouter_key = null;
    row.openrouter_key_hash = null;
    row.api_key_last_four = null;
    row.key_status = "missing";
    row.ai_mode = params.mode ?? "credits";
  } else {
    const key = params.key.trim();
    row.encrypted_openrouter_key = encryptSecret(key);
    row.openrouter_key_hash = hashSecret(key);
    row.api_key_last_four = key.slice(-4);
    row.key_status = "present";
    row.ai_mode = params.mode ?? "byok";
  }
  const { error } = await db
    .from("creed_company_ai_settings")
    .upsert(row, { onConflict: "creed_id" });
  if (error)
    return { ok: false, error: "Could not update BYOK settings.", status: 500 };
  await recordAuditEvent({
    userId: params.actor.id,
    action: "company.byok_updated",
    metadata: { creedId: params.creedId, cleared: params.key === null },
  });
  await activity(
    params.creedId,
    params.actor,
    `${actorName(params.actor)} updated the company BYOK settings`,
    "byok",
  );
  return { ok: true };
}

/**
 * Switch the company between credits and BYOK without touching the stored key
 * (owner-only). A partial upsert leaves encrypted_openrouter_key / key_status
 * intact, so toggling back to BYOK does not require re-entering the key - exactly
 * how the personal mode toggle behaves.
 */
export async function setCompanyAiMode(params: {
  creedId: string;
  actor: User;
  mode: "credits" | "byok";
}): Promise<AdminResult> {
  const db = admin();
  const actorRole = await getCreedRole(db, params.actor.id, params.creedId);
  if (actorRole !== "owner") {
    return {
      ok: false,
      error: "Only the owner can manage AI billing.",
      status: 403,
    };
  }
  const frozen = await frozenResult(params.creedId);
  if (frozen) return frozen;
  const { error } = await db
    .from("creed_company_ai_settings")
    .upsert(
      {
        creed_id: params.creedId,
        ai_mode: params.mode,
        updated_by: params.actor.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "creed_id" },
    );
  if (error)
    return { ok: false, error: "Could not update AI settings.", status: 500 };
  await recordAuditEvent({
    userId: params.actor.id,
    action: "company.ai_mode_updated",
    metadata: { creedId: params.creedId, mode: params.mode },
  });
  return { ok: true };
}
