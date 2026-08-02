"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

// Each Tooltip self-provides so call sites don't need a root-level provider.
function TooltipProvider({
  delayDuration = 200,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root {...props} />
    </TooltipProvider>
  );
}

function TooltipTrigger(
  props: React.ComponentProps<typeof TooltipPrimitive.Trigger>
) {
  return <TooltipPrimitive.Trigger {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          // Clean rounded rectangle on the app surface with a subtle border,
          // matching the dropdown / popover chrome. No arrow, small caption text.
          // Radix Tooltip's state is delayed-open / instant-open / closed (NOT
          // "open"), so the enter animation is applied unconditionally (it plays
          // on mount when the tooltip opens) and only the exit is gated on closed.
          "z-50 w-fit max-w-[16rem] rounded-[var(--radius-md)] border border-[var(--creed-border)] bg-[var(--creed-surface)] px-2.5 py-1.5 text-[13px] font-medium leading-none text-[var(--creed-text-primary)] shadow-[0_8px_24px_rgba(28,28,26,0.10)] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
          className
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

// Convenience wrapper for the common "icon button + short label" case so call
// sites can drop the native `title=` attribute without trigger/content boilerplate.
function SimpleTooltip({
  label,
  children,
  side = "top",
  sideOffset = 6,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: React.ComponentProps<typeof TooltipPrimitive.Content>["side"];
  sideOffset?: number;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={sideOffset}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, SimpleTooltip };
