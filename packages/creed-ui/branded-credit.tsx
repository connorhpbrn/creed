import type { CSSProperties } from "react";
import { cn } from "@creed/ui/utils";

export function BrandedCredit({
  accent,
  className,
  style,
}: {
  accent: string;
  className?: string;
  style?: CSSProperties;
}) {
  const linkStyle = { color: accent };

  return (
    <footer
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] leading-[1.55]",
        className,
      )}
      style={style}
    >
      <span>© 2026</span>
      <a
        href="https://creed.md"
        className="font-medium transition-opacity hover:opacity-70"
        style={linkStyle}
      >
        Creed
      </a>
      <span aria-hidden="true">·</span>
      <span>by</span>
      <a
        href="https://hpbrn.cc"
        target="_blank"
        rel="noreferrer"
        className="font-medium transition-opacity hover:opacity-70"
        style={linkStyle}
      >
        hpbrn
      </a>
    </footer>
  );
}
