import "server-only";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";
import { getCreedRole } from "@/lib/creed-membership";
import { encryptSecret, hashSecret } from "@creed/integrations/secret-crypto";
import type { AgentPermission } from "@creed/core/creed-data";
import { recordAuditEvent } from "@/lib/audit-log";
import { getDisplayName } from "@/lib/user-name";

// Cloud owner/admin operations for a Shared Creed: roles, member removal,
// per-section permissions, rename, ownership transfer, delete, and BYOK. All run
// on the service-role admin client after an app-level role check, and record an
// audit row + (where member-visible) an activity row.

export type AdminResult =
  { ok: true } | { ok: false; error: string; status: number };

function admin(): SupabaseLikeClient {
  return getSupabaseAdminClient() as unknown as SupabaseLikeClient;
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
    action: "shared.role_changed",
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
    action: "shared.member_removed",
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
    action: "shared.permission_changed",
    metadata: {
      creedId: params.creedId,
      targetUserId: params.targetUserId,
      sectionId: params.sectionId,
      permission: params.permission,
    },
  });
  return { ok: true };
}

/**
 * Transfer ownership to another member. The old owner becomes admin, the target
 * becomes owner, and the Creed owner_user_id follows. Owner-only.
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
    return { ok: false, error: "You already own this shared.", status: 400 };
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
    action: "shared.ownership_transferred",
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

/** Delete the Shared Creed (owner-only). Cascades all content via FKs. */
export async function deleteShared(params: {
  creedId: string;
  actor: User;
}): Promise<AdminResult> {
  const db = admin();
  const actorRole = await getCreedRole(db, params.actor.id, params.creedId);
  if (actorRole !== "owner") {
    return {
      ok: false,
      error: "Only the owner can delete the Shared Creed.",
      status: 403,
    };
  }
  await recordAuditEvent({
    userId: params.actor.id,
    action: "shared.deleted",
    metadata: { creedId: params.creedId },
  });
  const { error } = await db
    .from("creeds")
    .delete()
    .eq("id", params.creedId);
  if (error) {
    return { ok: false, error: "Could not delete the Shared Creed.", status: 500 };
  }
  return { ok: true };
}

/** Set or clear the shared BYOK OpenRouter key (owner-only, encrypted at rest). */
export async function setSharedByok(params: {
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
  const row: Record<string, unknown> = {
    creed_id: params.creedId,
    updated_by: params.actor.id,
    updated_at: new Date().toISOString(),
  };
  if (params.key === null || params.key.trim() === "") {
    row.encrypted_api_key = null;
    row.api_key_hash = null;
    row.api_key_last_four = null;
    row.key_status = "missing";
    row.ai_mode = params.mode ?? "credits";
  } else {
    const key = params.key.trim();
    row.encrypted_api_key = encryptSecret(key);
    row.api_key_hash = hashSecret(key);
    row.api_key_last_four = key.slice(-4);
    row.key_status = "valid";
    row.ai_mode = params.mode ?? "byok";
  }
  const { error } = await db
    .from("creed_ai_settings")
    .upsert(row, { onConflict: "creed_id" });
  if (error)
    return { ok: false, error: "Could not update BYOK settings.", status: 500 };
  await recordAuditEvent({
    userId: params.actor.id,
    action: "shared.byok_updated",
    metadata: { creedId: params.creedId, cleared: params.key === null },
  });
  await activity(
    params.creedId,
    params.actor,
    `${actorName(params.actor)} updated the shared BYOK settings`,
    "byok",
  );
  return { ok: true };
}

/**
 * Switch the shared between credits and BYOK without touching the stored key
 * (owner-only). A partial upsert leaves encrypted_api_key / key_status
 * intact, so toggling back to BYOK does not require re-entering the key - exactly
 * how the personal mode toggle behaves.
 */
export async function setSharedAiMode(params: {
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
  const { error } = await db
    .from("creed_ai_settings")
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
    action: "shared.ai_mode_updated",
    metadata: { creedId: params.creedId, mode: params.mode },
  });
  return { ok: true };
}
