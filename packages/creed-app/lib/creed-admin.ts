import "server-only";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";
import { getCreedRole } from "@/lib/creed-membership";

export type CreedAdminResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/** Update Creed identity fields for an owner or, in Cloud, a Shared admin. */
export async function updateCreedGeneral(params: {
  creedId: string;
  actor: User;
  name?: string;
  avatarUrl?: string;
}): Promise<CreedAdminResult> {
  const db = getSupabaseAdminClient() as unknown as SupabaseLikeClient;
  const actorRole = await getCreedRole(db, params.actor.id, params.creedId);
  if (actorRole !== "owner" && actorRole !== "admin") {
    return {
      ok: false,
      error: "Only an owner or admin can update Creed settings.",
      status: 403,
    };
  }
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (params.name !== undefined) {
    const name = params.name.trim();
    if (!name) return { ok: false, error: "Name is required.", status: 400 };
    patch.name = name;
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
    return { ok: false, error: "Could not update Creed settings.", status: 500 };
  }
  return { ok: true };
}
