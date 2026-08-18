// Branded loading screen for a Creed. The mark turns one full revolution, eased
// from rest to rest, then holds before going again - a continuous spin reads as
// a generic loader, while the pause makes it feel deliberate.
//
// NOT WIRED TO ANY ROUTE. Kept for a future loading state; press ⌘/Ctrl+L (or
// pick it from the Cmd/Ctrl+D panel) in development to see it
// (components/creed/welcome-dev-preview.tsx).
//
// Two things worth knowing before putting it in front of people again, both
// learned the hard way:
//
//   - A route-level loading.tsx only covers its own segment's page. The wait
//     that matters for /file belongs to the (creed-app) layout - session,
//     entitlement, Creed state - and an async layout's own await is covered by
//     the boundary above it, which is also the marketing pages'. A loading.tsx
//     under /file therefore covers the editor's render only, which is usually
//     too fast to see.
//   - Anything that covers the editor after the fact - a curtain mounted on
//     hydration, a shell splash lifted on a signal that arrives mid-stream -
//     will sooner or later paint over content the reader can already see. The
//     trigger has to be something that cannot fire late.
//
// The mark is painted as a mask over the brand-mark blue rather than rendered
// as an <img>, so it matches the wordmark's icon on a solid surface and scales
// without a second asset. No client JS - the animation is CSS
// (`creed-logo-spin` in globals.css), so it can render in a server-only
// fallback.
//
// `delayed` holds the whole screen at zero opacity for a beat before fading it
// in, so a Creed that loads quickly never flashes a loader on the way past. Use
// it wherever the screen might not be needed at all; leave it off where the
// screen is already on show.

const icon = "/assets/brand/icon.svg";

export function CreedLoader({
  label = "Loading your Creed",
  size = 44,
  delayed = false,
}: {
  label?: string;
  size?: number;
  delayed?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex h-full min-h-full w-full items-center justify-center bg-[var(--creed-surface)]${
        delayed ? " creed-loader-appear" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className="creed-logo-spin block shrink-0"
        style={{
          height: size,
          width: size,
          backgroundColor: "#0066FF",
          WebkitMaskImage: `url(${icon})`,
          maskImage: `url(${icon})`,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          WebkitMaskSize: "contain",
          maskSize: "contain",
        }}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
