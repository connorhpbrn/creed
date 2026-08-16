// Normalize only whitespace that has no effect on what an agent reads. Fenced
// code remains byte-sensitive because its spacing can be meaningful.
export function normalizeQualityMarkdown(markdown: string): string {
  let inCodeBlock = false;
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const normalized = lines.map((line) => {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      return line.trimEnd();
    }
    if (inCodeBlock) return line;
    return line.replace(/[ \t]+/g, " ").trim();
  });

  return normalized.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
