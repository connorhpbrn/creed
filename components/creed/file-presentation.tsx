"use client";

import {
  forwardRef,
  useRef,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { motion, Reorder, useDragControls } from "framer-motion";
import { cn } from "@/lib/utils";

const FILE_NAV_PRESS_CLASS =
  "transform-gpu transition-[color,background-color,transform,filter] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:translate-y-px active:scale-[0.98] active:brightness-[0.96]";

export function FileSectionNavButton({
  sectionId,
  name,
  accent,
  active,
  pendingCount = 0,
  pendingDelete = false,
  collapsed = false,
  reorderPosition,
  canDrag = false,
  dragging = false,
  onDragStateChange,
  onClick,
}: {
  sectionId?: string;
  name: string;
  accent: string;
  active: boolean;
  pendingCount?: number;
  pendingDelete?: boolean;
  collapsed?: boolean;
  reorderPosition?: number;
  canDrag?: boolean;
  dragging?: boolean;
  onDragStateChange?: (dragging: boolean) => void;
  onClick: () => void;
}) {
  const dragControls = useDragControls();
  const draggedRef = useRef(false);

  const button = (
    <button
        type="button"
        onPointerDown={(event) => {
          if (!canDrag) return;
          onDragStateChange?.(true);
          dragControls.start(event, { distanceThreshold: 4 });
        }}
        onClick={() => {
          if (draggedRef.current) return;
          onClick();
        }}
        className={cn(
          "mx-auto flex h-8 w-8 touch-none items-center justify-center rounded-sm text-left text-[14px] font-medium text-[var(--creed-text-secondary)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]",
          FILE_NAV_PRESS_CLASS,
          !collapsed &&
            "lg:mx-0 lg:h-auto lg:min-h-0 lg:w-full lg:justify-start lg:gap-3 lg:px-2 lg:py-2",
          active &&
            "bg-[var(--creed-surface-raised)]! text-[var(--creed-text-primary)] hover:bg-[var(--creed-surface-raised)]!",
          pendingDelete &&
            "bg-[#FEF2F2] text-[#B91C1C] hover:bg-[#FDE2E2] hover:text-[#991B1B] dark:bg-[#3F1212]/35 dark:text-[#F87171] dark:hover:bg-[#3F1212]/55 dark:hover:text-[#F87171]",
          pendingDelete &&
            active &&
            "bg-[#FDE2E2] text-[#991B1B] dark:bg-[#3F1212]/55",
        )}
        aria-label={name}
      >
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-[3px]",
            !collapsed && "lg:h-1.5 lg:w-1.5 lg:rounded-[2px]",
          )}
          style={{ backgroundColor: pendingDelete ? "#DC2626" : accent }}
        />
        <span
          className={cn(
            "hidden truncate",
            !collapsed && "lg:inline",
            pendingDelete && "line-through",
          )}
        >
          {name}
        </span>
        {pendingCount > 0 ? (
          <span
            className={cn(
              "ml-auto hidden h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-[var(--creed-accent)] px-1.5 text-[10px] font-medium leading-none tabular-nums text-white",
              !collapsed && "lg:inline-flex",
            )}
            aria-label={`${pendingCount} pending proposal${pendingCount === 1 ? "" : "s"}`}
          >
            {pendingCount}
          </span>
        ) : null}
    </button>
  );

  if (!sectionId || reorderPosition === undefined) {
    return button;
  }

  return (
    <Reorder.Item
      value={sectionId}
      dragListener={false}
      dragControls={dragControls}
      layout="position"
      layoutDependency={reorderPosition}
      dragElastic={0}
      dragMomentum={false}
      animate={{ opacity: dragging ? 0.64 : 1 }}
      transition={{
        layout: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.12 },
      }}
      onDragStart={() => {
        draggedRef.current = true;
      }}
      onDragEnd={() => {
        onDragStateChange?.(false);
        window.setTimeout(() => {
          draggedRef.current = false;
        }, 0);
      }}
      className="relative list-none"
    >
      {button}
    </Reorder.Item>
  );
}

export const FileStickyHeader = forwardRef<
  HTMLDivElement,
  {
    children: ReactNode;
    compact?: boolean;
  }
>(function FileStickyHeader({ children, compact = false }, ref) {
  return (
    <div
      ref={ref}
      data-file-sticky-header
      className={cn(
        "sticky top-0 bg-[color:var(--creed-surface)]/95 backdrop-blur-sm [overflow-anchor:none]",
        compact
          ? "z-[60] mb-7 pb-4 pt-3"
          : "z-20 mb-8 -mx-4 px-4 pb-5 pt-2 md:-mx-12 md:mb-12 md:px-12 md:pb-7 xl:-mx-16 xl:px-16",
      )}
    >
      {children}
    </div>
  );
});

export function FileStickyHeaderRow({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col md:flex-row md:items-start md:justify-between",
        compact ? "mx-auto max-w-[700px] gap-4 px-4 md:px-7" : "gap-6",
      )}
    >
      {children}
    </div>
  );
}

export function FileStickyReviewRow({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex justify-start",
        compact
          ? "mx-auto mt-5 max-w-[700px] px-2 sm:px-4 md:px-7"
          : "mt-5",
      )}
    >
      {children}
    </div>
  );
}

export function FileSectionHeading({
  name,
  accent,
  quality,
  supplemental,
  controls,
  collapsible = false,
  collapsed = false,
  onToggleCollapsed,
}: {
  name: string;
  accent: string;
  quality?: ReactNode;
  supplemental?: ReactNode;
  controls?: ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <span
            className="inline-block h-9 w-[3px] rounded-full"
            style={{ backgroundColor: accent }}
          />
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <span
              className="text-[15px] font-medium leading-none md:text-[16px]"
              style={{ color: accent }}
            >
              {name}
            </span>
            {quality}
            {supplemental}
            {collapsible ? (
              <button
                type="button"
                aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`}
                aria-expanded={!collapsed}
                onClick={onToggleCollapsed}
                className="-ml-2 inline-flex h-9 w-10 shrink-0 items-center justify-center pl-2 text-[var(--creed-text-secondary)] transition-colors duration-150 hover:text-[var(--creed-text-primary)]"
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    collapsed ? "-rotate-90" : "rotate-0",
                  )}
                />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {controls ? (
        <div className="flex shrink-0 items-center gap-0.5">{controls}</div>
      ) : null}
    </div>
  );
}

export function FileActivityRailFrame({
  children,
  open = true,
  overlay = false,
}: {
  children: ReactNode;
  open?: boolean;
  overlay?: boolean;
}) {
  return (
    <motion.aside
      initial={overlay ? { width: 0, opacity: 0 } : false}
      animate={{
        width: open ? 356 : 0,
        opacity: open ? 1 : 0,
        x: open ? 0 : 18,
      }}
      exit={
        overlay
          ? { width: 0, opacity: 0 }
          : { width: 0, opacity: 0, x: 18 }
      }
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      style={{ maxWidth: "min(82vw, 356px)" }}
      className={cn(
        "absolute inset-y-0 right-0 h-full overflow-hidden border-l border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[-18px_0_50px_rgba(28,28,26,0.12)] lg:static lg:h-full lg:shrink-0 lg:shadow-none",
        overlay ? "z-[70] lg:z-auto" : "z-30",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      {children}
    </motion.aside>
  );
}
