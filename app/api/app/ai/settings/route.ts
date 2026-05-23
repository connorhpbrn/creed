import { NextResponse } from "next/server";
import { getOpenRouterModelCatalog } from "@/lib/ai/model-catalog";
import { readPublicAiSettings, upsertAiSettings } from "@/lib/ai/persistence";
import { requireApiAuth } from "@/lib/api-auth";
import { recordAuditEvent } from "@/lib/audit-log";

export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const [settings, models] = await Promise.all([
    readPublicAiSettings(auth.supabase, auth.user.id),
    getOpenRouterModelCatalog(),
  ]);
  return NextResponse.json({ settings, models });
}

export async function PUT(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as {
      apiKey?: string;
      modelId?: string;
      clearApiKey?: boolean;
    };

    if (!body.modelId || typeof body.modelId !== "string" || body.modelId.length > 200) {
      return NextResponse.json({ error: "Choose a model." }, { status: 400 });
    }

    if (body.apiKey !== undefined && (typeof body.apiKey !== "string" || body.apiKey.length > 500)) {
      return NextResponse.json({ error: "Invalid API key." }, { status: 400 });
    }

    const settings = await upsertAiSettings({
      client: auth.supabase,
      userId: auth.user.id,
      modelId: body.modelId,
      apiKey: body.apiKey,
      clearApiKey: body.clearApiKey === true,
    });

    void recordAuditEvent({
      userId: auth.user.id,
      action: "ai.settings_updated",
      request,
      metadata: {
        modelId: body.modelId,
        apiKeyChanged: typeof body.apiKey === "string",
        apiKeyCleared: body.clearApiKey === true,
      },
    });

    const models = await getOpenRouterModelCatalog();
    return NextResponse.json({ settings, models });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save AI settings." },
      { status: 400 }
    );
  }
}
