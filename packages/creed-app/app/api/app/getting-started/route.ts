import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { resolveMemberCreedById } from "@/lib/creed-context";
import { log } from "@/lib/observability";
import {
  GETTING_STARTED_STEPS,
  type GettingStartedStepKey,
} from "@creed/core/creed-data";

const STEP_KEYS = new Set<string>(GETTING_STARTED_STEPS.map((s) => s.key));

// Marks getting-started steps done (or dismisses the card) for one Creed.
// Steps only ever flip false -> true, so concurrent calls merge safely.
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const creedId =
    typeof (body as { creedId?: unknown }).creedId === "string"
      ? (body as { creedId: string }).creedId
      : null;
  if (!creedId) {
    return NextResponse.json({ error: "creedId is required." }, { status: 400 });
  }

  const membership = await resolveMemberCreedById(
    auth.supabase,
    auth.user,
    creedId,
  );
  if (!membership) {
    return NextResponse.json({ error: "Creed not found." }, { status: 404 });
  }

  const dismiss = (body as { dismiss?: unknown }).dismiss === true;
  const rawSteps = Array.isArray((body as { steps?: unknown }).steps)
    ? ((body as { steps: unknown[] }).steps as unknown[])
    : [];
  const steps = rawSteps.filter(
    (step): step is GettingStartedStepKey =>
      typeof step === "string" && STEP_KEYS.has(step),
  );

  if (!dismiss && steps.length === 0) {
    return NextResponse.json(
      { error: "steps must be a non-empty array, or pass dismiss: true." },
      { status: 400 },
    );
  }

  try {
    const existingResult = await auth.supabase
      .from("creed_getting_started")
      .select("steps, completed_at, dismissed_at")
      .eq("user_id", auth.user.id)
      .eq("creed_id", creedId)
      .maybeSingle();
    if (existingResult.error) throw existingResult.error;

    const existing = existingResult.data as {
      steps: Record<string, boolean>;
      completed_at: string | null;
      dismissed_at: string | null;
    } | null;

    const merged: Record<string, boolean> = { ...(existing?.steps ?? {}) };
    for (const step of steps) merged[step] = true;

    const allDone = GETTING_STARTED_STEPS.every(({ key }) => merged[key]);
    const completedAt =
      existing?.completed_at ?? (allDone ? new Date().toISOString() : null);
    const dismissedAt = dismiss
      ? (existing?.dismissed_at ?? new Date().toISOString())
      : (existing?.dismissed_at ?? null);

    const upsertResult = await auth.supabase
      .from("creed_getting_started")
      .upsert(
        {
          user_id: auth.user.id,
          creed_id: creedId,
          steps: merged,
          completed_at: completedAt,
          dismissed_at: dismissedAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,creed_id" },
      );
    if (upsertResult.error) throw upsertResult.error;

    return NextResponse.json({
      gettingStarted: {
        steps: merged,
        completedAt,
        dismissedAt,
      },
    });
  } catch (error) {
    log.error(
      "getting_started_save_failed",
      { userId: auth.user.id, creedId },
      error instanceof Error ? error : new Error(String(error)),
    );
    return NextResponse.json(
      { error: "Could not save progress." },
      { status: 500 },
    );
  }
}
