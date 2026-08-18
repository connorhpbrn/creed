// Same-browser onboarding resume. Draft lives in localStorage keyed by user
// id so Back -> home -> Continue restores the real step and answers. Never
// grants app access: the (creed-app) entitlement gate still owns /file.

export const ONBOARDING_DRAFT_PREFIX = "creed:onboarding-draft:";
export const ONBOARDING_STARTED_CACHE_PREFIX = "creed:onboarding-started:";

export type OnboardingDraftCreedType = "personal" | "shared";

export type OnboardingDraft = {
  step: number;
  creedType: OnboardingDraftCreedType | null;
  identity: string;
  goals: string;
  preferences: string;
  updatedAt: number;
};

export function onboardingDraftKey(userId: string): string {
  return `${ONBOARDING_DRAFT_PREFIX}${userId}`;
}

export function onboardingStartedCacheKey(userId: string): string {
  return `${ONBOARDING_STARTED_CACHE_PREFIX}${userId}`;
}

export function hasLocalOnboardingProgress(draft: OnboardingDraft | null): boolean {
  if (!draft) return false;
  if (draft.step > 0) return true;
  if (draft.creedType) return true;
  return Boolean(
    draft.identity.trim() || draft.goals.trim() || draft.preferences.trim(),
  );
}

// Server stage wins when a Creed exists. Local step fills everything before
// claim, and can advance past prompt into paste when the seed is claimed but
// not yet composed. Local never jumps to preview without a server compose.
export function resolveOnboardingResumeStep(options: {
  initialStage?: "prompt" | "preview";
  localStep?: number;
  promptStep: number;
  pasteStep: number;
  previewStep: number;
}): number {
  const {
    initialStage,
    localStep,
    promptStep,
    pasteStep,
    previewStep,
  } = options;

  if (initialStage === "preview") return previewStep;

  if (initialStage === "prompt") {
    if (typeof localStep !== "number" || !Number.isFinite(localStep)) {
      return promptStep;
    }
    const capped = Math.max(promptStep, Math.min(Math.floor(localStep), pasteStep));
    return capped;
  }

  if (typeof localStep !== "number" || !Number.isFinite(localStep)) {
    return 0;
  }
  return Math.max(0, Math.min(Math.floor(localStep), previewStep));
}

export function parseOnboardingDraft(raw: string | null): OnboardingDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const step = typeof record.step === "number" ? record.step : 0;
    const creedType =
      record.creedType === "personal" || record.creedType === "shared"
        ? record.creedType
        : null;
    const identity = typeof record.identity === "string" ? record.identity : "";
    const goals = typeof record.goals === "string" ? record.goals : "";
    const preferences =
      typeof record.preferences === "string" ? record.preferences : "";
    const updatedAt =
      typeof record.updatedAt === "number" ? record.updatedAt : Date.now();
    return { step, creedType, identity, goals, preferences, updatedAt };
  } catch {
    return null;
  }
}

export function readOnboardingDraft(userId: string): OnboardingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    return parseOnboardingDraft(
      window.localStorage.getItem(onboardingDraftKey(userId)),
    );
  } catch {
    return null;
  }
}

export function writeOnboardingDraft(
  userId: string,
  draft: Omit<OnboardingDraft, "updatedAt"> & { updatedAt?: number },
): void {
  if (typeof window === "undefined") return;
  const payload: OnboardingDraft = {
    step: draft.step,
    creedType: draft.creedType,
    identity: draft.identity,
    goals: draft.goals,
    preferences: draft.preferences,
    updatedAt: draft.updatedAt ?? Date.now(),
  };
  try {
    window.localStorage.setItem(
      onboardingDraftKey(userId),
      JSON.stringify(payload),
    );
  } catch {
    // Private mode / quota: resume degrades to server-only stages.
  }
  if (hasLocalOnboardingProgress(payload)) {
    markOnboardingStarted(userId);
  }
}

export function clearOnboardingDraft(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(onboardingDraftKey(userId));
  } catch {
    // ignore
  }
}

// Flip the marketing Resume cache immediately so Continue does not wait on a
// fetch after the user has clearly started onboarding in this browser.
export function markOnboardingStarted(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(onboardingStartedCacheKey(userId), "1");
  } catch {
    // ignore
  }
}

export function clearOnboardingStartedCache(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(onboardingStartedCacheKey(userId));
  } catch {
    // ignore
  }
}
