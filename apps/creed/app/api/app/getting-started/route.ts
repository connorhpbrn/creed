import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { log } from "@/lib/observability";
import {
  GETTING_STARTED_STEPS,
  type GettingStartedStepKey,
} from "@/lib/creed-data";

const STEP_KEYS = new Set<string>(GETTING_STARTED_STEPS.map((s) => s.key));

// Marks getting-started steps done. Steps only ever flip false -> true, so
// concurrent calls (two tabs, a seed racing a click) merge safely. At most a
// handful of writes per user, ever.
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawSteps =
    body && typeof body === "object" && Array.isArray((body as { steps?: unknown }).steps)
      ? ((body as { steps: unknown[] }).steps as unknown[])
      : null;
  if (!rawSteps) {
    return NextResponse.json(
      { error: "steps must be an array of step keys" },
      { status: 400 },
    );
  }
  const steps = rawSteps.filter(
    (step): step is GettingStartedStepKey =>
      typeof step === "string" && STEP_KEYS.has(step),
  );

  try {
    const existingResult = await auth.supabase
      .from("creed_getting_started")
      .select("steps, completed_at")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (existingResult.error) throw existingResult.error;

    const existing = existingResult.data as {
      steps: Record<string, boolean>;
      completed_at: string | null;
    } | null;

    const merged: Record<string, boolean> = { ...(existing?.steps ?? {}) };
    for (const step of steps) merged[step] = true;

    const allDone = GETTING_STARTED_STEPS.every(({ key }) => merged[key]);
    const completedAt =
      existing?.completed_at ?? (allDone ? new Date().toISOString() : null);

    const upsertResult = await auth.supabase
      .from("creed_getting_started")
      .upsert(
        {
          user_id: auth.user.id,
          steps: merged,
          completed_at: completedAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (upsertResult.error) throw upsertResult.error;

    return NextResponse.json({
      gettingStarted: { steps: merged, completedAt },
    });
  } catch (error) {
    log.error(
      "getting_started_save_failed",
      { userId: auth.user.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return NextResponse.json(
      { error: "Could not save progress." },
      { status: 500 },
    );
  }
}
