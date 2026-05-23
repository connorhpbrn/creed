"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

const allAgentsIcon = "/assets/agents/allagents.svg";
const brandmark = "/assets/brand/brandmark.svg";
const claudeCodeIcon = "/assets/agents/claudecode.svg";
const codexIcon = "/assets/agents/codex.svg";
const cursorIcon = "/assets/agents/cursor.svg";
const customAgentIcon = "/assets/agents/customagent.svg";
const hermesIcon = "/assets/agents/hermes.svg";
const logo = "/assets/brand/logo.svg";
const openClawIcon = "/assets/agents/openclaw.svg";
const openCodeIcon = "/assets/agents/opencode.svg";
const windsurfIcon = "/assets/agents/windsurf.svg";

export function CreedWordmark({
  className,
  imageClassName,
}: {
  className?: string;
  imageClassName?: string;
}) {
  return (
    <div className={cn("ml-1 h-[18px] shrink-0", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={brandmark}
        alt="Creed"
        width={80}
        height={18}
        decoding="async"
        style={{ shapeRendering: "geometricPrecision" }}
        className={cn("creed-invert-on-dark block h-full w-auto select-none", imageClassName)}
        draggable={false}
      />
    </div>
  );
}

export function CreedMark({ className }: { className?: string }) {
  return (
    <div className={cn("h-[18px] w-[18px] shrink-0", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo}
        alt="Creed"
        width={18}
        height={18}
        decoding="async"
        className="creed-invert-on-dark block h-[18px] w-[18px] select-none"
        draggable={false}
      />
    </div>
  );
}

// Type of every glyph the brand component knows how to render. Kept as
// a literal union (rather than a runtime object whose keys are read at
// type-time) so the value isn't constructed just to satisfy `keyof`.
type GlyphKind =
  | "claude"
  | "codex"
  | "openclaw"
  | "hermes"
  | "cursor"
  | "windsurf"
  | "opencode"
  | "mcp"
  | "custom";

const MONOCHROME_AGENTS = new Set<GlyphKind>([
  "cursor",
  "windsurf",
  "opencode",
  "custom",
  "mcp",
]);

const glyphBrandAssets = {
  claude: { src: claudeCodeIcon, imageClassName: "scale-[0.92]" },
  codex: { src: codexIcon, imageClassName: "scale-[0.92]" },
  openclaw: { src: openClawIcon, imageClassName: "scale-[0.92]" },
  hermes: { src: hermesIcon, imageClassName: "scale-[0.9]" },
  cursor: { src: cursorIcon, imageClassName: "scale-[0.9]" },
  windsurf: { src: windsurfIcon, imageClassName: "scale-[0.9]" },
  opencode: { src: openCodeIcon, imageClassName: "scale-[0.9]" },
  mcp: { src: allAgentsIcon, imageClassName: "scale-[0.9]" },
  custom: { src: customAgentIcon, imageClassName: "scale-[0.9]" },
} as const;

export function IntegrationGlyph({
  kind,
  className,
  iconClassName,
  assetClassName,
  framed = true,
}: {
  kind: GlyphKind;
  className?: string;
  iconClassName?: string;
  assetClassName?: string;
  framed?: boolean;
}) {
  const asset = glyphBrandAssets[kind as keyof typeof glyphBrandAssets] ?? null;

  return (
    <div
      className={cn(
        framed
          ? "flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--creed-border)] bg-[var(--creed-surface)] text-[var(--creed-text-primary)]"
          : "flex items-center justify-center text-[var(--creed-text-primary)]",
        className
      )}
    >
      {asset ? (
        <div className={cn("relative h-5 w-5", !framed && "h-9 w-9", assetClassName)}>
          <Image
            src={asset.src}
            alt=""
            fill
            sizes={framed ? "20px" : "36px"}
            unoptimized
            className={cn(
              "pointer-events-none select-none object-contain",
              // Monochrome agent assets read as black-on-light. Flip them to
              // white in dark mode so they don't disappear against the dark
              // canvas. Coloured brand assets (claude, codex, openclaw, hermes)
              // are skipped.
              MONOCHROME_AGENTS.has(kind) && "creed-invert-on-dark",
              asset.imageClassName,
              iconClassName
            )}
            draggable={false}
          />
        </div>
      ) : null}
    </div>
  );
}
