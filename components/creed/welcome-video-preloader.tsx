"use client";

// Warms the browser cache with the welcome pop-up's slide videos so the tour
// never lands on a slide whose clip hasn't loaded. Rendered ahead of the pop-up
// (during onboarding, and again on app entry when the tour will show), it mounts
// hidden <video preload="auto"> elements that mirror the pop-up's own <video>
// (same URLs + source order), so those requests are served straight from cache.
//
// Keys mirror the SLIDES in welcome-dialog.tsx. Files live in
// /public/assets/popups/personal/<key>.mp4 (+ optional .webm).

const KEYS = ["file", "connect", "analysis", "panel", "tab", "discord"];
const MEDIA_BASE = "/assets/popups/personal";

export function WelcomeVideoPreloader() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed h-0 w-0 overflow-hidden opacity-0"
    >
      {KEYS.map((key) => (
        <video key={key} muted playsInline preload="auto" tabIndex={-1}>
          <source src={`${MEDIA_BASE}/${key}.webm`} type="video/webm" />
          <source src={`${MEDIA_BASE}/${key}.mp4`} type="video/mp4" />
        </video>
      ))}
    </div>
  );
}
