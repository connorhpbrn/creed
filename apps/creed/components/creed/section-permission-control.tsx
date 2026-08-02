"use client";

import { type ComponentType, type Ref } from "react";
import { motion } from "motion/react";
import { EyeIcon } from "@/components/ui/eye";
import { EyeOffIcon } from "@/components/ui/eye-off";
import { PenToolIcon } from "@/components/ui/pen-tool";
import { ShieldCheckIcon } from "@/components/ui/shield-check";
import {
  useAnimatedIconControls,
  type AnimatedIconHandle,
} from "@/components/creed/animated-icon-controls";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { AgentPermission } from "@/lib/creed-data";
import { cn } from "@/lib/utils";

// The compact icon-segmented permission control shared by the personal settings
// screen and the company settings screen, so both pick agent/member permission
// levels with an identical animated control. Kept in one module to guarantee the
// two screens never drift apart visually.

type AnimatedIconComponent = ComponentType<{
  ref?: Ref<AnimatedIconHandle>;
  size?: number;
  className?: string;
}>;

export const PERMISSION_OPTIONS: Array<{
  value: AgentPermission;
  label: string;
  icon: AnimatedIconComponent;
  color: string;
}> = [
  {
    value: "hidden",
    label: "Hidden from agent",
    icon: EyeOffIcon,
    color: "#DC2626",
  },
  { value: "read-only", label: "Read-only", icon: EyeIcon, color: "#EAB308" },
  {
    value: "propose",
    label: "Propose (needs approval)",
    icon: ShieldCheckIcon,
    color: "#16A34A",
  },
  {
    value: "direct",
    label: "Direct edit",
    icon: PenToolIcon,
    color: "#2563EB",
  },
];

// The global control reuses the same control without the "hidden" option.
export const GLOBAL_PERMISSION_OPTIONS = PERMISSION_OPTIONS.filter(
  (option) => option.value !== "hidden",
);

// One segment. Hover plays the icon's animation through the shared controls
// hook, exactly like AnimatedIconButton elsewhere on the site.
function PermissionSegment({
  option,
  selected,
  layoutGroup,
  muted = false,
  onSelect,
}: {
  option: (typeof PERMISSION_OPTIONS)[number];
  selected: boolean;
  layoutGroup: string;
  muted?: boolean;
  onSelect: () => void;
}) {
  const { iconRef, start, settle } = useAnimatedIconControls();
  const Icon = option.icon;
  return (
    <SimpleTooltip label={option.label}>
      <button
        type="button"
        aria-label={option.label}
        aria-pressed={selected}
        onClick={onSelect}
        // When the control is greyed (mixed state) skip the hover animation so
        // the icons read as inactive.
        onMouseEnter={muted ? undefined : start}
        onMouseLeave={muted ? undefined : settle}
        className="group relative inline-flex h-7 w-7 items-center justify-center rounded-[7px] transition-colors duration-150"
      >
        {selected ? (
          <motion.span
            layoutId={`perm-highlight-${layoutGroup}`}
            className="absolute inset-0 rounded-[7px]"
            style={{ backgroundColor: option.color }}
            transition={{ type: "spring", stiffness: 520, damping: 40 }}
          />
        ) : null}
        <Icon
          ref={iconRef}
          size={14}
          // pointer-events-none so the whole button is the click/hover target,
          // not just the 14px glyph. The icon brightens on hover via group-hover
          // (the button's hover), since its own :hover can't fire with pointer
          // events disabled.
          className={cn(
            "pointer-events-none relative inline-flex h-3.5 w-3.5 items-center justify-center transition-colors duration-150",
            selected
              ? "text-white"
              : muted
                ? "text-[var(--creed-text-tertiary)]"
                : "text-[var(--creed-text-tertiary)] group-hover:text-[var(--creed-text-primary)]",
          )}
        />
      </button>
    </SimpleTooltip>
  );
}

// Compact icon-segmented control. The selected segment fills with its level
// colour and the highlight slides between segments via a shared layoutId.
// `layoutGroup` scopes that animation to one row so highlights don't fly
// between sections.
export function SectionPermissionControl({
  value,
  onChange,
  layoutGroup,
  options = PERMISSION_OPTIONS,
  disabled = false,
}: {
  value: AgentPermission | null;
  onChange: (permission: AgentPermission) => void;
  layoutGroup: string;
  options?: typeof PERMISSION_OPTIONS;
  // Locked (e.g. a section the viewer can only read, so their agent can't be
  // given more): greyed and non-interactive, still showing the fixed value.
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm bg-background p-1 transition-opacity duration-150 dark:bg-input/30",
        // No shared level (sections differ): grey the control to read as
        // "mixed / not applied", but it stays clickable to set one level.
        value === null && "opacity-45",
        disabled && "pointer-events-none opacity-45",
      )}
      aria-disabled={disabled || undefined}
    >
      {options.map((option) => (
        <PermissionSegment
          key={option.value}
          option={option}
          selected={value === option.value}
          layoutGroup={layoutGroup}
          muted={value === null || disabled}
          onSelect={() => {
            if (!disabled) onChange(option.value);
          }}
        />
      ))}
    </div>
  );
}
