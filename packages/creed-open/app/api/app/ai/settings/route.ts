import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { readPublicAiSettings, upsertAiSettings } from "@/lib/ai/persistence";
import { requireApiAuth } from "@/lib/api-auth";
import { recordAuditEvent } from "@/lib/audit-log";
import { resolveActiveCreed, resolveMemberCreedById } from "@/lib/creed-context";

async function resolvePersonalCreedId(
  client: unknown,
  user: User,
  requestedCreedId: string | null,
): Promise<string | null> {
  if (requestedCreedId) {
    const requested = await resolveMemberCreedById(client, user, requestedCreedId);
    return requested?.type === "personal" && requested.role === "owner"
      ? requested.id
      : null;
  }
  const active = await resolveActiveCreed(client, user);
  const entry = active?.creeds.find((creed) => creed.id === active.creedId);
  return entry?.type === "personal" ? entry.id : null;
}

export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const creedId = await resolvePersonalCreedId(
    auth.supabase,
    auth.user,
    new URL(request.url).searchParams.get("creedId")?.trim() || null,
  );
  if (!creedId) {
    return NextResponse.json({ error: "Creed not found." }, { status: 403 });
  }
  const settings = await readPublicAiSettings(auth.supabase, auth.user.id, creedId);
  return NextResponse.json({ settings: { ...settings, aiMode: "byok" } });
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
    if (body.aiMode !== undefined && body.aiMode !== "byok") {
      return NextResponse.json(
        { error: "Creed Open uses your OpenRouter API key." },
        { status: 400 },
      );
    }

    const creedId = await resolvePersonalCreedId(
      auth.supabase,
      auth.user,
      new URL(request.url).searchParams.get("creedId")?.trim() || null,
    );
    if (!creedId) {
      return NextResponse.json({ error: "Creed not found." }, { status: 403 });
    }

    const settings = await upsertAiSettings({
      client: auth.supabase,
      userId: auth.user.id,
      apiKey: body.apiKey,
      clearApiKey: body.clearApiKey === true,
      aiMode: "byok",
      creedId,
    });
    void recordAuditEvent({
      userId: auth.user.id,
      action: "ai.settings_updated",
      request,
      metadata: {
        apiKeyChanged: typeof body.apiKey === "string",
        apiKeyCleared: body.clearApiKey === true,
        aiMode: "byok",
        creedId,
      },
    });
    return NextResponse.json({ settings: { ...settings, aiMode: "byok" } });
  } catch {
    return NextResponse.json({ error: "Could not save AI settings." }, { status: 400 });
  }
}
