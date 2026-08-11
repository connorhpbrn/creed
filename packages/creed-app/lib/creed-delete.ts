import "server-only";
import type { User } from "@supabase/supabase-js";
import { recordAuditEvent } from "@/lib/audit-log";
import { getCreedRole, listUserCreeds } from "@/lib/creed-membership";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";
import { getFirstName } from "@/lib/user-name";

// Owner-only Creed deletion for Personal and Shared. After delete, the caller
// is switched to preferredNextCreedId when still a member, otherwise another
// remaining Creed. If none remain, a blank Personal Creed named after the
// account first name is created and activated.

export type DeleteOwnedCreedResult =
  | {
      ok: true;
      nextCreedId: string;
      createdBlankPersonal: boolean;
    }
  | { ok: false; error: string; status: number };

function admin(): SupabaseLikeClient {
  return getSupabaseAdminClient() as unknown as SupabaseLikeClient;
}

async function createBlankPersonalCreed(user: User): Promise<string | null> {
  const db = admin();
  const name = getFirstName(user);
  const { data, error } = await db
    .from("creeds")
    .insert({
      type: "personal",
      name,
      owner_user_id: user.id,
      onboarding_stage: null,
    })
    .select("id")
    .single();
  if (error || !data || typeof (data as { id?: unknown }).id !== "string") {
    return null;
  }
  const creedId = (data as { id: string }).id;

  const { error: memberError } = await db.from("creed_members").insert({
    creed_id: creedId,
    user_id: user.id,
    role: "owner",
  });
  if (memberError) {
    await db.from("creeds").delete().eq("id", creedId);
    return null;
  }

  const { error: sectionError } = await db.from("creed_sections").insert({
    user_id: user.id,
    section_id: "identity",
    position: 0,
    kind: "rich-text",
    name: "Identity",
    accent: "identity",
    payload: {
      content: "<p></p>",
      template: "identity",
      agentWritable: true,
      agentPermission: "propose",
    },
    last_edited_by: "You",
    last_edited_type: "user",
    agent_writable: true,
    template: "identity",
    agent_permission: "propose",
    creed_id: creedId,
  });
  if (sectionError) {
    await db.from("creeds").delete().eq("id", creedId);
    return null;
  }

  return creedId;
}

export async function deleteOwnedCreed(params: {
  creedId: string;
  actor: User;
  preferredNextCreedId?: string | null;
}): Promise<DeleteOwnedCreedResult> {
  const db = admin();
  const actorRole = await getCreedRole(db, params.actor.id, params.creedId);
  if (actorRole !== "owner") {
    return {
      ok: false,
      error: "Only the owner can delete this Creed.",
      status: 403,
    };
  }

  const before = await listUserCreeds(db, params.actor.id);
  const target = before.find((creed) => creed.id === params.creedId);
  if (!target) {
    return { ok: false, error: "Creed not found.", status: 404 };
  }

  await recordAuditEvent({
    userId: params.actor.id,
    action:
      target.type === "shared" ? "shared.deleted" : "creed.deleted",
    metadata: { creedId: params.creedId, type: target.type },
  });

  // Move the account credit pot off this Creed before delete (FK restrict).
  const { reassignCreditsHomeBeforeDelete, ensureCreditsHomeCreed } = await import(
    "@creed/edition/credits"
  );
  await reassignCreditsHomeBeforeDelete({
    userId: params.actor.id,
    deletingCreedId: params.creedId,
    preferredNextCreedId: params.preferredNextCreedId,
  });

  const { error } = await db.from("creeds").delete().eq("id", params.creedId);
  if (error) {
    return { ok: false, error: "Could not delete this Creed.", status: 500 };
  }

  const remaining = before.filter((creed) => creed.id !== params.creedId);
  if (remaining.length === 0) {
    const blankId = await createBlankPersonalCreed(params.actor);
    if (!blankId) {
      return {
        ok: false,
        error: "The Creed was deleted, but a replacement could not be created.",
        status: 500,
      };
    }
    await ensureCreditsHomeCreed(params.actor.id, blankId);
    return {
      ok: true,
      nextCreedId: blankId,
      createdBlankPersonal: true,
    };
  }

  const preferred = params.preferredNextCreedId
    ? remaining.find((creed) => creed.id === params.preferredNextCreedId)
    : undefined;
  const next =
    preferred ??
    remaining.find((creed) => creed.type === "personal") ??
    remaining[0];

  return {
    ok: true,
    nextCreedId: next.id,
    createdBlankPersonal: false,
  };
}
