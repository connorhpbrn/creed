import { describe, expect, it } from "vitest";
import { blockIndexAtY, proposalIdsInBlockRange } from "@/lib/diff-block-selection";

// Minimal fake of the DOM surface the helpers touch, so the geometry + id
// collection can be verified without a browser DOM environment.
type FakeRect = { top: number; bottom: number; height: number };

function fakeBlock(options: {
  rect: FakeRect;
  selfId?: string;
  descendantIds?: string[];
}): HTMLElement {
  const { rect, selfId, descendantIds = [] } = options;
  const descendants = descendantIds.map((id) => ({
    matches: (sel: string) => sel === "[data-document-diff-proposal-id]",
    getAttribute: (name: string) =>
      name === "data-document-diff-proposal-id" ? id : null,
  }));
  return {
    getBoundingClientRect: () => rect as DOMRect,
    matches: (sel: string) =>
      sel === "[data-document-diff-proposal-id]" && selfId !== undefined,
    getAttribute: (name: string) =>
      name === "data-document-diff-proposal-id" ? selfId ?? null : null,
    querySelectorAll: () => ({
      forEach: (fn: (n: unknown) => void) => descendants.forEach(fn),
    }),
  } as unknown as HTMLElement;
}

describe("blockIndexAtY", () => {
  const children = [
    fakeBlock({ rect: { top: 0, bottom: 40, height: 40 } }),
    fakeBlock({ rect: { top: 56, bottom: 96, height: 40 } }),
    fakeBlock({ rect: { top: 112, bottom: 152, height: 40 } }),
  ];

  it("returns the block whose vertical band contains the pointer", () => {
    expect(blockIndexAtY(children, 20)).toBe(0);
    expect(blockIndexAtY(children, 70)).toBe(1);
    expect(blockIndexAtY(children, 130)).toBe(2);
  });

  it("matches within a small tolerance at the block edges", () => {
    expect(blockIndexAtY(children, -1)).toBe(0); // top - 2 tolerance
    expect(blockIndexAtY(children, 153)).toBe(2); // bottom + 2 tolerance
  });

  it("returns null in a gap between blocks", () => {
    expect(blockIndexAtY(children, 48)).toBeNull();
  });

  it("skips zero-height blocks", () => {
    const withEmpty = [
      fakeBlock({ rect: { top: 0, bottom: 0, height: 0 } }),
      fakeBlock({ rect: { top: 0, bottom: 40, height: 40 } }),
    ];
    expect(blockIndexAtY(withEmpty, 20)).toBe(1);
  });
});

describe("proposalIdsInBlockRange", () => {
  const children = [
    // A run paragraph containing two inline hunks.
    fakeBlock({ rect: { top: 0, bottom: 40, height: 40 }, descendantIds: ["p1", "p2"] }),
    // A block-level hunk (the block element itself is the proposal).
    fakeBlock({ rect: { top: 56, bottom: 96, height: 40 }, selfId: "p3" }),
    // A plain content block (no proposals).
    fakeBlock({ rect: { top: 112, bottom: 152, height: 40 } }),
    fakeBlock({ rect: { top: 168, bottom: 208, height: 40 }, descendantIds: ["p4"] }),
  ];

  it("collects ids across a multi-block range (order-independent)", () => {
    expect(proposalIdsInBlockRange(children, 0, 1).ids).toEqual(["p1", "p2", "p3"]);
    // Dragging upward yields the same set.
    expect(proposalIdsInBlockRange(children, 1, 0).ids).toEqual(["p1", "p2", "p3"]);
  });

  it("includes the block element's own proposal id", () => {
    expect(proposalIdsInBlockRange(children, 1, 1).ids).toEqual(["p3"]);
  });

  it("returns an empty id list for a range of content-only blocks", () => {
    const result = proposalIdsInBlockRange(children, 2, 2);
    expect(result.ids).toEqual([]);
    expect(result.blocks).toHaveLength(1);
  });

  it("dedupes and spans the full range", () => {
    const result = proposalIdsInBlockRange(children, 0, 3);
    expect(result.ids).toEqual(["p1", "p2", "p3", "p4"]);
    expect(result.blocks).toHaveLength(4);
  });
});
