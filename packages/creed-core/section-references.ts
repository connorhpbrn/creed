export type SectionReferenceTarget = {
  id: string;
  name: string;
  accent?: string;
};

export function normalizeSectionReference(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[\s_-]+/g, "");
}

export function findSectionReferenceTarget<T extends SectionReferenceTarget>(
  rawValue: string,
  targets: readonly T[],
): T | null {
  const normalized = normalizeSectionReference(rawValue);
  if (!normalized) return null;
  return (
    targets.find(
      (target) =>
        normalizeSectionReference(target.id) === normalized ||
        normalizeSectionReference(target.name) === normalized,
    ) ?? null
  );
}
