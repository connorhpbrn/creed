// Splits a string into per-character chunks, but keeps common Latin
// ligature pairs (fi, fl, ff, ffi, ffl) glued together so the browser can
// still render the ligature when each chunk is wrapped in its own element.
const LIGATURE_PAIRS = ["ffi", "ffl", "fi", "fl", "ff"];

export function splitPreservingLigatures(text: string): string[] {
  const chars = Array.from(text);
  const result: string[] = [];
  let i = 0;
  while (i < chars.length) {
    let matched = false;
    for (const lig of LIGATURE_PAIRS) {
      if (chars.slice(i, i + lig.length).join("") === lig) {
        result.push(lig);
        i += lig.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      result.push(chars[i]);
      i += 1;
    }
  }
  return result;
}
