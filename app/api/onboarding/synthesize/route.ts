import { NextResponse } from "next/server";
import { getUserOpenRouterCredential } from "@/lib/ai/persistence";
import type { OnboardingState } from "@/lib/creed-data";
import type { OnboardingPreviewDraft } from "@/lib/onboarding/compile";
import { refineOnboardingDraft } from "@/lib/onboarding/refine";
import { validateRefinedDraft } from "@/lib/onboarding/validate";
import { requireApiAuth } from "@/lib/api-auth";

// Allow the synthesizer enough budget to complete even when the client
// disconnects mid-call (e.g., user switches apps or tabs while waiting).
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as {
      onboarding?: OnboardingState;
      draft?: OnboardingPreviewDraft;
    };

    if (!body?.onboarding || !body?.draft) {
      return NextResponse.json({ refinement: null }, { status: 400 });
    }

    const credential = await getUserOpenRouterCredential(auth.supabase, auth.user.id);
    const refinement = await refineOnboardingDraft({
      client: auth.supabase,
      userId: auth.user.id,
      apiKey: credential.apiKey,
      modelId: credential.modelId,
      onboarding: body.onboarding,
      draft: body.draft,
    });

    if (!refinement) {
      return NextResponse.json({ refinement: null });
    }

    return NextResponse.json({
      refinement: validateRefinedDraft(refinement, body.draft),
    });
  } catch (error) {
    return NextResponse.json(
      { refinement: null, error: error instanceof Error ? error.message : "Could not generate Creed." },
      { status: 400 }
    );
  }
}
