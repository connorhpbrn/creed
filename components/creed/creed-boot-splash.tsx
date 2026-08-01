import { CreedLoader } from "@/components/creed/creed-loader";

// The editor's boot screen, for the one case a route-level loading.tsx cannot
// reach: opening /file as a fresh document.
//
// That wait belongs to the (creed-app) layout - session, entitlement, Creed
// state - and an async layout's own await is covered by the boundary above it,
// not by its children's loading.tsx. There is no boundary above it that isn't
// also the marketing pages'. So this lives in the shell instead: markup that is
// already in the first bytes of the response, shown only when /theme-init.js has
// marked the document as an editor load, and removed the instant the editor's
// markup appears in the stream.
//
// Being CSS-driven from both ends is the point. Nothing here waits on
// hydration, so the splash can never reappear over an editor that has already
// painted - which is exactly how the curtain this replaces went wrong.
export function CreedBootSplash() {
  return (
    <div className="creed-boot-splash" aria-hidden="true">
      <CreedLoader />
    </div>
  );
}
