// Recharts bar shapes with a consistent top radius. The radius is derived from
// the whole bar (its width and total stacked height), never from a single
// segment, so a bar's corners look the same whether its top is a tall block or
// a thin coloured cap. Use StackTopBar on every series of a stack.

export function RoundedTopBar({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  fill,
  radius,
  backgroundFill = "var(--creed-surface)",
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  radius?: number;
  backgroundFill?: string;
}) {
  if (height <= 0 || width <= 0) return <g />;
  // Default (standalone) radius keeps the old behaviour: scale with width,
  // capped by the bar's own height and 10. When a caller passes an explicit
  // radius (the whole-bar radius from StackTopBar), honour it instead.
  const r = Math.min(width * 0.5, radius ?? Math.min(height, 10));
  // If the segment is shorter than the radius (a thin top cap), extend the
  // drawn body down so the corner arc still fits. The topmost segment paints
  // last, so this just overlaps the segment below by a few pixels and keeps
  // the rounded top consistent across bars.
  const bottom = y + Math.max(height, r);
  const d = `M${x},${bottom}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + width - r}A${r},${r} 0 0 1 ${x + width},${y + r}V${bottom}Z`;
  return (
    <g>
      <rect x={x} y={y} width={width} height={Math.max(height, r)} fill={backgroundFill} />
      <path d={d} fill={fill} />
    </g>
  );
}

// Shape for a single segment of a stacked bar. Rounds the top only when this
// segment is the topmost non-zero one for its bar, so the stack always shows a
// curved top no matter which series happens to be on top (or zero). Apply to
// EVERY series in the stack: shape={<StackTopBar orderedKeys={keys} dataKey={k} />}.
// recharts injects x/y/width/height/fill/payload into the cloned element.
export function StackTopBar({
  orderedKeys,
  dataKey,
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  fill,
  payload,
}: {
  orderedKeys: string[];
  dataKey: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: Record<string, number | string | null | undefined>;
}) {
  if (height <= 0 || width <= 0) return <g />;
  const topKey = [...orderedKeys]
    .reverse()
    .find((key) => Number(payload?.[key] ?? 0) > 0);
  if (topKey !== dataKey) {
    return <rect x={x} y={y} width={width} height={height} fill={fill} />;
  }
  // recharts only hands us this segment's pixel box, so reconstruct the full
  // bar height from the data values (this segment's pixels-per-unit) and base
  // the radius on the whole bar, not just this thin cap.
  const value = Number(payload?.[dataKey] ?? 0);
  const total = orderedKeys.reduce(
    (sum, key) => sum + Math.max(0, Number(payload?.[key] ?? 0)),
    0
  );
  const totalHeight = value > 0 ? (height / value) * total : height;
  const r = Math.min(width * 0.5, totalHeight * 0.5, 10);
  return <RoundedTopBar x={x} y={y} width={width} height={height} fill={fill} radius={r} />;
}
