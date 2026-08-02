import { sectionToMarkdown, type CreedSection } from "@/lib/creed-data";

// The prompts Creed exposes over MCP (prompts/list + prompts/get). The in-app
// onboarding "copy prompt" is built per-user by buildComposePrompt below.
export const CREED_PROMPTS = [
  {
    name: "introduce-me",
    description:
      "Read my Creed and introduce me the way a sharp collaborator would.",
    text: "Read my Creed with read_creed, then introduce me in a few tight sentences the way a sharp new collaborator would after reading my profile. Lead with what matters most about how to work with me.",
  },
  {
    name: "tighten-my-creed",
    description:
      "Review my Creed and propose tightening or pruning where it has drifted.",
    text: "Read my Creed with read_creed, then look for anything vague, stale, duplicated, or contradictory. Propose narrowly-scoped tightening or pruning with the creed_* tools, following the contract. If nothing durable needs changing, say so and propose nothing.",
  },
] as const;

// The onboarding "copy prompt" text. Unlike the static MCP prompts above, this
// is built per-user from their seed draft: they paste it into any AI, which
// returns a polished markdown Creed they paste back into Creed. No MCP, so it
// works on any device with any assistant.
export function buildComposePrompt(sections: CreedSection[]): string {
  const headings = sections.map((section) => `## ${section.name}`).join("\n");
  const draft = sections
    .map((section) => sectionToMarkdown(section))
    .join("\n");
  return [
    "I just finished onboarding for Creed - a personal-context profile my AI assistants read so they always know me. Below is a rough starter draft built from a few onboarding questions. Using this draft plus everything you already know about me from our history, write my full Creed: a sharp, durable, concrete profile with no filler or hedging.",
    "",
    "Output ONLY the finished Creed as markdown inside a single fenced code block - nothing before or after it. Use exactly these headings, in this order, and do not add or remove sections:",
    "",
    headings,
    "",
    "For every section, include a short `### Graph Tags` subsection near the end. Graph Tags are only references to other sections in this Creed, written as hashtags for real section names from the heading list above, such as `#Goals`, `#Work`, or `#Preferences`. Use 2-4 useful related-section tags per section. Do not create hashtags for tools, apps, brands, themes, projects, or labels unless they are actual section headings.",
    "",
    "Put the rewritten body under each heading. Here is my starter draft to build from:",
    "",
    draft,
  ].join("\n");
}

// The company onboarding "copy prompt". Same shape as buildComposePrompt but
// framed for a shared company Creed: the file the whole team and their agents
// read before acting. The owner pastes it into any assistant, which returns a
// polished markdown company Creed they paste back in.
export function buildCompanyComposePrompt(
  sections: CreedSection[],
  companyName: string,
): string {
  const name = companyName.trim() || "our company";
  const headings = sections.map((section) => `## ${section.name}`).join("\n");
  const draft = sections
    .map((section) => sectionToMarkdown(section))
    .join("\n");
  return [
    `I'm setting up a shared company Creed for ${name} - one context file our whole team and every AI agent we connect reads before it acts, so everyone stays aligned. Below is a rough starter draft built from a few onboarding questions. Using this draft plus what you know about the company, write our full company Creed: sharp, durable, concrete, no filler or hedging. Write about the company and team, not about one person.`,
    "",
    "Output ONLY the finished Creed as markdown inside a single fenced code block - nothing before or after it. Use exactly these headings, in this order, and do not add or remove sections:",
    "",
    headings,
    "",
    "For every section, include a short `### Graph Tags` subsection near the end. Graph Tags are only references to other sections in this company Creed, written as hashtags for real section names from the heading list above, such as `#Projects`, `#People`, or `#Agent Rules`. Use 2-4 useful related-section tags per section. Do not create hashtags for tools, apps, brands, themes, clients, projects, or labels unless they are actual section headings.",
    "",
    "Put the rewritten body under each heading. Here is the starter draft to build from:",
    "",
    draft,
  ].join("\n");
}
