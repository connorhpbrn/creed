// Panel's find-mode scorer. Deliberately tiny: exact > prefix > word-prefix >
// substring > keyword > in-order subsequence. Returns 0 for no match; higher
// is better. No dependency because the behaviours Panel needs (keyword
// aliases, subsequence typos) are ~40 lines and everything else a fuzzy lib
// ships is surface we would have to fight.

const normalize = (value: string) => value.toLowerCase().trim();

function subsequenceScore(query: string, text: string): number {
  let textIndex = 0;
  let gaps = 0;
  for (const char of query) {
    const found = text.indexOf(char, textIndex);
    if (found === -1) return 0;
    if (found > textIndex) gaps += 1;
    textIndex = found + 1;
  }
  // Every gap costs a point so tighter matches rank first.
  return Math.max(12, 30 - gaps * 3);
}

export function fuzzyScore(rawQuery: string, rawLabel: string, keywords: string[] = []): number {
  const query = normalize(rawQuery);
  if (!query) return 0;
  const label = normalize(rawLabel);

  if (label === query) return 100;
  if (label.startsWith(query)) return 84;
  // Word-boundary prefix ("usage" hits "Model usage").
  if (label.split(/[\s/·-]+/).some((word) => word.startsWith(query))) return 72;
  if (label.includes(query)) return 60;

  let best = 0;
  for (const keyword of keywords) {
    const alias = normalize(keyword);
    if (alias === query) best = Math.max(best, 56);
    else if (alias.startsWith(query)) best = Math.max(best, 50);
    else if (alias.includes(query)) best = Math.max(best, 44);
  }
  if (best > 0) return best;

  // Last resort: the query's characters appear in order in the label
  // ("vcontrol" still finds "Version control").
  return query.length >= 2 ? subsequenceScore(query, label) : 0;
}
