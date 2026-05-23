import "server-only";

import type { CreedSection } from "@/lib/creed-data";
import { buildVisibleCreedMarkdown } from "@/lib/creed-data";

export const CREED_QUALITY_RUBRIC_VERSION = "2026-05-07-personal-profile-v4";

const tagVocabulary = {
  green: [
    ["Specific", "concrete details that anchor decisions"],
    ["Concrete", "names tools, files, people, defaults"],
    ["Actionable", "agents can act without follow-up"],
    ["Durable", "guidance that won't go stale fast"],
    ["Examples", "shows do/avoid examples"],
    ["Current", "live status / dates / next moves"],
  ],
  amber: [
    ["Generic", "could apply to anyone, needs nuance"],
    ["Thin", "useful but underwritten"],
    ["Surface", "needs deeper rules / tradeoffs"],
    ["Wordy", "padded, could be sharper"],
    ["Drifty", "likely to age, add stale-by signal"],
  ],
  red: [
    ["Short", "too sparse to steer agents"],
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
  "95-100: exceptional. A future AI knows the user well, instantly, with minimal follow-up. Every section is specific, current, non-generic, and grounded in real details.",
  "85-94: strong. Mostly profile-ready, but missing a few concrete examples, anchors, or up-to-date facts.",
  "70-84: useful but incomplete. Structure exists, yet AI would still need to ask for things that should be on file.",
  "50-69: thin. Some helpful facts, but too much generic language, stale context, or surface-level claims.",
  "25-49: poor. Mostly placeholders, vague self-description, or empty scaffolding. AI gets little reliable signal about the user.",
  "0-24: dangerous or misleading. Contradictory, stale, empty, or likely to make AI worse than no profile at all.",
];

const sectionStandards = [
  "Identity: concrete role, defining traits, values, defaults — what makes this person distinct. Not a bio.",
  "Beliefs: stable values or worldview that change how AI should reason or recommend. Not platitudes.",
  "Goals: live priorities (near-term + long-horizon) with stale-by hints when useful. Concrete, not vague intentions.",
  "Work: profession, craft, tools/stack, and how the user likes to work. Real surfaces and methods.",
  "Preferences: specific reply-style defaults with concrete do/avoid signal. Not generic 'be helpful'.",
  "Constraints: explicit lines AI should not cross — hard noes, sensitive topics, things that need permission.",
  "People: named relationships, role, why they matter, what AI should remember when they come up.",
  "Health: conditions, sensitivities, dietary patterns, accessibility needs — paired with how AI should accommodate them.",
  "Routines: daily/weekly/seasonal rhythms AI should respect when planning, scheduling, or following up.",
  "Context: durable catch-all details (location, life stage, environment) that don't fit elsewhere.",
];

const strictPenalties = [
  "Never give a high score just for having all headings present.",
  "Penalise generic personality claims, motivational language, and placeholder text heavily.",
  "Penalise stale routines, abandoned goals, or facts that contradict each other.",
  "Penalise sections that describe the user but don't actually change how AI should reply or behave.",
  "Penalise vague phrases like 'thoughtful', 'driven', 'curious', 'authentic' unless grounded in a concrete example.",
  "A section should rarely score above 80 without concrete details, anchors, or examples specific to this user.",
  "Overall score should rarely exceed the weakest core section (Identity, Goals, Work, Preferences, Routines) by more than 12 points.",
  "A profile with empty or near-empty core sections should almost never score above 74 overall.",
  "Optional sections (Beliefs, Constraints, People, Health, Context) only count when they exist — don't penalise their absence, but penalise their presence if they're empty filler.",
];

export function buildQualityPrompt(sections: CreedSection[]) {
  return [
    `Rubric version: ${CREED_QUALITY_RUBRIC_VERSION}`,
    "You are a strict evaluator of creed.md files.",
    "creed.md is a personal context profile that every AI reads before talking to its owner.",
    "Your job is to judge how well this profile lets a fresh AI know its owner. Be demanding.",
    "",
    "What a high-scoring profile must do:",
    "- Give AI a clear, current picture of who the user is and what matters to them right now.",
    "- Anchor every claim in concrete details, examples, names, dates, or specific defaults.",
    "- Capture preferences, constraints, routines, people, and health/accessibility needs that change how AI should reply.",
    "- Stay focused on durable facts about the user — not transcripts, recap, or moods of the day.",
    "",
    "Score bands:",
    ...strictScoreBands.map((item) => `- ${item}`),
    "",
    "Section standards:",
    ...sectionStandards.map((item) => `- ${item}`),
    "",
    "Strict penalties:",
    ...strictPenalties.map((item) => `- ${item}`),
    "",
    "Tag vocabulary (this is a closed set — pick zero to three per section, only from this list, mixing tones honestly):",
    "GREEN tags (celebrate):",
    ...tagVocabulary.green.map(([tag, hint]) => `- ${tag} — ${hint}`),
    "AMBER tags (caution / room to improve):",
    ...tagVocabulary.amber.map(([tag, hint]) => `- ${tag} — ${hint}`),
    "RED tags (actively hurt agent usefulness):",
    ...tagVocabulary.red.map(([tag, hint]) => `- ${tag} — ${hint}`),
    "",
    "Output rules:",
    "- Return JSON only. No markdown.",
    "- Per section: include 0–3 tags drawn ONLY from the vocabulary above. Skip tags entirely if nothing fits.",
    "- A weak section should usually carry 1–2 red/amber tags; an excellent section can be tag-less or only green.",
    "- `strength` is the single most-important thing this section gives agents. Omit (set null) if nothing is genuinely strong.",
    "- `gap` is the single most-important missing or weak signal. Omit (null) if nothing meaningful to fix.",
    "- Each note has a `title` (2–5 words, sentence case, no trailing period) and a `detail` (one sentence, ≤22 words, specific to THIS Creed — never templated).",
    "- Keep `focus` as one crisp action sentence.",
    "- Strengths/gaps arrays may stay (≤3 each) for completeness but the UI uses `strength` and `gap` first.",
    "- Generated prose should be specific to this Creed, not templated.",
    "",
    "JSON shape:",
    JSON.stringify(
      {
        overall: {
          score: 64,
          summary: "Strict one-line judgment.",
          tags: ["Generic", "Thin"],
          strength: {
            title: "Clear daily routines",
            detail: "Specifies wake/sleep windows, deep-work mornings, and weekly cadences so AI can plan around them.",
          },
          gap: {
            title: "Goals stuck in vague mode",
            detail: "Goals are aspirational but lack concrete outcomes or stale-by signals so AI can't pull on them.",
          },
          strengths: ["Concrete routines"],
          gaps: ["Vague goals", "Empty Preferences"],
          focus: ["Sharpen Goals with one concrete near-term outcome and a stale-by hint."],
        },
        sections: [
          {
            sectionId: "identity",
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
            reasons: ["Useful but vague"],
            strengths: ["Clear role"],
            gaps: ["No defining traits"],
            missingContext: ["Concrete examples of taste"],
            focus: "Add one or two values or defaults AI should anchor every reply on.",
          },
        ],
      },
      null,
      2
    ),
    "",
    "Visible markdown:",
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
