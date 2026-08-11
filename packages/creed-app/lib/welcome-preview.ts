// Tiny client-side store for which welcome-tour variant the dev ⌘P shortcut
// should open. The app shell publishes the active space's variant (personal vs
// shared) as the user moves between Creeds; the single P listener (mounted at
// the root via WelcomeDevPreview) reads it on keypress so P shows the shared
// tour inside a shared space and the personal tour everywhere else. Dev-only in
// effect - nothing reads it in production.

export type WelcomeVariant = "personal" | "shared";

// Cache-buster for the tour's slide videos. /assets/* ships an immutable
// year-long Cache-Control, so replacing a clip in place never reaches
// returning browsers; bump this when a video file changes. Shared by the
// dialog and the preloader so the warmed URLs match the played ones.
export const WELCOME_MEDIA_VERSION = "3";

export function getWelcomeMediaBase(_key?: string) {
  return "/assets/popups/shared";
}

let current: WelcomeVariant = "personal";

export function setWelcomePreviewVariant(variant: WelcomeVariant) {
  current = variant;
}

export function getWelcomePreviewVariant(): WelcomeVariant {
  return current;
}
