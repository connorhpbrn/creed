import {
  BELIEFS_SECTION_ID,
  CONSTRAINTS_SECTION_ID,
  CONTEXT_SECTION_ID,
  GOALS_SECTION_ID,
  HEALTH_SECTION_ID,
  IDENTITY_SECTION_ID,
  PEOPLE_SECTION_ID,
  PREFERENCES_SECTION_ID,
  ROUTINES_SECTION_ID,
  WORK_SECTION_ID,
  type CreedSection,
  type OnboardingState,
} from "@/lib/creed-data";

export const CREED_TYPE_OPTIONS = [
  "personal",
  "builder",
  "creative",
  "custom",
] as const satisfies OnboardingState["creedType"][];

export type CreedTypeDefinition = {
  id: OnboardingState["creedType"];
  label: string;
  description: string;
  startTitle: string;
  startSubtitle: string;
  defaultsTitle: string;
  defaultsSubtitle: string;
  projectTitle: string;
  projectSubtitle: string;
  generatingTitle: string;
  generatingSubtitle: string;
  // Identity step
  roleLabel: string;
  rolePlaceholder: string;
  alwaysKnowLabel: string;
  alwaysKnowPlaceholder: string;
  // Goals + Work step
  goalsLabel: string;
  goalsPlaceholder: string;
  workLabel: string;
  workPlaceholder: string;
  toolsTitle: string;
  toolsSubtitle: string;
  toolsGroups: Record<string, readonly string[]>;
};

export type OnboardingPreviewDraft = {
  identityText: string;
  // Optional sections — null means "skip this section in the starter file".
  beliefsText: string | null;
  goalsText: string;
  workText: string;
  workTags: string[];
  preferences: string[];
  constraintsText: string | null;
  peopleText: string | null;
  healthText: string | null;
  routines: string[];
  contextText: string | null;
};

export type OnboardingRefinement = Partial<{
  identityText: string;
  beliefsText: string | null;
  goalsText: string;
  workText: string;
  workTags: string[];
  preferences: string[];
  constraintsText: string | null;
  peopleText: string | null;
  healthText: string | null;
  routines: string[];
  contextText: string | null;
}>;

export const CREED_TYPE_DEFINITIONS: Record<OnboardingState["creedType"], CreedTypeDefinition> = {
  personal: {
    id: "personal",
    label: "Personal",
    description: "A general profile capturing who you are across life and work.",
    startTitle: "Tell Creed about you.",
    startSubtitle: "The more accurate this is, the smarter every AI you talk to becomes.",
    defaultsTitle: "How do you want AI to act?",
    defaultsSubtitle: "Set the defaults every AI should pick up before replying.",
    projectTitle: "Day-to-day context.",
    projectSubtitle: "Routines, people, and details AI should know about your life.",
    generatingTitle: "Building your personal profile.",
    generatingSubtitle: "Turning your answers into a profile any AI can read in seconds.",
    roleLabel: "How would you describe yourself?",
    rolePlaceholder: "e.g. Curious generalist, balancing creative work, family, and side projects.",
    alwaysKnowLabel: "Anything that should always stay true about you?",
    alwaysKnowPlaceholder: "e.g. Plain-spoken, allergic to jargon, optimistic about technology.",
    goalsLabel: "What are you working toward right now?",
    goalsPlaceholder: "e.g. Finish writing a book by spring. Run a half-marathon under 1h45.",
    workLabel: "What do you do?",
    workPlaceholder: "e.g. Software engineer at a small startup; writing on the side.",
    toolsTitle: "Tools and spaces you live in.",
    toolsSubtitle: "Pick the apps an AI should know you use day-to-day.",
    toolsGroups: {
      AI: ["ChatGPT", "Claude", "Codex", "Perplexity"],
      Notes: ["Notion", "Obsidian", "Apple Notes", "Google Docs"],
      Communication: ["Gmail", "Slack", "Discord", "Calendar"],
      Creative: ["Figma", "Canva", "Photoshop", "Final Cut"],
      Lifestyle: ["Spotify", "Strava", "Apple Health", "Kindle"],
    },
  },
  builder: {
    id: "builder",
    label: "Builder",
    description: "A profile tuned for people building products, code, or companies.",
    startTitle: "Tell Creed who you are.",
    startSubtitle: "The sharper the profile, the better every AI you build with starts.",
    defaultsTitle: "How do you want AI to act?",
    defaultsSubtitle: "Set the response defaults every AI should follow.",
    projectTitle: "Day-to-day context.",
    projectSubtitle: "Routines, people, and details AI should respect while you work.",
    generatingTitle: "Building your profile.",
    generatingSubtitle: "Turning your answers into a profile every AI can read.",
    roleLabel: "How would you describe yourself?",
    rolePlaceholder: "e.g. Solo founder building AI tools with strong product taste.",
    alwaysKnowLabel: "Anything that should always stay true about you?",
    alwaysKnowPlaceholder: "e.g. Direct, decisive, allergic to bloated process.",
    goalsLabel: "What are you working toward right now?",
    goalsPlaceholder: "e.g. Ship the v2 redesign by end of quarter. Hit $20k MRR before summer.",
    workLabel: "What do you do?",
    workPlaceholder: "e.g. Founder/engineer building Creed, designing the product end-to-end.",
    toolsTitle: "Your stack.",
    toolsSubtitle: "Pick the tools and surfaces AI should know about.",
    toolsGroups: {
      AI: ["Codex", "Claude Code", "ChatGPT", "OpenRouter"],
      Product: ["Linear", "Notion", "GitHub", "Slack"],
      Design: ["Figma", "Framer", "Screen Studio", "Canva"],
      Engineering: ["Next.js", "Supabase", "Vercel", "Postgres"],
      Growth: ["Stripe", "Resend", "Loops", "PostHog"],
    },
  },
  creative: {
    id: "creative",
    label: "Creative",
    description: "A profile tuned for writers, designers, makers, and artists.",
    startTitle: "Tell Creed about your work.",
    startSubtitle: "Help every AI you talk to understand your taste before suggesting anything.",
    defaultsTitle: "How do you want AI to act?",
    defaultsSubtitle: "Set the response defaults every AI should follow.",
    projectTitle: "Day-to-day context.",
    projectSubtitle: "Routines, collaborators, and details AI should respect.",
    generatingTitle: "Building your creative profile.",
    generatingSubtitle: "Turning your answers into a profile any AI can lean on.",
    roleLabel: "How would you describe yourself?",
    rolePlaceholder: "e.g. Essayist writing about technology and culture, with a clear voice.",
    alwaysKnowLabel: "Anything that should always stay true about you?",
    alwaysKnowPlaceholder: "e.g. Voice-first, opinion-rich, allergic to over-polished AI prose.",
    goalsLabel: "What are you working toward right now?",
    goalsPlaceholder: "e.g. Finish the essay collection by autumn. Open a small show next spring.",
    workLabel: "What do you do?",
    workPlaceholder: "e.g. Writer/designer working on long-form essays and brand identities.",
    toolsTitle: "Tools and surfaces.",
    toolsSubtitle: "Pick the tools AI should know you reach for.",
    toolsGroups: {
      Drafting: ["Google Docs", "Notion", "Obsidian", "iA Writer"],
      Publishing: ["Substack", "Ghost", "Medium", "WordPress"],
      Design: ["Figma", "Framer", "Photoshop", "Procreate"],
      Inspiration: ["Are.na", "Pinterest", "Mubi", "Mobbin"],
      AI: ["ChatGPT", "Claude", "Midjourney", "Perplexity"],
    },
  },
  custom: {
    id: "custom",
    label: "Other",
    description: "Start from a flexible structure and let your answers shape it.",
    startTitle: "Tell Creed about you.",
    startSubtitle: "Whatever shape your work takes.",
    defaultsTitle: "How do you want AI to act?",
    defaultsSubtitle: "Set the response defaults every AI should follow.",
    projectTitle: "Day-to-day context.",
    projectSubtitle: "Routines, people, and details AI should respect.",
    generatingTitle: "Building your profile.",
    generatingSubtitle: "Turning your answers into a profile any AI can read.",
    roleLabel: "How would you describe yourself?",
    rolePlaceholder: "e.g. Describe yourself in a sentence or two. The things that stay true.",
    alwaysKnowLabel: "Anything that should always stay true about you?",
    alwaysKnowPlaceholder: "e.g. Defaults, traits, or values you want every AI to respect.",
    goalsLabel: "What are you working toward right now?",
    goalsPlaceholder: "e.g. Live priorities AI should know about, long or short horizon.",
    workLabel: "What do you do?",
    workPlaceholder: "e.g. Profession, craft, or main occupation in a sentence.",
    toolsTitle: "Tools and spaces.",
    toolsSubtitle: "Pick whatever AI should recognise that you use.",
    toolsGroups: {
      AI: ["ChatGPT", "Claude", "Codex", "Perplexity"],
      Notes: ["Notion", "Obsidian", "Apple Notes", "Google Docs"],
      Work: ["Slack", "Gmail", "Calendar", "Linear"],
      Creative: ["Figma", "Canva", "Photoshop", "Final Cut"],
      Lifestyle: ["Spotify", "Strava", "Apple Health", "Kindle"],
    },
  },
};

export function getCreedTypeDefinition(type: OnboardingState["creedType"]) {
  return CREED_TYPE_DEFINITIONS[type] ?? CREED_TYPE_DEFINITIONS.personal;
}

const RESPONSE_STYLE_RULES: Record<Exclude<OnboardingState["responseStyle"], "">, string> = {
  Concise: "Keep replies concise by default.",
  Balanced: "Keep replies tight, but go deeper when depth genuinely helps.",
  Thorough: "Be thorough when needed, staying organised and high-signal.",
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanDraftText(value: string) {
  return normalizeWhitespace(value)
    .replace(/\bi\b/g, "I")
    .replace(/\bim\b/gi, "I'm")
    .replace(/\bidk\b/gi, "I don't know")
    .replace(/\bu\b/gi, "you")
    .replace(/\bur\b/gi, "your")
    .replace(/\bllm\b/gi, "LLM")
    .replace(/\bml\b/gi, "ML")
    .replace(/\bagi\b/gi, "AGI")
    .replace(/\bai\b/gi, "AI")
    .replace(/\bgithub\b/gi, "GitHub");
}

function sentenceCase(value: string) {
  const normalized = cleanDraftText(value);
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function trimSentence(value: string) {
  return cleanDraftText(value).replace(/[.;:,]+$/, "");
}

function dedupeStrings(items: string[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeWhitespace(item).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function capStrings(items: string[], limit: number) {
  return items.slice(0, limit);
}

function sentenceSplit(value: string) {
  return value
    .split(/[\n.!?]+/)
    .map(trimSentence)
    .filter(Boolean);
}

function toRuleSentence(value: string) {
  const normalized = sentenceCase(trimSentence(value));
  if (!normalized) return "";
  return normalized.endsWith(".") ? normalized : `${normalized}.`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function titleCaseList(values: string[]) {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function nullableParagraph(value: string) {
  const cleaned = normalizeWhitespace(value);
  return cleaned ? cleaned : null;
}

// ──────────────────────────────────────────────────────────────────
// Section builders
// ──────────────────────────────────────────────────────────────────

function buildIdentityText(onboarding: OnboardingState) {
  const definition = getCreedTypeDefinition(onboarding.creedType);
  const parts: string[] = [];
  const role = sentenceCase(trimSentence(onboarding.role)) || definition.label;
  parts.push(`${role}.`);

  if (onboarding.communicationStyle.length > 0) {
    parts.push(
      `Works best with ${titleCaseList(
        onboarding.communicationStyle.map((style) => style.toLowerCase())
      )} interactions.`
    );
  }

  const stayTrue = sentenceSplit(onboarding.workingWithYou)[0];
  if (stayTrue) parts.push(toRuleSentence(stayTrue));

  return normalizeWhitespace(parts.join(" "));
}

function buildGoalsText(onboarding: OnboardingState) {
  const cleaned = normalizeWhitespace(onboarding.currentProject);
  return cleaned || "Add a goal AI should know you're working toward right now.";
}

function buildWork(onboarding: OnboardingState) {
  const definition = getCreedTypeDefinition(onboarding.creedType);
  const text = normalizeWhitespace(onboarding.work) || `${definition.label.toLowerCase()} — describe what you do in a sentence.`;
  const tags = collectStackTags(onboarding);
  return { text, tags };
}

function collectStackTags(onboarding: OnboardingState) {
  const tools = dedupeStrings(
    [
      ...Object.values(onboarding.stackSelections).flat(),
      ...onboarding.customStack,
    ]
      .map((chip) => normalizeWhitespace(chip))
      .filter(Boolean)
  );
  return tools.slice(0, 18);
}

function buildPreferences(onboarding: OnboardingState) {
  const rules: string[] = [];
  if (onboarding.responseStyle) {
    rules.push(RESPONSE_STYLE_RULES[onboarding.responseStyle]);
  }
  if (onboarding.communicationStyle.includes("Direct")) {
    rules.push("Be direct. Skip softening preambles.");
  }
  if (onboarding.communicationStyle.includes("Concise")) {
    rules.push("Lead with the answer, then the supporting detail.");
  }
  if (onboarding.communicationStyle.includes("Thorough") && onboarding.responseStyle !== "Thorough") {
    rules.push("Add depth when it materially improves the answer.");
  }
  if (onboarding.communicationStyle.includes("Collaborative")) {
    rules.push("Surface tradeoffs when a decision benefits from talking it through.");
  }

  const annoyances = sentenceSplit(onboarding.annoyances).slice(0, 3);
  for (const annoyance of annoyances) {
    rules.push(`Avoid ${annoyance.toLowerCase().replace(/^(don't|do not|never)\s*/i, "").trim()}.`);
  }

  if (rules.length === 0) {
    rules.push("Lead with the answer, then the supporting detail.", "Skip filler and over-praise.");
  }

  return capStrings(dedupeStrings(rules.map((rule) => normalizeWhitespace(rule)).filter(Boolean)), 6);
}

function buildRoutines(onboarding: OnboardingState) {
  const lines = onboarding.routines
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .map((line) => toRuleSentence(line))
    .filter(Boolean);

  if (lines.length === 0) {
    return ["Add a habit, schedule, or rhythm AI should respect when planning."];
  }
  return capStrings(dedupeStrings(lines), 6);
}

// ──────────────────────────────────────────────────────────────────
// Compile + section emit
// ──────────────────────────────────────────────────────────────────

export function compileOnboardingDraft(onboarding: OnboardingState): OnboardingPreviewDraft {
  const work = buildWork(onboarding);
  return {
    identityText: buildIdentityText(onboarding),
    goalsText: buildGoalsText(onboarding),
    workText: work.text,
    workTags: work.tags,
    preferences: buildPreferences(onboarding),
    routines: buildRoutines(onboarding),
    beliefsText: nullableParagraph(onboarding.beliefs),
    constraintsText: nullableParagraph(onboarding.constraints),
    peopleText: nullableParagraph(onboarding.people),
    healthText: nullableParagraph(onboarding.health),
    contextText: nullableParagraph(onboarding.context),
  };
}

export function applyOnboardingRefinement(
  draft: OnboardingPreviewDraft,
  refinement: OnboardingRefinement
): OnboardingPreviewDraft {
  return {
    ...draft,
    identityText: refinement.identityText ?? draft.identityText,
    beliefsText: refinement.beliefsText ?? draft.beliefsText,
    goalsText: refinement.goalsText ?? draft.goalsText,
    workText: refinement.workText ?? draft.workText,
    workTags: refinement.workTags ?? draft.workTags,
    preferences: refinement.preferences ?? draft.preferences,
    constraintsText: refinement.constraintsText ?? draft.constraintsText,
    peopleText: refinement.peopleText ?? draft.peopleText,
    healthText: refinement.healthText ?? draft.healthText,
    routines: refinement.routines ?? draft.routines,
    contextText: refinement.contextText ?? draft.contextText,
  };
}

function bulletList(items: string[]) {
  if (!items.length) return "";
  return `<ul class="creed-list creed-list-bullet">${items
    .map((text) => `<li>${escapeHtml(text)}</li>`)
    .join("")}</ul>`;
}

function tagParagraph(tags: string[]) {
  if (!tags.length) return "";
  return `<p>${tags
    .map((tag) => {
      const slug = tag.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      return `<span class="creed-inline-tag" data-tag="${slug || tag.toLowerCase()}">${escapeHtml(tag)}</span>`;
    })
    .join(" ")}</p>`;
}

function makeSection(
  partial: Pick<CreedSection, "id" | "name" | "accent" | "content"> & {
    template?: CreedSection["template"];
    agentWritable?: boolean;
  }
): CreedSection {
  return {
    id: partial.id,
    kind: "rich-text",
    template: partial.template ?? "freeform",
    name: partial.name,
    accent: partial.accent,
    content: partial.content,
    // Pivot: every starter section is agent-writable so AI can keep the
    // profile accurate, polished, concise, and current.
    agentWritable: partial.agentWritable ?? true,
    lastEditedBy: "You",
    lastEditedType: "user",
    lastEditedLabel: "just now",
  };
}

function paragraphContent(text: string) {
  // Preserve intentional line breaks as paragraph splits, otherwise emit one
  // <p>. Used for free-form sections (Goals, Work, People, Health, Context).
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => normalizeWhitespace(block))
    .filter(Boolean);
  if (blocks.length === 0) return "";
  return blocks.map((block) => `<p>${escapeHtml(block)}</p>`).join("");
}

function bulletFromText(text: string) {
  const lines = text
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .map((line) => toRuleSentence(line))
    .filter(Boolean);
  return bulletList(lines);
}

export function buildOnboardingPreviewSections(draft: OnboardingPreviewDraft): CreedSection[] {
  const sections: CreedSection[] = [];

  // ─── Core (always) ────────────────────────────────────────────────
  sections.push(
    makeSection({
      id: IDENTITY_SECTION_ID,
      name: "Identity",
      accent: "identity",
      template: "identity",
      content: `<p>${escapeHtml(draft.identityText)}</p>`,
    })
  );

  // Beliefs (optional, ordered right after Identity for readability)
  if (draft.beliefsText) {
    sections.push(
      makeSection({
        id: BELIEFS_SECTION_ID,
        name: "Beliefs",
        accent: "operating-principles",
        template: "principles",
        content: bulletFromText(draft.beliefsText) || `<p>${escapeHtml(draft.beliefsText)}</p>`,
      })
    );
  }

  sections.push(
    makeSection({
      id: GOALS_SECTION_ID,
      name: "Goals",
      accent: "projects",
      template: "focus",
      content: paragraphContent(draft.goalsText) || `<p>${escapeHtml(draft.goalsText)}</p>`,
    })
  );

  sections.push(
    makeSection({
      id: WORK_SECTION_ID,
      name: "Work",
      accent: "tools",
      template: "freeform",
      content: `${paragraphContent(draft.workText)}${tagParagraph(draft.workTags)}`,
    })
  );

  sections.push(
    makeSection({
      id: PREFERENCES_SECTION_ID,
      name: "Preferences",
      accent: "preferences",
      template: "principles",
      content: bulletList(draft.preferences),
    })
  );

  // Constraints (optional)
  if (draft.constraintsText) {
    sections.push(
      makeSection({
        id: CONSTRAINTS_SECTION_ID,
        name: "Constraints",
        accent: "boundaries",
        template: "principles",
        content: bulletFromText(draft.constraintsText) || `<p>${escapeHtml(draft.constraintsText)}</p>`,
      })
    );
  }

  // People (optional)
  if (draft.peopleText) {
    sections.push(
      makeSection({
        id: PEOPLE_SECTION_ID,
        name: "People",
        accent: "rose",
        template: "freeform",
        content: paragraphContent(draft.peopleText) || `<p>${escapeHtml(draft.peopleText)}</p>`,
      })
    );
  }

  // Health (optional)
  if (draft.healthText) {
    sections.push(
      makeSection({
        id: HEALTH_SECTION_ID,
        name: "Health",
        accent: "mini-skills",
        template: "freeform",
        content: paragraphContent(draft.healthText) || `<p>${escapeHtml(draft.healthText)}</p>`,
      })
    );
  }

  sections.push(
    makeSection({
      id: ROUTINES_SECTION_ID,
      name: "Routines",
      accent: "workflows",
      template: "principles",
      content: bulletList(draft.routines),
    })
  );

  // Context (optional, catch-all goes last)
  if (draft.contextText) {
    sections.push(
      makeSection({
        id: CONTEXT_SECTION_ID,
        name: "Context",
        accent: "custom",
        template: "freeform",
        content: paragraphContent(draft.contextText) || `<p>${escapeHtml(draft.contextText)}</p>`,
      })
    );
  }

  return sections;
}
