import type { AccentKey, CreedSection } from "@/lib/creed-data";

// Local HTML escape (kept dependency-free so this pure module stays unit-
// testable without the @/ runtime alias). Matches lib/rich-text.ts:escapeHtml.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Company onboarding compiles the 5-7 company answers into a deterministic seed:
// the default company sections. It mirrors lib/onboarding/compile.ts (personal)
// but produces a company-shaped file: Company, Ethos, Operating Rules, People,
// Projects, Clients, Tools, Agent Rules. Answered sections carry the company's
// words; the rest ship as light stubs the owner's assistant or teammates flesh
// out. Sections are flat (no path hierarchy): a person's section is just a
// section named after them, added later.

export type CompanyOnboardingState = {
  companyName: string;
  whatItDoes: string;
  whoFor: string;
  people: string;
  projects: string;
  agentsGetWrong: string;
  neverChange: string;
};

export const EMPTY_COMPANY_ONBOARDING: CompanyOnboardingState = {
  companyName: "",
  whatItDoes: "",
  whoFor: "",
  people: "",
  projects: "",
  agentsGetWrong: "",
  neverChange: "",
};

const ETHOS_STUB =
  "Add what this company believes and how it wants AI to reason on its behalf.";
const CLIENTS_STUB =
  "Add the clients or partners this Creed should know about.";
const TOOLS_STUB = "Add the tools, systems, and stack the company works in.";
const PEOPLE_STUB =
  "Add the people on the team and what each is responsible for.";
const PROJECTS_STUB =
  "Add the projects and products this Creed should know about.";

function normalizeWhitespace(value: string) {
  return value
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanInline(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bai\b/gi, "AI")
    .replace(/\bllm\b/gi, "LLM")
    .replace(/\bgithub\b/gi, "GitHub");
}

function toRuleSentence(value: string) {
  const cleaned = cleanInline(value).replace(/[.;:,]+$/, "");
  if (!cleaned) return "";
  const cased = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return cased.endsWith(".") ? cased : `${cased}.`;
}

function dedupe(items: string[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Split a free-form answer into list items: the user's own line breaks first,
// then commas, then sentence boundaries.
function toListItems(value: string, limit: number) {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) return [];
  const rawLines = cleaned.split(/\n+/).filter(Boolean);
  const pieces =
    rawLines.length > 1
      ? rawLines
      : cleaned.includes(",")
        ? cleaned.split(",")
        : cleaned.split(/(?<=[.!?])\s+/);
  return dedupe(pieces.map((p) => cleanInline(p)).filter(Boolean)).slice(
    0,
    limit,
  );
}

function toRuleLines(value: string, limit: number) {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) return [];
  const rawLines = cleaned.split(/\n+/).filter(Boolean);
  const pieces =
    rawLines.length > 1 ? rawLines : cleaned.split(/(?<=[.!?])\s+/);
  return dedupe(pieces.map(toRuleSentence).filter(Boolean)).slice(0, limit);
}

function paragraphContent(text: string) {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => normalizeWhitespace(block).replace(/\n+/g, " "))
    .filter(Boolean);
  if (blocks.length === 0) return "";
  return blocks.map((block) => `<p>${escapeHtml(block)}</p>`).join("");
}

function bulletList(items: string[]) {
  if (!items.length) return "";
  return `<ul class="creed-list creed-list-bullet">${items
    .map((text) => `<li>${escapeHtml(text)}</li>`)
    .join("")}</ul>`;
}

function graphTags(names: string[]) {
  if (!names.length) return "";
  const tags = names
    .map((name) => {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      return `<span class="creed-inline-tag" data-tag="${escapeHtml(slug)}">${escapeHtml(name)}</span>`;
    })
    .join(" ");
  return `<h3>Graph Tags</h3><p>${tags}</p>`;
}

function makeSection(
  partial: Pick<CreedSection, "id" | "name" | "accent" | "content"> & {
    template?: CreedSection["template"];
  },
): CreedSection {
  return {
    id: partial.id,
    kind: "rich-text",
    template: partial.template ?? "freeform",
    name: partial.name,
    accent: partial.accent,
    content: partial.content,
    agentWritable: true,
    agentPermission: "propose",
    lastEditedBy: "You",
    lastEditedType: "user",
    lastEditedLabel: "just now",
  };
}

// The default company sections, with their fixed accents.
const COMPANY_SECTIONS: Array<{ id: string; name: string; accent: AccentKey }> =
  [
    { id: "company", name: "Company", accent: "identity" },
    { id: "ethos", name: "Ethos", accent: "operating-principles" },
    { id: "operating-rules", name: "Operating Rules", accent: "boundaries" },
    { id: "people", name: "People", accent: "rose" },
    { id: "projects", name: "Projects", accent: "projects" },
    { id: "clients", name: "Clients", accent: "preferences" },
    { id: "tools", name: "Tools", accent: "tools" },
    { id: "agent-rules", name: "Agent Rules", accent: "workflows" },
  ];

/**
 * Deterministic company seed from the onboarding answers. Pure: no AI, no IO.
 * The owner's assistant can polish it afterwards via the compose prompt, and
 * teammates + agents fill the stubbed sections over time.
 */
export function buildCompanyOnboardingSections(
  state: CompanyOnboardingState,
): CreedSection[] {
  const companyBody = [state.whatItDoes, state.whoFor]
    .map((s) => normalizeWhitespace(s))
    .filter(Boolean)
    .join("\n\n");

  const contentById: Record<string, string> = {
    company: `${
      paragraphContent(companyBody) ||
      `<p>${escapeHtml("Add what the company does and who this Creed is for.")}</p>`
    }${graphTags(["Ethos", "Projects", "People"])}`,
    ethos: `${paragraphContent(ETHOS_STUB)}${graphTags(["Company", "Operating Rules", "Agent Rules"])}`,
    "operating-rules": `${bulletList(
      toRuleLines(state.neverChange, 6).length
        ? toRuleLines(state.neverChange, 6)
        : [
            "Do not change canonical context without an owner or admin approving.",
          ],
    )}${graphTags(["Ethos", "People", "Agent Rules"])}`,
    people: `${bulletList(
      toListItems(state.people, 20).length
        ? toListItems(state.people, 20)
        : [PEOPLE_STUB],
    )}${graphTags(["Company", "Projects", "Operating Rules"])}`,
    projects: `${bulletList(
      toListItems(state.projects, 20).length
        ? toListItems(state.projects, 20)
        : [PROJECTS_STUB],
    )}${graphTags(["Company", "People", "Clients", "Tools"])}`,
    clients: `${bulletList([CLIENTS_STUB])}${graphTags(["Company", "Projects", "People"])}`,
    tools: `${bulletList([TOOLS_STUB])}${graphTags(["Projects", "People", "Agent Rules"])}`,
    "agent-rules": `${bulletList(
      toRuleLines(state.agentsGetWrong, 6).length
        ? toRuleLines(state.agentsGetWrong, 6)
        : [
            "Read this Creed before acting. Propose changes; do not overwrite canonical context.",
          ],
    )}${graphTags(["Company", "Operating Rules", "Tools"])}`,
  };

  return COMPANY_SECTIONS.map((section, index) =>
    makeSection({
      id: section.id,
      name: section.name,
      accent: section.accent,
      template: index === 0 ? "identity" : "freeform",
      content: contentById[section.id] ?? "",
    }),
  );
}

/** The company Creed name from the first answer, trimmed, with a fallback. */
export function companyNameFromOnboarding(
  state: CompanyOnboardingState,
): string {
  return normalizeWhitespace(state.companyName) || "Your company";
}
