const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/g;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function creedMarkdownFilename(name?: string | null): string {
  const normalized = (name ?? "")
    .trim()
    .replace(INVALID_FILENAME_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  const stem = normalized.replace(/\.md$/i, "").replace(/[. ]+$/g, "");
  const safeStem = WINDOWS_RESERVED_NAME.test(stem) ? `${stem} Creed` : stem;

  return `${safeStem || "Creed"}.md`;
}
