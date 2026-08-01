// Branded first-load screen for a Creed. The mark turns one full revolution,
// eased from rest to rest, then holds before going again - a continuous spin
// reads as a generic loader, while the pause makes it feel deliberate.
//
// The logo is painted as a mask over --creed-text-primary rather than rendered
// as an <img>, so it takes the exact foreground colour in both themes and scales
// to any size without a second asset. No client JS - the animation is CSS
// (`creed-logo-spin` in globals.css), which is what lets this render inside a
// route-level loading.tsx.
//
// `delayed` holds the whole screen at zero opacity for a beat before fading it
// in, so a Creed that loads quickly never flashes a loader on the way past. Use
// it wherever the screen might not be needed at all (the route fallback); leave
// it off where the screen is already on show (the curtain's copy of it).

const logo = "/assets/brand/logo.svg";

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
          backgroundColor: "var(--creed-text-primary)",
          WebkitMaskImage: `url(${logo})`,
          maskImage: `url(${logo})`,
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
