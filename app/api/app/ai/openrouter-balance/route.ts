import { NextResponse } from "next/server";
import { fetchOpenRouterBalance, readAiSettings } from "@/lib/ai/persistence";
import { requireApiAuth } from "@/lib/api-auth";
import { decryptSecret } from "@/lib/secret-crypto";

// Live OpenRouter balance for the BYOK settings card. Only meaningful when a
// valid key is saved; returns { balance: null } otherwise (no key, or the
// OpenRouter read failed) so the card can just prompt the user to add one.

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const settings = await readAiSettings(auth.supabase, auth.user.id);
  if (!settings?.encrypted_api_key || settings.key_status !== "valid") {
    return NextResponse.json({ balance: null }, { headers: NO_STORE_HEADERS });
  }

  try {
    const balance = await fetchOpenRouterBalance(decryptSecret(settings.encrypted_api_key));
    return NextResponse.json({ balance }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({ balance: null }, { headers: NO_STORE_HEADERS });
  }
}
