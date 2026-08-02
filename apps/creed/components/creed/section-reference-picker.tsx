"use client";

import type { CSSProperties, Ref } from "react";
import { accentColorMap } from "@/lib/creed-data";
import { cn } from "@/lib/utils";

export type SectionReferencePickerItem = {
  id: string;
  name: string;
  accent?: string;
};

export const SECTION_REFERENCE_PICKER_MAX_ROWS = 6;
export const SECTION_REFERENCE_PICKER_ROW_HEIGHT = 36;
export const SECTION_REFERENCE_PICKER_PADDING = 8;
export const SECTION_REFERENCE_PICKER_GAP = 8;

type SectionReferencePickerProps<T extends SectionReferencePickerItem> = {
  items: readonly T[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (item: T) => void;
  emptyMessage?: string;
  dataAttribute?: string;
  pickerRef?: Ref<HTMLDivElement>;
  style: CSSProperties;
  className?: string;
};

function accentColor(accent: string | undefined) {
  if (!accent) return "var(--creed-accent)";
  if (accent in accentColorMap) {
    return accentColorMap[accent as keyof typeof accentColorMap];
  }
  return accent;
}

export function SectionReferencePicker<T extends SectionReferencePickerItem>({
  items,
  activeIndex,
  onActiveIndexChange,
  onSelect,
  emptyMessage,
  dataAttribute = "data-creed-mention-popup",
  pickerRef,
  style,
  className,
}: SectionReferencePickerProps<T>) {
  return (
    <div
      ref={pickerRef}
      {...{ [dataAttribute]: "" }}
      className={cn(
        "fixed z-[60] overflow-y-auto rounded-[var(--radius-md)] bg-[var(--creed-surface)] p-1 ring-1 ring-foreground/8 shadow-[0_12px_30px_rgba(28,28,26,0.08)] creed-scrollbar",
        className,
      )}
      style={{
        pointerEvents: "auto",
        maxHeight: `${SECTION_REFERENCE_PICKER_MAX_ROWS * SECTION_REFERENCE_PICKER_ROW_HEIGHT + SECTION_REFERENCE_PICKER_PADDING}px`,
        ...style,
      }}
    >
      {items.length ? (
        items.map((section, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={section.id}
              type="button"
              data-active={isActive}
              onMouseMove={() => onActiveIndexChange(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(section);
              }}
              className={cn(
                "flex h-9 w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 text-left text-[14px] font-medium text-[var(--creed-text-secondary)] transition-colors duration-150",
                isActive && "bg-accent text-accent-foreground",
              )}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: accentColor(section.accent) }}
              />
              <span className="truncate">{section.name}</span>
            </button>
          );
        })
      ) : emptyMessage ? (
        <div className="flex h-9 items-center px-2.5 text-[13px] text-[var(--creed-text-tertiary)]">
          {emptyMessage}
        </div>
      ) : null}
    </div>
  );
}
