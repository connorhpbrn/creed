// Branded first-load screen for a Creed. The mark turns one full revolution,
// eased from rest to rest, then holds before going again - a continuous spin
// reads as a generic loader, while the pause makes it feel deliberate.
//
// The logo is painted as a mask over --creed-text-primary rather than rendered
// as an <img>, so it takes the exact foreground colour in both themes and scales
// to any size without a second asset. No client JS - the animation is CSS
// (`creed-logo-spin` in globals.css), which is what lets this render inside a
// route-level loading.tsx. CreedLoaderCurtain handles fading the screen out once
// the real content has arrived.

const logo = "/assets/brand/logo.svg";

export function CreedLoader({
  label = "Loading your Creed",
  size = 44,
}: {
  label?: string;
  size?: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full min-h-full w-full items-center justify-center bg-[var(--creed-surface)]"
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
