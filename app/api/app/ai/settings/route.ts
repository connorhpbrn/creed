import { NextResponse } from "next/server";
import { readPublicAiSettings, upsertAiSettings } from "@/lib/ai/persistence";
import { requireApiAuth } from "@/lib/api-auth";
import { recordAuditEvent } from "@/lib/audit-log";

// The model is server-selected per feature and hidden from the user, so there
// is no model catalog in either response and no modelId in the body: this route
// only carries the credits/byok mode and the BYOK key.

export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const settings = await readPublicAiSettings(auth.supabase, auth.user.id);
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

    const settings = await upsertAiSettings({
      client: auth.supabase,
      userId: auth.user.id,
      apiKey: body.apiKey,
      clearApiKey: body.clearApiKey === true,
      aiMode: body.aiMode === "byok" || body.aiMode === "credits" ? body.aiMode : undefined,
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save AI settings." },
      { status: 400 }
    );
  }
}
