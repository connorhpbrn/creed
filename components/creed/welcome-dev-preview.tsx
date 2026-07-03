"use client";

// Dev-only mount for the welcome tour's P preview shortcut. Lives at the root
// layout so pressing P works on any page in development - including /pricing
// and /home, where the real (creed-app) instance isn't mounted because the
// entitlement gate hasn't let you in. Renders nothing in production.
import { WelcomeDialog } from "@/components/creed/welcome-dialog";
import { WelcomeVideoPreloader } from "@/components/creed/welcome-video-preloader";

export function WelcomeDevPreview() {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <>
      {/* Preload the clips so the P preview never lands on an unloaded slide. */}
      <WelcomeVideoPreloader />
      <WelcomeDialog show={false} paidAt={null} previewHotkey />
    </>
  );
}
