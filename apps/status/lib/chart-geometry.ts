// Geometry for the 90-day uptime chart. Pure and separate from the component so
// the arithmetic is testable: the tooltip's misplacement was arithmetic rather
// than styling.

export function barWidth(rowWidth: number, count: number, gap: number): number {
  if (count <= 0) return 0;
  return (rowWidth - (count - 1) * gap) / count;
}

// Which bar sits under a pointer, measured from the row's left edge. Depends
// only on the row's geometry, never on the tooltip, so it is safe to call from a
// pointer handler.
export function barIndexAt(
  offsetX: number,
  rowWidth: number,
  count: number,
  gap: number
): number {
  const barW = barWidth(rowWidth, count, gap);
  return Math.min(
    Math.max(count - 1, 0),
    Math.max(0, Math.floor(offsetX / (barW + gap)))
  );
}

// Where the tooltip's horizontal centre should sit for a given bar, clamped so
// the tooltip's own box stays inside the row.
//
// This depends on `tooltipWidth`, which depends on the label being shown, which
// changes with the bar. Callers must therefore measure the tooltip *after* the
// new label has rendered , measuring beforehand uses the previous label's width
// and misplaces the tooltip (an "Operational" label measures ~99px where a
// "Degraded · 99.71%" label measures ~138px).
export function tooltipCentre(
  index: number,
  rowWidth: number,
  count: number,
  gap: number,
  tooltipWidth: number
): number {
  const barW = barWidth(rowWidth, count, gap);
  const centre = index * (barW + gap) + barW / 2;
  const half = tooltipWidth / 2;
  // A tooltip at least as wide as the row cannot satisfy both edges. Keep its
  // left edge visible rather than letting the clamp invert and push it off to
  // the left, which is what a not-yet-laid-out row (width 0) used to do.
  if (tooltipWidth >= rowWidth) return half;
  return Math.min(rowWidth - half, Math.max(half, centre));
}
