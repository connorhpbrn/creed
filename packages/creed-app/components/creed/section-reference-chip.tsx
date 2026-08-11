import type { CSSProperties } from "react";
import { accentColorMap } from "@creed/core/creed-data";
import type { SectionReferenceTarget } from "@creed/core/section-references";

type SectionReferenceStyle = CSSProperties & {
  "--section-accent-tint": string;
  "--section-accent-bar": string;
};

export function sectionReferenceChipStyle(accentKey?: string): SectionReferenceStyle {
  const accent =
    accentKey && accentKey in accentColorMap
      ? accentColorMap[accentKey as keyof typeof accentColorMap]
      : "var(--creed-accent)";
  return {
    "--section-accent-tint": accent.startsWith("#")
      ? `${accent}22`
      : "var(--accent-tint-mono)",
    "--section-accent-bar": accent,
  };
}

export function applySectionReferenceChipStyle(element: HTMLElement, accentKey?: string) {
  const style = sectionReferenceChipStyle(accentKey);
  element.style.setProperty(
    "--section-accent-tint",
    style["--section-accent-tint"],
  );
  element.style.setProperty(
    "--section-accent-bar",
    style["--section-accent-bar"],
  );
}

export function SectionReferenceChip({
  section,
  onSelect,
}: {
  section: SectionReferenceTarget;
  onSelect?: (sectionId: string) => void;
}) {
  return (
    <span
      className={`creed-inline-tag${onSelect ? " cursor-pointer" : ""}`}
      data-tag={section.id}
      data-section-id={section.id}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect ? () => onSelect(section.id) : undefined}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onSelect(section.id);
            }
          : undefined
      }
      style={sectionReferenceChipStyle(section.accent)}
    >
      {section.name}
    </span>
  );
}
