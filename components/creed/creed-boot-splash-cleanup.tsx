"use client";

import { useEffect } from "react";

// The splash is hidden by CSS as soon as the editor's markup exists, but the
// `creed-booting` flag would still be on <html> afterwards - so navigating to
// Settings, where that markup no longer exists, would bring it back. Clearing
// the flag once the editor has mounted makes the splash a one-shot for the
// document, which is all it was ever meant to be.
export function CreedBootSplashCleanup() {
  useEffect(() => {
    document.documentElement.classList.remove("creed-booting");
  }, []);

  return null;
}
