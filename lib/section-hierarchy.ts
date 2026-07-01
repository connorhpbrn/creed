// Section nesting lives here so the profile provider, the document-mode editor,
// and the Markdown parser/serializer all agree on one set of rules.
//
// Sections are a FLAT ordered array. Hierarchy is implied by `depth` + position
// (exactly like Markdown headings): a section's parent is the nearest preceding
// section one level shallower. Children are always contiguous after their
// parent. Depth is clamped to [0, MAX_SECTION_DEPTH]; no section may be more
// than one level deeper than the section before it (so there are never orphans).

export const MAX_SECTION_DEPTH = 2;

type Depthed = { id?: string; depth?: number };

export function sectionDepth(section: Depthed): number {
  const depth = section.depth ?? 0;
  if (!Number.isFinite(depth) || depth < 0) return 0;
  return Math.min(MAX_SECTION_DEPTH, Math.floor(depth));
}

// Clamp depths so the list is always a valid tree: the first section is depth 0
// and no section is more than one level deeper than its predecessor. Returns the
// same reference when nothing changed so callers can skip redundant state writes.
export function normalizeSectionDepths<T extends Depthed>(sections: T[]): T[] {
  let previousDepth = -1;
  let changed = false;
  const next = sections.map((section) => {
    const clamped = Math.max(0, Math.min(sectionDepth(section), previousDepth + 1));
    previousDepth = clamped;
    if (section.depth !== clamped) {
      changed = true;
      return { ...section, depth: clamped };
    }
    return section;
  });
  return changed ? next : sections;
}

// Number of contiguous descendants (following entries deeper than this one).
function descendantCount<T extends Depthed>(sections: T[], index: number): number {
  if (index < 0 || index >= sections.length) return 0;
  const baseDepth = sectionDepth(sections[index]);
  let count = 0;
  for (let i = index + 1; i < sections.length; i += 1) {
    if (sectionDepth(sections[i]) > baseDepth) count += 1;
    else break;
  }
  return count;
}

export function sectionHasChildren<T extends Depthed>(sections: T[], index: number): boolean {
  const next = sections[index + 1];
  return next ? sectionDepth(next) > sectionDepth(sections[index]) : false;
}

export function canIndentSection<T extends Depthed>(sections: T[], index: number): boolean {
  if (index <= 0) return false;
  const depth = sectionDepth(sections[index]);
  if (depth >= MAX_SECTION_DEPTH) return false;
  // It can only become a child if the section above sits at the same depth or
  // deeper (otherwise there is nothing at `depth` for it to nest under).
  return depth <= sectionDepth(sections[index - 1]);
}

export function canOutdentSection<T extends Depthed>(sections: T[], index: number): boolean {
  return sectionDepth(sections[index]) > 0;
}

// Shift a section and its contiguous descendants by `delta`, then normalize the
// whole list so the result is always a valid tree.
export function shiftSubtreeDepth<T extends Depthed>(
  sections: T[],
  index: number,
  delta: number
): T[] {
  if (index < 0 || index >= sections.length) return sections;
  const count = descendantCount(sections, index);
  const shifted = sections.map((section, i) => {
    if (i >= index && i <= index + count) {
      const depth = Math.max(0, Math.min(MAX_SECTION_DEPTH, sectionDepth(section) + delta));
      return { ...section, depth };
    }
    return section;
  });
  return normalizeSectionDepths(shifted);
}

// Ids hidden because an ancestor is collapsed. Marking every descendant of any
// collapsed node covers nested collapse automatically (inner subtrees fall
// inside the outer node's descendant range).
export function collapsedHiddenIds<T extends Depthed & { id: string }>(
  sections: T[],
  collapsedIds: ReadonlySet<string>
): Set<string> {
  const hidden = new Set<string>();
  for (let i = 0; i < sections.length; i += 1) {
    if (!collapsedIds.has(sections[i].id)) continue;
    const count = descendantCount(sections, i);
    for (let j = i + 1; j <= i + count; j += 1) {
      hidden.add(sections[j].id);
    }
  }
  return hidden;
}

// Rebuild the full ordered id list after a drag over the VISIBLE rows only.
// Hidden descendants of a collapsed parent travel with that parent, so a
// collapsed subtree moves as one unit.
export function reconcileReorderedIds<T extends Depthed & { id: string }>(
  currentOrder: T[],
  reorderedVisibleIds: string[],
  collapsedIds: ReadonlySet<string>
): string[] {
  const byId = new Map(currentOrder.map((section) => [section.id, section]));
  const descendantsOf = new Map<string, string[]>();
  for (let i = 0; i < currentOrder.length; i += 1) {
    if (!collapsedIds.has(currentOrder[i].id)) continue;
    const count = descendantCount(currentOrder, i);
    descendantsOf.set(
      currentOrder[i].id,
      currentOrder.slice(i + 1, i + 1 + count).map((section) => section.id)
    );
  }

  const result: string[] = [];
  const consumed = new Set<string>();
  const push = (id: string) => {
    if (consumed.has(id) || !byId.has(id)) return;
    result.push(id);
    consumed.add(id);
  };

  for (const id of reorderedVisibleIds) {
    push(id);
    for (const descendantId of descendantsOf.get(id) ?? []) {
      push(descendantId);
    }
  }
  // Safety net: anything not seen (shouldn't happen) keeps its place at the end.
  for (const section of currentOrder) push(section.id);
  return result;
}
