import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/http-headers";
import type { User } from "@supabase/supabase-js";
import { fetchOpenRouterBalance, readAiSettings } from "@/lib/ai/persistence";
import { requireApiAuth } from "@/lib/api-auth";
import { resolveMemberSharedCreed } from "@/lib/creed-context";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import { decryptSecret } from "@creed/integrations/secret-crypto";

// Live OpenRouter balance for the BYOK settings card. Only meaningful when a
// valid key is saved; returns { balance: null } otherwise (no key, or the
// OpenRouter read failed) so the card can just prompt the user to add one.
// Shared-aware: the shared BYOK balance is owner-scoped info (like the rest of
// billing), so only the owner sees it - non-owner members get { balance: null }.
// The key itself is never exposed either way.


async function resolveByokKey(client: unknown, user: User): Promise<string | null> {
  const shared = await resolveMemberSharedCreed(client, user);
  if (shared) {
    if (shared.role !== "owner") return null;
    const sharedId = shared.creedId;
    const admin = getSupabaseAdminClient() as unknown as {
      from: (t: string) => { select: (c: string) => { eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: { encrypted_api_key?: string | null; key_status?: string } | null }> } } };
    };
    const { data } = await admin
      .from("creed_ai_settings")
      .select("encrypted_api_key, key_status")
      .eq("creed_id", sharedId)
      .maybeSingle();
    if (!data?.encrypted_api_key || data.key_status !== "valid") return null;
    return decryptSecret(data.encrypted_api_key);
  }

  const settings = await readAiSettings(client, user.id);
  if (!settings?.encrypted_api_key || settings.key_status !== "valid") return null;
  return decryptSecret(settings.encrypted_api_key);
}

export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const key = await resolveByokKey(auth.supabase, auth.user);
  if (!key) {
    return NextResponse.json({ balance: null }, { headers: NO_STORE_HEADERS });
  }

  try {
    const balance = await fetchOpenRouterBalance(key);
    return NextResponse.json({ balance }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({ balance: null }, { headers: NO_STORE_HEADERS });
  }
}
