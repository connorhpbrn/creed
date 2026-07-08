"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

import { qualityScoreColor } from "@/components/creed/file-quality-ui";
import type { CreedSection } from "@/lib/creed-data";
import {
  buildNexusGraph,
  type NexusGraphEdge,
  type NexusGraphNode,
} from "@/lib/nexus-graph";
import { cn } from "@/lib/utils";

type NexusViewProps = {
  sections: CreedSection[];
  scoresBySectionId?: ReadonlyMap<string, number>;
  className?: string;
};

type SimNode = NexusGraphNode & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};

type ViewTransform = {
  x: number;
  y: number;
  k: number;
};

type CanvasSize = {
  width: number;
  height: number;
};

type PointerPoint = {
  x: number;
  y: number;
};

type Gesture =
  | {
      mode: "pan";
      pointerId: number;
      start: PointerPoint;
      transform: ViewTransform;
    }
  | {
      mode: "drag-node";
      pointerId: number;
      nodeId: string;
      offset: PointerPoint;
    }
  | {
      mode: "pinch";
      initialDistance: number;
      initialCenter: PointerPoint;
      transform: ViewTransform;
    }
  | null;

type TooltipState = {
  id: string;
  name: string;
  color: string;
  score?: number;
  x: number;
  y: number;
} | null;

const MIN_ZOOM = 0.34;
const BASE_MAX_ZOOM = 2.8;
const NODE_BASE_RADIUS = 7;
const EDGE_LENGTH = 145;
const NODE_SELECTION_STROKE = "var(--accent-color-mono)";
const EMPTY_SCORES = new Map<string, number>();

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededPosition(id: string, index: number, total: number) {
  const hash = stableHash(id);
  const angle =
    ((hash % 4096) / 4096) * Math.PI * 2 +
    (index / Math.max(total, 1)) * Math.PI * 0.7;
  const ring = 80 + (index % 5) * 42 + Math.floor(index / 5) * 16;
  return {
    x: Math.cos(angle) * ring,
    y: Math.sin(angle) * ring,
  };
}

function distance(a: PointerPoint, b: PointerPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: PointerPoint, b: PointerPoint): PointerPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function screenToWorld(
  point: PointerPoint,
  transform: ViewTransform,
): PointerPoint {
  return {
    x: (point.x - transform.x) / transform.k,
    y: (point.y - transform.y) / transform.k,
  };
}

function worldToScreen(
  point: PointerPoint,
  transform: ViewTransform,
): PointerPoint {
  return {
    x: point.x * transform.k + transform.x,
    y: point.y * transform.k + transform.y,
  };
}

function resolveCanvasColor(value: string) {
  if (typeof window === "undefined" || !value.startsWith("var(")) {
    return value;
  }

  const match = value.match(/^var\((--[^),]+)\)$/);
  if (!match?.[1]) {
    return value;
  }

  const resolved = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(match[1])
    .trim();
  return resolved || value;
}

function nodeRadiusFromContent(node: NexusGraphNode) {
  const contentWeight = Math.log1p(
    Math.max(node.characterCount, node.wordCount * 6),
  );
  return clamp(NODE_BASE_RADIUS + contentWeight * 1.55, 7, 24);
}

function dynamicMaxZoom(nodeCount: number) {
  if (nodeCount >= 80) return 1.25;
  if (nodeCount >= 48) return 1.55;
  if (nodeCount >= 28) return 1.95;
  if (nodeCount >= 16) return 2.35;
  return BASE_MAX_ZOOM;
}

function getVisibleWorldBounds(size: CanvasSize, transform: ViewTransform) {
  const topLeft = screenToWorld({ x: 0, y: 0 }, transform);
  const bottomRight = screenToWorld(
    { x: size.width, y: size.height },
    transform,
  );
  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    maxX: Math.max(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxY: Math.max(topLeft.y, bottomRight.y),
  };
}

function containNodeInView(
  node: SimNode,
  size: CanvasSize,
  transform: ViewTransform,
  bounce = 0,
) {
  if (!size.width || !size.height) return;
  const bounds = getVisibleWorldBounds(size, transform);
  const margin = Math.max(node.radius + 2 / transform.k, node.radius);
  const minX = bounds.minX + margin;
  const maxX = bounds.maxX - margin;
  const minY = bounds.minY + margin;
  const maxY = bounds.maxY - margin;

  if (minX <= maxX) {
    if (node.x < minX) {
      node.x = minX;
      if (node.vx < 0) node.vx *= -bounce;
    } else if (node.x > maxX) {
      node.x = maxX;
      if (node.vx > 0) node.vx *= -bounce;
    }
  }

  if (minY <= maxY) {
    if (node.y < minY) {
      node.y = minY;
      if (node.vy < 0) node.vy *= -bounce;
    } else if (node.y > maxY) {
      node.y = maxY;
      if (node.vy > 0) node.vy *= -bounce;
    }
  }
}

export function NexusView({
  sections,
  scoresBySectionId = EMPTY_SCORES,
  className,
}: NexusViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const graph = useMemo(
    () => buildNexusGraph(sections, scoresBySectionId),
    [sections, scoresBySectionId],
  );
  const graphKey = useMemo(
    () =>
      [
        graph.nodes.map((node) => node.id).join(","),
        graph.edges.map((edge) => edge.id).join(","),
      ].join("|"),
    [graph],
  );
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const simNodesRef = useRef<Map<string, SimNode>>(new Map());
  const edgesRef = useRef<NexusGraphEdge[]>([]);
  const transformRef = useRef<ViewTransform>({ x: 0, y: 0, k: 1 });
  const pointersRef = useRef<Map<number, PointerPoint>>(new Map());
  const gestureRef = useRef<Gesture>(null);
  const draggedNodeRef = useRef<string | null>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  const animationAlphaRef = useRef(1);
  const needsFitRef = useRef(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const rect = entry?.contentRect;
      if (!rect) {
        return;
      }
      setSize({
        width: Math.max(0, rect.width),
        height: Math.max(0, rect.height),
      });
      needsFitRef.current = true;
      animationAlphaRef.current = Math.max(animationAlphaRef.current, 0.5);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const previous = simNodesRef.current;
    const next = new Map<string, SimNode>();
    const total = graph.nodes.length;

    graph.nodes.forEach((node, index) => {
      const existing = previous.get(node.id);
      const radius = nodeRadiusFromContent(node);

      if (existing) {
        next.set(node.id, {
          ...existing,
          ...node,
          radius,
        });
        return;
      }

      const seeded = seededPosition(node.id, index, total);
      next.set(node.id, {
        ...node,
        ...seeded,
        vx: 0,
        vy: 0,
        radius,
      });
    });

    simNodesRef.current = next;
    edgesRef.current = graph.edges;
    needsFitRef.current = true;
    animationAlphaRef.current = 1;
    hoveredNodeRef.current = null;
    setSelectedNodeId((current) =>
      current && next.has(current) ? current : null,
    );
    setTooltip(null);
  }, [graph, graphKey]);

  const fitToGraph = useCallback(() => {
    const nodes = Array.from(simNodesRef.current.values());
    if (!size.width || !size.height) {
      return;
    }

    if (!nodes.length) {
      transformRef.current = {
        x: size.width / 2,
        y: size.height / 2,
        k: 1,
      };
      return;
    }

    const bounds = nodes.reduce(
      (acc, node) => ({
        minX: Math.min(acc.minX, node.x - node.radius),
        maxX: Math.max(acc.maxX, node.x + node.radius),
        minY: Math.min(acc.minY, node.y - node.radius),
        maxY: Math.max(acc.maxY, node.y + node.radius),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      },
    );

    const graphWidth = Math.max(120, bounds.maxX - bounds.minX);
    const graphHeight = Math.max(120, bounds.maxY - bounds.minY);
    const padding = size.width < 640 ? 56 : 96;
    const scale = clamp(
      Math.min(
        (size.width - padding) / graphWidth,
        (size.height - padding) / graphHeight,
      ),
      MIN_ZOOM,
      1.35,
    );

    transformRef.current = {
      x: size.width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
      y: size.height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale,
      k: scale,
    };
  }, [size.height, size.width]);

  const findNodeAt = useCallback((screenPoint: PointerPoint) => {
    const worldPoint = screenToWorld(screenPoint, transformRef.current);
    const nodes = Array.from(simNodesRef.current.values());

    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index];
      if (!node) {
        continue;
      }
      const hitRadius = node.radius + 10 / transformRef.current.k;
      if (
        Math.hypot(worldPoint.x - node.x, worldPoint.y - node.y) <= hitRadius
      ) {
        return node;
      }
    }

    return null;
  }, []);

  const updateTooltipForNode = useCallback((node: SimNode | null) => {
    hoveredNodeRef.current = node?.id ?? null;
    if (!node) {
      setTooltip(null);
      return;
    }

    const screen = worldToScreen(
      { x: node.x, y: node.y },
      transformRef.current,
    );
    setTooltip({
      id: node.id,
      name: node.name,
      color: node.color,
      score: node.score,
      x: screen.x,
      y: screen.y,
    });
  }, []);

  const applyZoom = useCallback(
    (origin: PointerPoint, zoom: number) => {
      const current = transformRef.current;
      const nextScale = clamp(
        current.k * zoom,
        MIN_ZOOM,
        dynamicMaxZoom(graph.nodes.length),
      );
      const world = screenToWorld(origin, current);
      transformRef.current = {
        x: origin.x - world.x * nextScale,
        y: origin.y - world.y * nextScale,
        k: nextScale,
      };
      for (const node of simNodesRef.current.values()) {
        containNodeInView(node, size, transformRef.current);
      }
      animationAlphaRef.current = Math.max(animationAlphaRef.current, 0.15);
    },
    [graph.nodes.length, size],
  );

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const origin = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      applyZoom(origin, Math.exp(-event.deltaY * 0.0014));
    },
    [applyZoom],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      pointersRef.current.set(event.pointerId, point);
      event.currentTarget.setPointerCapture(event.pointerId);

      if (pointersRef.current.size === 2) {
        const [first, second] = Array.from(pointersRef.current.values());
        if (first && second) {
          gestureRef.current = {
            mode: "pinch",
            initialDistance: Math.max(1, distance(first, second)),
            initialCenter: midpoint(first, second),
            transform: { ...transformRef.current },
          };
          setDragging(true);
        }
        return;
      }

      const node = findNodeAt(point);
      if (node) {
        setSelectedNodeId(node.id);
        const world = screenToWorld(point, transformRef.current);
        gestureRef.current = {
          mode: "drag-node",
          pointerId: event.pointerId,
          nodeId: node.id,
          offset: {
            x: node.x - world.x,
            y: node.y - world.y,
          },
        };
        draggedNodeRef.current = node.id;
        animationAlphaRef.current = Math.max(animationAlphaRef.current, 0.5);
        updateTooltipForNode(node);
        setDragging(true);
        return;
      }

      gestureRef.current = {
        mode: "pan",
        pointerId: event.pointerId,
        start: point,
        transform: { ...transformRef.current },
      };
      setSelectedNodeId(null);
      updateTooltipForNode(null);
      setDragging(true);
    },
    [findNodeAt, updateTooltipForNode],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      pointersRef.current.set(event.pointerId, point);

      const gesture = gestureRef.current;
      if (gesture?.mode === "pinch") {
        const [first, second] = Array.from(pointersRef.current.values());
        if (!first || !second) {
          return;
        }
        const center = midpoint(first, second);
        const scale = clamp(
          gesture.transform.k *
            (distance(first, second) / gesture.initialDistance),
          MIN_ZOOM,
          dynamicMaxZoom(graph.nodes.length),
        );
        const world = screenToWorld(gesture.initialCenter, gesture.transform);
        transformRef.current = {
          x: center.x - world.x * scale,
          y: center.y - world.y * scale,
          k: scale,
        };
        animationAlphaRef.current = Math.max(animationAlphaRef.current, 0.15);
        return;
      }

      if (gesture?.mode === "pan" && gesture.pointerId === event.pointerId) {
        transformRef.current = {
          ...gesture.transform,
          x: gesture.transform.x + point.x - gesture.start.x,
          y: gesture.transform.y + point.y - gesture.start.y,
        };
        animationAlphaRef.current = Math.max(animationAlphaRef.current, 0.12);
        return;
      }

      if (
        gesture?.mode === "drag-node" &&
        gesture.pointerId === event.pointerId
      ) {
        const node = simNodesRef.current.get(gesture.nodeId);
        if (!node) {
          return;
        }
        const world = screenToWorld(point, transformRef.current);
        node.x = world.x + gesture.offset.x;
        node.y = world.y + gesture.offset.y;
        containNodeInView(node, size, transformRef.current);
        node.vx = 0;
        node.vy = 0;
        animationAlphaRef.current = Math.max(animationAlphaRef.current, 0.45);
        updateTooltipForNode(node);
        return;
      }

      if (pointersRef.current.size <= 1) {
        updateTooltipForNode(findNodeAt(point));
      }
    },
    [findNodeAt, graph.nodes.length, size, updateTooltipForNode],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      pointersRef.current.delete(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (pointersRef.current.size === 0) {
        gestureRef.current = null;
        draggedNodeRef.current = null;
        setDragging(false);
        return;
      }

      if (pointersRef.current.size === 1) {
        const [remaining] = Array.from(pointersRef.current.entries());
        if (remaining) {
          gestureRef.current = {
            mode: "pan",
            pointerId: remaining[0],
            start: remaining[1],
            transform: { ...transformRef.current },
          };
        }
      }
    },
    [],
  );

  const handlePointerLeave = useCallback(() => {
    if (!gestureRef.current) {
      updateTooltipForNode(null);
    }
  }, [updateTooltipForNode]);

  const resetView = useCallback(() => {
    fitToGraph();
    animationAlphaRef.current = Math.max(animationAlphaRef.current, 0.4);
  }, [fitToGraph]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
      const step = event.shiftKey ? 88 : 42;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        transformRef.current.x += step;
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        transformRef.current.x -= step;
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        transformRef.current.y += step;
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        transformRef.current.y -= step;
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        applyZoom({ x: size.width / 2, y: size.height / 2 }, 1.14);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        applyZoom({ x: size.width / 2, y: size.height / 2 }, 0.88);
      } else if (event.key === "0") {
        event.preventDefault();
        resetView();
      } else {
        return;
      }

      animationAlphaRef.current = Math.max(animationAlphaRef.current, 0.16);
    },
    [applyZoom, resetView, size.height, size.width],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !size.width || !size.height) {
      return;
    }

    const ctx = context;
    let frameId = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    function stepSimulation() {
      const nodes = Array.from(simNodesRef.current.values());
      const alpha = animationAlphaRef.current;
      if (alpha < 0.002) {
        return;
      }

      const byId = simNodesRef.current;
      for (const edge of edgesRef.current) {
        const source = byId.get(edge.sourceId);
        const target = byId.get(edge.targetId);
        if (!source || !target) {
          continue;
        }

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const force = ((length - EDGE_LENGTH) / length) * 0.018 * alpha;
        const fx = dx * force;
        const fy = dy * force;
        if (draggedNodeRef.current !== source.id) {
          source.vx += fx;
          source.vy += fy;
        }
        if (draggedNodeRef.current !== target.id) {
          target.vx -= fx;
          target.vy -= fy;
        }
      }

      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        if (!a) {
          continue;
        }

        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          if (!b) {
            continue;
          }

          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let length = Math.hypot(dx, dy);
          if (length < 0.01) {
            dx = 0.01;
            dy = 0.01;
            length = Math.hypot(dx, dy);
          }

          const minDistance = a.radius + b.radius + 18;
          const charge = Math.min(7.5, 1200 / (length * length)) * alpha;
          const collision =
            length < minDistance
              ? ((minDistance - length) / length) * 0.08 * alpha
              : 0;
          const fx = (dx / length) * (charge + collision);
          const fy = (dy / length) * (charge + collision);

          if (draggedNodeRef.current !== a.id) {
            a.vx -= fx;
            a.vy -= fy;
          }
          if (draggedNodeRef.current !== b.id) {
            b.vx += fx;
            b.vy += fy;
          }
        }

        if (draggedNodeRef.current !== a.id) {
          a.vx += -a.x * 0.0014 * alpha;
          a.vy += -a.y * 0.0014 * alpha;
          a.vx *= 0.84;
          a.vy *= 0.84;
          a.x += a.vx;
          a.y += a.vy;
          containNodeInView(a, size, transformRef.current, 0.32);
        }
      }

      animationAlphaRef.current *= 0.985;
    }

    function draw() {
      if (needsFitRef.current) {
        fitToGraph();
        needsFitRef.current = false;
      }

      stepSimulation();

      const transform = transformRef.current;
      const nodes = Array.from(simNodesRef.current.values());
      const byId = simNodesRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);

      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      ctx.lineWidth = Math.max(0.75, 1 / transform.k);
      for (const edge of edgesRef.current) {
        const source = byId.get(edge.sourceId);
        const target = byId.get(edge.targetId);
        if (!source || !target) {
          continue;
        }
        const selectedNode = selectedNodeId ? byId.get(selectedNodeId) : null;
        const selectedEdge =
          Boolean(selectedNodeId) &&
          (edge.sourceId === selectedNodeId ||
            edge.targetId === selectedNodeId);
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.lineWidth = selectedEdge
          ? Math.max(1.75, 2.4 / transform.k)
          : Math.max(0.75, 1 / transform.k);
        ctx.strokeStyle =
          selectedEdge && selectedNode
            ? resolveCanvasColor(selectedNode.color)
            : "rgba(148, 148, 148, 0.28)";
        ctx.globalAlpha = selectedNodeId && !selectedEdge ? 0.42 : 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      for (const node of nodes) {
        const hovered = hoveredNodeRef.current === node.id;
        const selected = selectedNodeId === node.id;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = resolveCanvasColor(node.color);
        ctx.fill();

        if (hovered || selected) {
          ctx.lineWidth = Math.max(1, 1.5 / transform.k);
          ctx.strokeStyle = resolveCanvasColor(NODE_SELECTION_STROKE);
          ctx.stroke();
        }
      }

      ctx.restore();

      frameId = window.requestAnimationFrame(draw);
    }

    frameId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frameId);
  }, [fitToGraph, graphKey, selectedNodeId, size]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-[calc(100dvh-176px)] min-h-[420px] overflow-hidden md:h-[calc(100dvh-190px)] md:min-h-[520px]",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-label="Nexus graph view of section references"
        className={cn(
          "block h-full w-full touch-none outline-none",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        role="img"
        tabIndex={0}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onKeyDown={handleKeyDown}
      />

      {graph.nodes.length > 0 && graph.edges.length === 0 ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 mx-auto max-w-md px-4 py-3 text-center text-[13px] leading-5 text-[var(--creed-text-secondary)]">
          Add real section tags like{" "}
          <span className="font-medium text-[var(--creed-text-primary)]">
            #Goals
          </span>{" "}
          in Graph Tags to connect the map.
        </div>
      ) : null}

      {graph.nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center">
          <div className="max-w-sm text-[13px] leading-6 text-[var(--creed-text-secondary)]">
            Restore or add a section to build a Nexus map.
          </div>
        </div>
      ) : null}

      {tooltip ? (
        <div
          className="pointer-events-none absolute z-10 w-64 rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-3 text-[12px] shadow-[0_8px_24px_rgba(28,28,26,0.10)]"
          style={{
            left: clamp(tooltip.x + 14, 8, Math.max(8, size.width - 256)),
            top: clamp(tooltip.y + 14, 8, Math.max(8, size.height - 92)),
          }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <div
              className="min-w-0 truncate text-[17px] font-medium leading-tight tracking-[-0.01em] text-[var(--creed-text-primary)]"
              style={{ color: resolveCanvasColor(tooltip.color) }}
            >
              {tooltip.name}
            </div>
            {typeof tooltip.score === "number" ? (
              <div className="flex items-baseline gap-1.5">
                <span
                  className="font-mono text-[20px] font-medium leading-none tracking-[-0.02em] tabular-nums"
                  style={{ color: qualityScoreColor(tooltip.score) }}
                >
                  {tooltip.score}
                </span>
                <span className="text-[12px] font-medium text-[var(--creed-text-primary)]">
                  / 100
                </span>
              </div>
            ) : (
              <div className="shrink-0 text-[12px] font-medium text-[var(--creed-text-tertiary)]">
                No score
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
