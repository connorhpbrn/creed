// Prompt assembly for Tab autocomplete: the explicit-invoke completion inside
// the section editor. Press Tab once, one suggestion, drawn from the current
// section plus the whole Creed. Pure functions (no server imports) so the
// truncation behaviour is testable under node --test.
//
// The whole file is sent as the static prompt prefix (it changes on save, not
// per keystroke) so provider-side prefix caching absorbs most of the input
// cost across an editing session. Keep the ordering stable: system prompt,
// then the Creed context, then the small dynamic tail.

export type TabMode = "complete" | "draft";

export type TabSectionContext = {
  id: string;
  name: string;
  /** Section body as markdown (see sectionBodyMarkdown). */
  content: string;
};

// Client-side caps mirrored by the route's validation.
export const TAB_MAX_BEFORE_CHARS = 4000;
export const TAB_MAX_AFTER_CHARS = 1200;

// Rough character budget for the other-sections context. Core sections carry
// the most steering signal, so when the file outgrows the budget the optional
// and custom sections shrink first.
const CONTEXT_BUDGET_CHARS = 24000;
const NON_CORE_TRUNCATED_CHARS = 1200;
const CORE_TRUNCATED_CHARS = 2400;

// The five always-on core section ids (mirrors the *_SECTION_ID constants in
// lib/creed-data; kept as literals so this file stays import-free and runs
// under node --test without the @/ alias).
const CORE_SECTION_IDS = new Set<string>([
  "identity",
  "goals",
  "work",
  "preferences",
  "routines",
]);

function truncateBody(body: string, max: number) {
  if (body.length <= max) return body;
  // Cut on a line boundary where possible so the prompt never ends mid-word.
  const slice = body.slice(0, max);
  const lastBreak = slice.lastIndexOf("\n");
  return `${lastBreak > max * 0.5 ? slice.slice(0, lastBreak) : slice}\n[truncated]`;
}

// The other-sections context. The target section's body is excluded: its live
// text arrives separately as the before/after cursor split, and duplicating a
// stale copy here would only invite the model to echo it.
export function buildTabContext(
  sections: TabSectionContext[],
  targetSectionId: string,
): string {
  const others = sections.filter((section) => section.id !== targetSectionId);
  const totalChars = others.reduce(
    (sum, section) => sum + section.content.length,
    0,
  );
  const overBudget = totalChars > CONTEXT_BUDGET_CHARS;

  return others
    .map((section) => {
      let body = section.content.trim();
      if (overBudget) {
        body = truncateBody(
          body,
          CORE_SECTION_IDS.has(section.id)
            ? CORE_TRUNCATED_CHARS
            : NON_CORE_TRUNCATED_CHARS,
        );
      }
      return `## ${section.name}\n\n${body || "(empty)"}`;
    })
    .join("\n\n");
}

export function buildTabSystemPrompt(): string {
  return [
    "You are the autocomplete engine inside Creed, a personal context file that AI assistants read before helping its owner. You continue the owner's writing inside one section of that file.",
    "",
    "Rules:",
    "- Write as the owner, in first person, matching their voice, rhythm, and formatting exactly.",
    "- Be specific and anchored: real tools, names, numbers, habits, and defaults that already appear in the file. Every line must be worth an AI reading before it helps the owner.",
    "- Never invent facts. Only use facts stated in the file or clearly implied by the text before the cursor. If a needed fact is unknown, write up to it and stop rather than guessing.",
    "- Stay tight: no filler, no restating what is already written in the section, no generic personality praise.",
    "- Output the continuation only: plain text, a single block, no headings, no list markers, no markdown syntax, no quotes around it, no commentary.",
    "- Begin exactly where the text stops. Never repeat or re-type anything already written before the cursor. Include a leading space when the text before the cursor ends mid-sentence without one. If the cursor sits mid-word, finish that word first.",
    "- Complete one thought: finish the current sentence, then at most one or two more short sentences.",
  ].join("\n");
}

export function buildTabUserPrompt({
  context,
  sectionName,
  before,
  after,
  mode,
}: {
  context: string;
  sectionName: string;
  before: string;
  after: string;
  mode: TabMode;
}): string {
  const instruction =
    mode === "draft"
      ? `The "${sectionName}" section is empty. Draft its first two or three sentences, synthesized only from facts elsewhere in the file that belong in this section. If the file holds nothing relevant, write one short, honest opening line the owner can build on instead of inventing details.`
      : "Continue the text before the cursor.";

  return [
    "The owner's Creed, for voice and facts:",
    "",
    "<creed>",
    context || "(the rest of the file is empty)",
    "</creed>",
    "",
    `You are completing inside the section "${sectionName}".`,
    "",
    "Text before the cursor:",
    "<before>",
    before.slice(-TAB_MAX_BEFORE_CHARS),
    "</before>",
    "",
    "Text after the cursor:",
    "<after>",
    after.slice(0, TAB_MAX_AFTER_CHARS) || "(none)",
    "</after>",
    "",
    instruction,
    "Reply with the continuation only.",
  ].join("\n");
}

// Normalize a raw model reply into insertable ghost text. Completions are a
// single text block by contract: leading blank lines and continuation
// ellipses are shaved off, everything from the first remaining line break
// onward is dropped, wrapping quotes/fences are stripped, a re-typed copy of
// the user's own prefix is deduplicated, and leading whitespace is collapsed
// against what the user already typed.
export function sanitizeTabCompletion(raw: string, before: string): string {
  let text = raw.replace(/\r/g, "").replace(/^[\s]*\n+/, "");
  // Some models open with a continuation ellipsis ("...rest of sentence").
  text = text.replace(/^\s*(\.{3}|…)\s*/, " ");
  const newline = text.indexOf("\n");
  if (newline !== -1) text = text.slice(0, newline);
  text = text.replace(/^```+/, "").replace(/```+\s*$/, "");
  // Strip a fully-wrapping quote pair; keep interior quotes intact.
  if (/^".*"$/.test(text.trim())) text = text.trim().slice(1, -1);
  text = stripEchoedPrefix(text, before);
  if (/\s$/.test(before) || before === "") {
    text = text.replace(/^\s+/, "");
  } else {
    text = text.replace(/^\s+/, " ");
  }
  return text.trimEnd();
}

// Models sometimes restart the sentence instead of continuing it, echoing the
// tail of what the user already typed. Drop the longest before-tail that the
// completion re-types, but only when the overlap clearly spans words (12+
// chars or contains a space): a short overlap like "Type" -> "TypeScript" is
// the model finishing a word, not an echo.
function stripEchoedPrefix(text: string, before: string): string {
  const tail = before.slice(-160).trimEnd();
  const candidate = text.replace(/^\s+/, "");
  const max = Math.min(tail.length, candidate.length);
  for (let len = max; len >= 4; len -= 1) {
    const suffix = tail.slice(-len);
    if (candidate.toLowerCase().startsWith(suffix.toLowerCase())) {
      if (len >= 12 || suffix.includes(" ")) {
        return candidate.slice(len);
      }
      return text;
    }
  }
  return text;
}
