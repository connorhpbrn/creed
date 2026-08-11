import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  readPublicAiSettings,
  readSharedPublicAiSettings,
  upsertAiSettings,
} from "@/lib/ai/persistence";
import { requireApiAuth } from "@/lib/api-auth";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  resolveActiveCreed,
  resolveMemberCreedById,
} from "@/lib/creed-context";
import { setSharedByok, setSharedAiMode } from "@creed/cloud/lib/shared-admin";
import type { CreedRole } from "@creed/core/creed-permissions";

// The model is server-selected per feature and hidden from the user, so there
// is no model catalog in either response and no modelId in the body: this route
// only carries the credits/byok mode and the BYOK key.
//
// Shared-aware: Shared settings live on creed_ai_settings for that Creed.
// Reads are member-visible (public shape only); writes stay owner-only.
// Personal settings are scoped to the active (or explicitly requested) Personal
// Creed, not "the owner's oldest Personal Creed".

type SettingsTarget =
  | { kind: "shared"; creedId: string; role: CreedRole }
  | { kind: "personal"; creedId: string };

async function resolveSettingsTarget(
  client: unknown,
  user: User,
  requestedCreedId: string | null,
): Promise<SettingsTarget | null> {
  if (requestedCreedId) {
    const requested = await resolveMemberCreedById(
      client,
      user,
      requestedCreedId,
    );
    if (!requested) return null;
    if (requested.type === "shared") {
      return {
        kind: "shared",
        creedId: requested.id,
        role: requested.role,
      };
    }
    if (requested.role !== "owner") return null;
    return { kind: "personal", creedId: requested.id };
  }

  const active = await resolveActiveCreed(client, user);
  if (!active) return null;
  const entry = active.creeds.find((creed) => creed.id === active.creedId);
  if (!entry) return null;
  if (entry.type === "shared") {
    return { kind: "shared", creedId: active.creedId, role: active.role };
  }
  return { kind: "personal", creedId: active.creedId };
}

export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const requestedCreedId =
    new URL(request.url).searchParams.get("creedId")?.trim() || null;
  const target = await resolveSettingsTarget(
    auth.supabase,
    auth.user,
    requestedCreedId,
  );
  if (!target) {
    return NextResponse.json({ error: "Creed not found." }, { status: 403 });
  }

  const settings =
    target.kind === "shared"
      ? await readSharedPublicAiSettings(target.creedId)
      : await readPublicAiSettings(
          auth.supabase,
          auth.user.id,
          target.creedId,
        );
  return NextResponse.json({
    settings,
  });
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

    if (
      body.apiKey !== undefined &&
      (typeof body.apiKey !== "string" || body.apiKey.length > 500)
    ) {
      return NextResponse.json({ error: "Invalid API key." }, { status: 400 });
    }

    if (
      body.aiMode !== undefined &&
      body.aiMode !== "credits" &&
      body.aiMode !== "byok"
    ) {
      return NextResponse.json({ error: "Invalid AI mode." }, { status: 400 });
    }
    const aiMode =
      body.aiMode === "byok" || body.aiMode === "credits"
        ? body.aiMode
        : undefined;
    const requestedCreedId =
      new URL(request.url).searchParams.get("creedId")?.trim() || null;
    const target = await resolveSettingsTarget(
      auth.supabase,
      auth.user,
      requestedCreedId,
    );
    if (!target) {
      return NextResponse.json({ error: "Creed not found." }, { status: 403 });
    }

    if (target.kind === "shared") {
      if (target.role !== "owner") {
        return NextResponse.json(
          { error: "Only the owner can change AI settings." },
          { status: 403 },
        );
      }
      let result;
      if (typeof body.apiKey === "string" && body.apiKey.trim()) {
        result = await setSharedByok({
          creedId: target.creedId,
          actor: auth.user,
          key: body.apiKey,
          mode: "byok",
        });
      } else if (body.clearApiKey === true) {
        result = await setSharedByok({
          creedId: target.creedId,
          actor: auth.user,
          key: null,
          mode: "credits",
        });
      } else if (aiMode) {
        result = await setSharedAiMode({
          creedId: target.creedId,
          actor: auth.user,
          mode: aiMode,
        });
      } else {
        result = { ok: true as const };
      }
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status ?? 400 },
        );
      }
      const settings = await readSharedPublicAiSettings(target.creedId);
      return NextResponse.json({
        settings,
      });
    }

    const settings = await upsertAiSettings({
      client: auth.supabase,
      userId: auth.user.id,
      apiKey: body.apiKey,
      clearApiKey: body.clearApiKey === true,
      aiMode,
      creedId: target.creedId,
    });

    void recordAuditEvent({
      userId: auth.user.id,
      action: "ai.settings_updated",
      request,
      metadata: {
        apiKeyChanged: typeof body.apiKey === "string",
        apiKeyCleared: body.clearApiKey === true,
        aiMode: body.aiMode,
        creedId: target.creedId,
      },
    });

    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json(
      { error: "Could not save AI settings." },
      { status: 400 },
    );
  }
}
