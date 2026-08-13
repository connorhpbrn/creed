export function DocsLogo({ className = "h-7 w-auto" }: { className?: string }) {
  const mask = {
    WebkitMaskImage: "url(/assets/brand/docs.svg)",
    maskImage: "url(/assets/brand/docs.svg)",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
    maskSize: "contain",
  };

  return (
    <span
      role="img"
      aria-label="Creed Docs"
      className={`relative block aspect-[872/244] ${className}`}
    >
      <span className="absolute inset-0 bg-[var(--creed-text-primary)]" style={mask} />
      <span
        className="absolute inset-0 bg-[var(--creed-accent)] [clip-path:inset(0_81.9%_0_0)]"
        style={mask}
      />
    </span>
  );
}
