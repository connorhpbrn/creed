"use client";

// Warms the browser cache with the welcome pop-up's slide videos so the tour
// never lands on a slide whose clip hasn't loaded. Rendered ahead of the pop-up
// (during onboarding, and again on app entry when the tour will show), it mounts
// hidden <video preload="auto"> elements that mirror the pop-up's own <video>
// (same URLs + source order), so those requests are served straight from cache.
//
// Keys mirror the SLIDES in welcome-dialog.tsx. Files live in
// Shared clips live once under /public/assets/popups/shared. The company-only
// members clip remains under /company.

import {
  WELCOME_MEDIA_VERSION,
  getWelcomeMediaBase,
  type WelcomeVariant,
} from "@/lib/welcome-preview";

const PERSONAL_KEYS = ["file", "connect", "analysis", "panel", "tab", "discord"];
const COMPANY_KEYS = ["file", "members", "connect", "analysis", "panel", "tab", "discord"];

export function WelcomeVideoPreloader({
  variant = "personal",
}: {
  variant?: WelcomeVariant;
}) {
  const keys = variant === "company" ? COMPANY_KEYS : PERSONAL_KEYS;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed h-0 w-0 overflow-hidden opacity-0"
    >
      {keys.map((key) => (
        <video key={key} muted playsInline preload="metadata" tabIndex={-1}>
          <source src={`${getWelcomeMediaBase(key)}/${key}.webm?v=${WELCOME_MEDIA_VERSION}`} type="video/webm" />
          <source src={`${getWelcomeMediaBase(key)}/${key}.mp4?v=${WELCOME_MEDIA_VERSION}`} type="video/mp4" />
        </video>
      ))}
    </div>
  );
}
