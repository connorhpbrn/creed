// Pure hit-testing helpers for the diff view's whole-block selection.
//
// These are separated from the React component so the geometry (which block is
// under the pointer) and the proposal-id collection (which proposals a block
// range covers) can be unit-tested without a full editor mount. The component
// wires these to mouse events and applies the `creed-block-selected` wash.

// The index of the top-level block whose vertical band contains `clientY`, or
// null when the pointer is in a gap between blocks. Y-only so the handle/drag
// tracks by row regardless of horizontal position (gutter or text).
export function blockIndexAtY(children: HTMLElement[], clientY: number): number | null {
  for (let i = 0; i < children.length; i += 1) {
    const rect = children[i].getBoundingClientRect();
    if (rect.height > 0 && clientY >= rect.top - 2 && clientY <= rect.bottom + 2) {
      return i;
    }
  }
  return null;
}

// The blocks in the inclusive index range [startIdx, endIdx] (order-independent)
// and the distinct proposal ids they cover. A block element may itself be a
// proposal hunk (block-level diff) or contain inline hunk spans.
export function proposalIdsInBlockRange(
  children: HTMLElement[],
  startIdx: number,
  endIdx: number
): { ids: string[]; blocks: HTMLElement[] } {
  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  const ids: string[] = [];
  const blocks: HTMLElement[] = [];

  const collect = (node: Element | null) => {
    if (
      node &&
      typeof (node as HTMLElement).matches === "function" &&
      node.matches("[data-document-diff-proposal-id]")
    ) {
      const id = node.getAttribute("data-document-diff-proposal-id");
      if (id && !ids.includes(id)) ids.push(id);
    }
  };

  for (let i = lo; i <= hi; i += 1) {
    const el = children[i];
    if (!el) continue;
    blocks.push(el);
    collect(el);
    el.querySelectorAll<HTMLElement>("[data-document-diff-proposal-id]").forEach(collect);
  }

  return { ids, blocks };
}
