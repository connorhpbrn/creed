import "server-only";

import { callOpenRouter, parseJsonObject } from "@/lib/ai/openrouter";
import { recordAiUsage } from "@/lib/ai/persistence";
import type { OnboardingState } from "@/lib/creed-data";
import type { OnboardingPreviewDraft } from "@/lib/onboarding/compile";

function buildPrompt(onboarding: OnboardingState, draft: OnboardingPreviewDraft) {
  return [
    "You are creating a starter Creed — a personal context profile (creed.md) that every AI the user talks to will read before answering them.",
    "Goal: a future AI should know the user well, instantly, with minimal follow-up. Polished, specific, current, non-generic.",
    "This is NOT an engineering operating file, NOT an agent.md, NOT a coding rulebook. It is a portrait of a person plus the rules and context any AI should respect when talking to them.",
    "This should be better than the user pasting the same notes into a generic chatbot and asking for a creed.md.",
    "Your job is deep synthesis, judgment, inference, cleanup, and structure — not light refinement.",
    "Assume the user may write messy shorthand, typos, fragments, slang, contradictions, and low-context notes. Recover the signal.",
    "You may infer stable preferences, likely routines, taste, communication defaults, and constraints from wording, selected vibe, selected tools, complaints, and life context.",
    "Infer generously when the inference would help every future AI understand the user better and is a reasonable reading of the answers.",
    "Do not invent specific facts, credentials, employers, private details, named people, dates, conditions, or commitments the user did not imply.",
    "Aggressively fix spelling, grammar, punctuation, casing, typos, repetition, and awkward phrasing.",
    "Rewrite raw wording into polished, human, specific English. Preserve underlying intent — never preserve messy syntax.",
    "Expand thin answers into substantive personal-profile content when the chosen vibe and tools give enough context.",
    "Remove filler, motivational language, generic ambition, vague excellence claims, and anything that could apply to almost anyone.",
    "Prefer specific, durable, AI-actionable phrasing. The result should read like a sharp profile a thoughtful AI would be grateful to know before replying.",
    "Optimize for AI-of-the-future-knowing-the-user, not brand voice and not onboarding politeness.",
    "Keep the same top-level Creed structure. Do not add arbitrary sections or rename keys.",
    "Fill core sections substantively. Optional sections should be filled when implied and set to null when there is genuinely no signal.",
    "",
    "Section model (10 sections — 5 always-on core, 5 optional):",
    "Core (always emit):",
    "- identityText: 2 to 4 polished sentences. Concrete role/role-frame, defining traits, values that anchor decisions, and defaults that should follow the user across every conversation. Not a bio, not a resume.",
    "- goalsText: 1 to 3 polished sentences. Live priorities the user is actively pulling on. Mix near-term outcomes with longer-horizon ambitions when both are implied. Concrete, not vague intent.",
    "- workText: 1 to 3 polished sentences. What the user does, how they like to work, and the surfaces and methods they reach for. Real and specific.",
    "- workTags: 8 to 18 short stable labels (1–3 words each). Tools, surfaces, environments the user lives in. Include selected tools and strongly implied ones. Lowercase or natural casing — no punctuation.",
    "- preferences: 5 to 8 imperative reply-style defaults. Specific do/avoid signal AI should apply by default (length, tone, formatting, follow-up behavior, hedging, praise). Each item one polished sentence ending with a period.",
    "- routines: 4 to 8 imperative items. Daily, weekly, or seasonal rhythms AI should respect when planning, scheduling, or following up. Each item one polished sentence ending with a period.",
    "",
    "Optional (emit substantively when implied; set to null only when truly no signal):",
    "- beliefsText: 2 to 4 polished sentences if implied. Stable values or worldview that should change how AI reasons or recommends. Not platitudes.",
    "- constraintsText: 2 to 4 polished sentences if implied. Hard noes, sensitive topics, and things that need explicit permission. Real lines AI should not cross.",
    "- peopleText: 2 to 4 polished sentences if implied. Named relationships AI should remember — who they are, why they matter, what to keep in mind when they come up. Use only names the user mentioned.",
    "- healthText: 2 to 4 polished sentences if implied. Conditions, sensitivities, dietary patterns, accessibility needs paired with how AI should accommodate them. Pair every fact with a behavior rule.",
    "- contextText: 2 to 4 polished sentences if implied. Durable catch-all details (location, life stage, environment, schedule context) that don't fit elsewhere.",
    "",
    "Style rules:",
    "- Use imperative phrasing for arrays (preferences, routines).",
    "- Use factual sentence phrasing for prose fields (identityText, beliefsText, goalsText, workText, constraintsText, peopleText, healthText, contextText).",
    "- Keep workTags as short labels, not sentences. Never punctuate them.",
    "- Address the AI in second-person where natural for preferences and routines (\"Lead with the answer, not preamble.\").",
    "- Never write in first person inside preferences or routines (no \"I want\", \"my\", \"me\").",
    "- Each prose field is plain text — no markdown, no headings, no bullet syntax.",
    "",
    "Inference policy:",
    "- The user filled a single Daily Context textarea. Split its content across beliefsText / constraintsText / peopleText / healthText / routines / contextText where the content actually belongs. Leave fields null when the textarea did not imply them.",
    "- Vibe (personal / builder / creative / custom) tunes vocabulary and examples, not section structure.",
    "- Tools chosen on the Tools step belong in workTags. Imply additional adjacent tools only when strongly suggested.",
    "- The 'annoyances' answer should sharpen preferences (turn complaints into do/avoid rules).",
    "- The 'communicationStyle' chips should anchor preferences tone (Direct / Collaborative / Thorough / Concise).",
    "",
    "Output rules:",
    "- Return JSON only. No markdown fences. No commentary.",
    "- Allowed keys (exact): \"identityText\", \"beliefsText\", \"goalsText\", \"workText\", \"workTags\", \"preferences\", \"constraintsText\", \"peopleText\", \"healthText\", \"routines\", \"contextText\".",
    "- Use null for optional prose fields with no signal. Do not omit keys.",
    "- For arrays with no content, return an empty array.",
    "",
    "Raw onboarding answers:",
    JSON.stringify(onboarding, null, 2),
    "",
    "Deterministic draft (your starting point — improve it, do not just echo it):",
    JSON.stringify(draft, null, 2),
  ].join("\n");
}

export async function refineOnboardingDraft({
  client,
  userId,
  apiKey,
  modelId,
  onboarding,
  draft,
  timeoutMs = 90000,
}: {
  client: unknown;
  userId: string;
  apiKey: string;
  modelId: string;
  onboarding: OnboardingState;
  draft: OnboardingPreviewDraft;
  timeoutMs?: number;
}) {
  const result = await callOpenRouter({
    apiKey,
    modelId,
    timeoutMs,
    temperature: 0.2,
    maxTokens: 5000,
    messages: [
      {
        role: "system",
        content:
          "Create a polished personal context profile (creed.md) from messy onboarding answers. Return JSON only matching the documented schema. Fix typos and formatting. Infer durable personal-profile content generously when implied. Never invent specific private facts the user did not say.",
      },
      {
        role: "user",
        content: buildPrompt(onboarding, draft),
      },
    ],
  });

  await recordAiUsage({
    client,
    userId,
    feature: "onboarding_synthesis",
    modelId,
    modelQuality: result.modelQuality,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    estimatedCostUsd: result.estimatedCostUsd,
  });

  try {
    return parseJsonObject(result.content);
  } catch {
    // Some models occasionally return prose alongside the JSON; surface a
    // useful message instead of a raw JSON.parse error to the user.
    throw new Error(
      "The model returned an unexpected response. Try generating again, or switch to a stronger model in Settings."
    );
  }
}
