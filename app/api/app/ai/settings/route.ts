import { NextResponse } from "next/server";
import { readPublicAiSettings, readCompanyPublicAiSettings, upsertAiSettings } from "@/lib/ai/persistence";
import { requireApiAuth } from "@/lib/api-auth";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  resolveOwnedCompanyCreedId,
  resolveMemberCompanyCreed,
  resolveMemberCompanyCreedById,
} from "@/lib/creed-context";
import { setCompanyByok, setCompanyAiMode } from "@/lib/company-admin";

// The model is server-selected per feature and hidden from the user, so there
// is no model catalog in either response and no modelId in the body: this route
// only carries the credits/byok mode and the BYOK key.
//
// Company-aware: when the active Creed is a company, the settings live on the
// company (creed_company_ai_settings). Reads are member-visible (the public
// shape carries only mode + key status, never the key); writes stay owner-only.
// Personal Creeds keep the exact user-scoped behaviour.

export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  // `?creedId=` pins the read to that company (validated), so the company card
  // loads its own mode/key-status regardless of the active-Creed cookie.
  const requestedCreedId = new URL(request.url).searchParams.get("creedId")?.trim();
  const company = requestedCreedId
    ? await resolveMemberCompanyCreedById(auth.supabase, auth.user, requestedCreedId)
    : await resolveMemberCompanyCreed(auth.supabase, auth.user);
  const settings = company
    ? await readCompanyPublicAiSettings(company.creedId)
    : await readPublicAiSettings(auth.supabase, auth.user.id);
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as {
      apiKey?: string;
      clearApiKey?: boolean;
      aiMode?: string;
    };

    if (body.apiKey !== undefined && (typeof body.apiKey !== "string" || body.apiKey.length > 500)) {
      return NextResponse.json({ error: "Invalid API key." }, { status: 400 });
    }

    if (body.aiMode !== undefined && body.aiMode !== "credits" && body.aiMode !== "byok") {
      return NextResponse.json({ error: "Invalid AI mode." }, { status: 400 });
    }
    const aiMode = body.aiMode === "byok" || body.aiMode === "credits" ? body.aiMode : undefined;

    // Resolve the company to write to from the SAME source the GET reads from -
    // an explicit `?creedId=` when present (validated for ownership), else the
    // active-Creed cookie. This keeps read and write pointed at one company
    // instead of a latent cookie-vs-query mismatch. A non-owner passing a
    // company id is rejected rather than silently writing personal settings.
    const requestedCreedId = new URL(request.url).searchParams.get("creedId")?.trim();
    let companyId: string | null;
    if (requestedCreedId) {
      const match = await resolveMemberCompanyCreedById(auth.supabase, auth.user, requestedCreedId);
      if (!match) {
        return NextResponse.json({ error: "Not a company you belong to." }, { status: 403 });
      }
      if (match.role !== "owner") {
        return NextResponse.json({ error: "Only the owner can change AI settings." }, { status: 403 });
      }
      companyId = match.creedId;
    } else {
      companyId = await resolveOwnedCompanyCreedId(auth.supabase, auth.user);
    }
    if (companyId) {
      // Company: write to the company AI settings. Setting a key implies BYOK,
      // clearing implies credits, and a lone mode change preserves the key.
      let result;
      if (typeof body.apiKey === "string" && body.apiKey.trim()) {
        result = await setCompanyByok({ creedId: companyId, actor: auth.user, key: body.apiKey, mode: "byok" });
      } else if (body.clearApiKey === true) {
        result = await setCompanyByok({ creedId: companyId, actor: auth.user, key: null, mode: "credits" });
      } else if (aiMode) {
        result = await setCompanyAiMode({ creedId: companyId, actor: auth.user, mode: aiMode });
      } else {
        result = { ok: true as const };
      }
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
      }
      return NextResponse.json({ settings: await readCompanyPublicAiSettings(companyId) });
    }

    const settings = await upsertAiSettings({
      client: auth.supabase,
      userId: auth.user.id,
      apiKey: body.apiKey,
      clearApiKey: body.clearApiKey === true,
      aiMode,
    });

    void recordAuditEvent({
      userId: auth.user.id,
      action: "ai.settings_updated",
      request,
      metadata: {
        apiKeyChanged: typeof body.apiKey === "string",
        apiKeyCleared: body.clearApiKey === true,
        aiMode: body.aiMode,
      },
    });

    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json(
      { error: "Could not save AI settings." },
      { status: 400 }
    );
  }
}
