"use client";

import { Toaster as SonnerToaster } from "sonner";

// Themed wrapper around sonner so toast styling lives in one place. Colours
// map to the existing quality-tag palette: green = success, amber = warning,
// red = error. Anchored bottom-right with a small offset so it doesn't
// fight the corner of dialogs or floating UI.
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      // Toasts sit above the "Get started" card when it's on screen; the
      // card publishes its live height into the CSS variable (0 elsewhere),
      // so the stack tracks its expand/collapse in real time. Only the
      // bottom offset moves - a plain string would shift every side and
      // drag the stack left.
      offset={{
        bottom: "calc(20px + var(--getting-started-offset, 0px))",
        right: 20,
        top: 20,
        left: 20,
      }}
      gap={10}
      duration={4000}
      visibleToasts={4}
      closeButton
      toastOptions={{
        unstyled: false,
        classNames: {
          // Title-only toasts. Keep the original generous padding so the
          // notification still has visual weight without a description row
          // to balance against - the single line of text sits comfortably
          // centred rather than crammed into a thin pill. Extra right
          // padding to leave room for the absolutely-positioned close
          // button which now lives on the right edge of the toast.
          toast:
            "group !rounded-lg !border !text-[13px] !leading-5 !shadow-[0_10px_30px_rgba(28,28,26,0.10)] !p-3.5 !pr-10",
          title: "!font-medium",
          // Close button: anchored on the right (sonner defaults to left)
          // and inherits the toast's text colour via `text-current` so a
          // success toast gets a green X, an error toast a red X, etc.
          //
          // Sizing matches the toast's main icon (~20px glyph). Shape is a
          // squircle (`rounded-[8px]`) rather than a circle. Hover fill is
          // a tinted-darker version of the toast's own background (via
          // `bg-current/[0.10]` on the same accent colour) so the hover
          // surface stays inside the toast's colour family.
          closeButton:
            "!absolute !top-1/2 !right-2.5 !left-auto !-translate-y-1/2 !transform-none !h-7 !w-7 !rounded-[8px] !bg-transparent !border-0 !text-current !opacity-70 hover:!opacity-100 hover:!bg-current/[0.10] !transition-all [&_svg]:!h-4 [&_svg]:!w-4",
          // Per-tone surfaces. Background hues match the quality tag pills
          // so the visual language across the app stays consistent.
          success:
            "!bg-[#ECFDF5] !text-[#047857] !border-[#A7F3D0] dark:!bg-[#052e1a] dark:!text-[#4ade80] dark:!border-[#064e3b]",
          warning:
            "!bg-[#FFFBEB] !text-[#92400E] !border-[#FCD34D] dark:!bg-[#451a03] dark:!text-[#fbbf24] dark:!border-[#78350F]",
          error:
            "!bg-[#FEF2F2] !text-[#B91C1C] !border-[#FCA5A5] dark:!bg-[#3F1212] dark:!text-[#fca5a5] dark:!border-[#7F1D1D]",
          info:
            "!bg-[#EFF6FF] !text-[var(--creed-accent-hover)] !border-[#BFDBFE] dark:!bg-[#0B1F4A] dark:!text-[#93C5FD] dark:!border-[#1E3A8A]",
        },
      }}
    />
  );
}
