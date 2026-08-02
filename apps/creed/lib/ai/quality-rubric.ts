import "server-only";

import type { CreedSection } from "@/lib/creed-data";
import { buildVisibleCreedMarkdown } from "@/lib/creed-data";

export const CREED_QUALITY_RUBRIC_VERSION = "2026-06-10-personal-profile-v5";

// Score bands, coarsest-to-finest. The model picks a band first, then a number
// inside it (band-then-number) so a one-point wobble stays inside the band. The
// final number is pinned to the visible evidence (tags + gap) in
// `lib/ai/quality.ts`; these ranges are what the model aims for, and they line
// up with that evidence ladder.
export const QUALITY_SCORE_BANDS = [
  { key: "exceptional", min: 90, max: 100 },
  { key: "strong", min: 78, max: 89 },
  { key: "useful", min: 62, max: 77 },
  { key: "thin", min: 40, max: 61 },
  { key: "poor", min: 18, max: 39 },
  { key: "risky", min: 0, max: 17 },
] as const;

const tagVocabulary = {
  green: [
    ["Specific", "concrete details that anchor decisions"],
    ["Concrete", "names tools, files, people, defaults"],
    ["Actionable", "agents can act without follow-up"],
    ["Durable", "guidance that won't go stale fast"],
    ["Examples", "shows do/avoid examples"],
    ["Current", "live status / dates / next moves"],
    ["Tight", "lean and curated, no padding"],
  ],
  amber: [
    ["Generic", "could apply to anyone, needs nuance"],
    ["Thin", "useful but underwritten"],
    ["Surface", "needs deeper rules / tradeoffs"],
    ["Wordy", "padded, could be sharper"],
    ["Drifty", "likely to age, add stale-by signal"],
  ],
  red: [
    ["Bloated", "too long / unfocused"],
    ["Vague", "language without anchor"],
    ["Empty", "placeholder or no real signal"],
    ["Context", "missing critical context for decisions"],
    ["Stale", "contains outdated or contradictory info"],
    ["Off-topic", "content does not fit section purpose"],
    ["No examples", "claims without examples"],
    ["Contradiction", "internal contradictions"],
  ],
} as const;

const strictScoreBands = [
  "exceptional (90-100): nothing is holding it back - specific, anchored, current, tight, and it clearly changes how AI replies.",
  "strong (78-89): well-anchored and useful, with one real gap or a touch of generic language.",
  "useful (62-77): real signal, but a broken best practice (vague, no examples, stale) is dragging it.",
  "thin (40-61): mostly generic or underwritten; little the AI can actually act on.",
  "poor (18-39): placeholder or empty scaffolding.",
  "risky (0-17): contradictory or stale enough to make AI worse than no profile at all.",
];

const sectionStandards = [
  "Identity: concrete role, defining traits, values, defaults - what makes this person distinct. Not a bio.",
  "Beliefs: stable values or worldview that change how AI should reason or recommend. Not platitudes.",
  "Goals: live priorities (near-term + long-horizon) with stale-by hints when useful. Concrete, not vague intentions.",
  "Work: profession, craft, tools/stack, and how the user likes to work. Real surfaces and methods.",
  "Preferences: specific reply-style defaults with concrete do/avoid signal. Not generic 'be helpful'.",
  "Constraints: explicit lines AI should not cross - hard noes, sensitive topics, things that need permission.",
  "People: named relationships, role, why they matter, what AI should remember when they come up.",
  "Health: conditions, sensitivities, dietary patterns, accessibility needs - paired with how AI should accommodate them.",
  "Routines: daily/weekly/seasonal rhythms AI should respect when planning, scheduling, or following up.",
  "Context: durable catch-all details (location, life stage, environment) that don't fit elsewhere.",
];

// The whole basis. Every section, core or custom, is judged on these five and
// nothing else. We score how context is written, never what it is about.
const bestPractices = [
  "Specific: names real things (tools, people, numbers, dates, defaults), not language anyone could have written.",
  "Anchored: claims come with an example, a rule, or a consequence, so AI knows how to act - not just what is true.",
  "Steering: it would actually change how AI replies. This is the most important test.",
  "Current: nothing stale, abandoned, or self-contradicting.",
  "Tight: no padding or repetition - every line earns its place.",
];

const scoringRules = [
  "Judge craft, not subject. Any topic is welcome - never penalise a section for being niche, personal, or unusual. A section about LEGO is held to the exact same bar as one about work.",
  "Never reward headings just for being present. An empty or filler section scores low even when every section exists.",
  "Penalise generic personality claims and motivational language ('thoughtful', 'driven', 'curious', 'authentic') unless grounded in a concrete example.",
  "Penalise stale routines, abandoned goals, and facts that contradict each other.",
  "Penalise content that describes the user but would not change a single AI reply.",
  "A section reaches the top band only when no best practice is broken and nothing meaningful is left to fix.",
  "Optional sections only count once filled - never penalise their absence, but penalise hollow filler when present.",
  "Custom sections set their own purpose; judge them on it. They can never be 'off-topic'.",
];

export type QualityScope = "personal" | "company";

export function qualitySubject(scope: QualityScope) {
  return scope === "company"
    ? {
        noun: "shared company context file",
        owner: "company team",
        purpose:
          "lets a fresh AI understand the company, its people, work, clients, tools, operating rules, and collaboration defaults",
      }
    : {
        noun: "personal context profile",
        owner: "owner",
        purpose: "lets a fresh AI know its owner",
      };
}

export function buildQualityPrompt(
  sections: CreedSection[],
  targetSectionIds: string[],
  scope: QualityScope = "personal",
) {
  const targetSet = new Set(targetSectionIds);
  const targets = sections.filter((section) => targetSet.has(section.id));
  const bandKeys = QUALITY_SCORE_BANDS.map((band) => band.key).join(", ");
  const subject = qualitySubject(scope);

  return [
    `Rubric version: ${CREED_QUALITY_RUBRIC_VERSION}`,
    "You are a strict evaluator of creed.md files.",
    `creed.md is a ${subject.noun} that every AI reads before talking to its ${subject.owner}.`,
    `Your job is to judge how well this file ${subject.purpose}. Be demanding and consistent: the same content must always earn the same score.`,
    "",
    "The five best practices (this is the whole basis - judge every section on these, and nothing else):",
    ...bestPractices.map((item) => `- ${item}`),
    "",
    "Score bands:",
    ...strictScoreBands.map((item) => `- ${item}`),
    "",
    "Section standards (what 'real signal' looks like per section - not a list of required topics):",
    ...sectionStandards.map((item) => `- ${item}`),
    "",
    "Scoring rules:",
    ...scoringRules.map((item) => `- ${item}`),
    "",
    "Tag vocabulary (this is a closed set - pick zero to three per section, only from this list, mixing tones honestly):",
    "GREEN tags (celebrate):",
    ...tagVocabulary.green.map(([tag, hint]) => `- ${tag} - ${hint}`),
    "AMBER tags (caution / room to improve):",
    ...tagVocabulary.amber.map(([tag, hint]) => `- ${tag} - ${hint}`),
    "RED tags (actively hurt agent usefulness):",
    ...tagVocabulary.red.map(([tag, hint]) => `- ${tag} - ${hint}`),
    "",
    "Sections to score this run (return exactly one object in `sections` for each of these, and only these):",
    ...targets.map((section) => `- ${section.name} (${section.id})`),
    "Read every other section as context for contradictions and the overall judgment, but do not return a score object for any section not listed above.",
    "",
    "Output rules:",
    "- Return JSON only. No markdown.",
    `- For each scored section, first pick its band (one of: ${bandKeys}), then choose a \`score\` integer that sits inside that band's range. Band and score must agree.`,
    "- Per section: include 0–3 tags drawn ONLY from the vocabulary above. Skip tags entirely if nothing fits.",
    "- A weak section should usually carry 1–2 red/amber tags; an excellent section can be tag-less or only green.",
    "- `strength` is the single most-important thing this section gives agents. Omit (set null) if nothing is genuinely strong.",
    "- `gap` is the one thing keeping this section from full marks. It is REQUIRED for any score below 90. Only a genuinely flawless section (90+) may set it null.",
    "- Each note has a `title` (2–5 words, sentence case, no trailing period) and a `detail` (one sentence, ≤22 words, specific to THIS Creed - never templated).",
    "- Keep `focus` as one crisp action sentence.",
    "- `overall` judges the WHOLE profile (every section, not only the ones scored this run). Do not return an overall score - it is computed from the section scores.",
    "- Generated prose should be specific to this Creed, not templated.",
    "",
    "JSON shape:",
    JSON.stringify(
      {
        overall: {
          summary: "Strict one-line judgment of the whole profile.",
          tags: ["Generic", "Thin"],
          strength: {
            title: "Clear daily routines",
            detail: "Specifies wake/sleep windows, deep-work mornings, and weekly cadences so AI can plan around them.",
          },
          gap: {
            title: "Goals stuck in vague mode",
            detail: "Goals are aspirational but lack concrete outcomes or stale-by signals so AI can't pull on them.",
          },
        },
        sections: [
          {
            sectionId: "identity",
            band: "thin",
            score: 58,
            tags: ["Vague", "No examples"],
            strength: {
              title: "Names the role",
              detail: "Says what the user does and where their work happens so AI has a starting frame.",
            },
            gap: {
              title: "Missing defining traits",
              detail: "Describes the user without showing the values or defaults that should change AI replies.",
            },
            focus: "Add one or two values or defaults AI should anchor every reply on.",
          },
        ],
      },
      null,
      2
    ),
    "",
    "Visible markdown (the full profile, for context):",
    buildVisibleCreedMarkdown(sections),
    "",
    "Section ids and names:",
    JSON.stringify(
      sections.map((section) => ({ id: section.id, name: section.name, kind: section.kind })),
      null,
      2
    ),
  ].join("\n");
}

// The response_format passed to OpenRouter so the model must return a
// schema-valid object. This is what stops dropped sections, truncated JSON,
// and shape drift - the three things that made the old free-form parse flaky.
export function buildQualityResponseFormat(): Record<string, unknown> {
  const note = {
    type: ["object", "null"],
    properties: {
      title: { type: "string" },
      detail: { type: "string" },
    },
    required: ["title", "detail"],
    additionalProperties: false,
  };

  return {
    type: "json_schema",
    json_schema: {
      name: "creed_quality_report",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["overall", "sections"],
        properties: {
          overall: {
            type: "object",
            additionalProperties: false,
            required: ["summary", "tags", "strength", "gap"],
            properties: {
              summary: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              strength: note,
              gap: note,
            },
          },
          sections: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["sectionId", "band", "score", "tags", "strength", "gap", "focus"],
              properties: {
                sectionId: { type: "string" },
                band: { type: "string", enum: QUALITY_SCORE_BANDS.map((band) => band.key) },
                score: { type: "integer" },
                tags: { type: "array", items: { type: "string" } },
                strength: note,
                gap: note,
                focus: { type: "string" },
              },
            },
          },
        },
      },
    },
  };
}
