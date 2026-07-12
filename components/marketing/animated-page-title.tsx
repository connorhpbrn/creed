import { cn } from "@/lib/utils";

type AnimatedHeadingProps = {
  text: string;
  className?: string;
};

// Page titles (and the auth screens) used to play a per-glyph blur-in. That
// letter-by-letter animation now lives only on the landing hero and onboarding.
// These render plainly; on marketing pages the surrounding content fade carries
// the entrance instead.
//
// The canonical marketing h1 style is baked in so every page stays on the
// same type scale; call sites pass only extras (e.g. `max-w-3xl`).
export function AnimatedPageTitle({ text, className }: AnimatedHeadingProps) {
  const lines = text.split("\n");
  return (
    <h1 className={cn("t-section text-[var(--creed-text-primary)]", className)}>
      {lines.map((line, index) => (
        <span key={`${line}-${index}`} className="block">
          {line}
        </span>
      ))}
    </h1>
  );
}

export function AnimatedSectionHeading({ text, className }: AnimatedHeadingProps) {
  const lines = text.split("\n");
  return (
    <h2 className={className}>
      {lines.map((line, index) => (
        <span key={`${line}-${index}`} className="block">
          {line}
        </span>
      ))}
    </h2>
  );
}
