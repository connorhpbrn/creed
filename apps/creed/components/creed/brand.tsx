"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

const allAgentsIcon = "/assets/agents/all.svg";
const mcpIcon = "/assets/agents/mcp.svg";
const cliIcon = "/assets/agents/cli.svg";
const brandmark = "/assets/brand/brandmark.svg";
const chatgptIcon = "/assets/agents/chatgpt.svg";
const claudeIcon = "/assets/agents/claude.svg";
const claudeCodeIcon = "/assets/agents/claudecode.svg";
const codexIcon = "/assets/agents/codex.svg";
const cursorIcon = "/assets/agents/cursor.svg";
const customAgentIcon = "/assets/agents/customagent.svg";
const devinIcon = "/assets/agents/devin.svg";
const replitIcon = "/assets/agents/replit.svg";
const whirlIcon = "/assets/agents/whirl.svg";
const grokIcon = "/assets/agents/grok.svg";
const hermesIcon = "/assets/agents/hermes.svg";
const factoryIcon = "/assets/agents/factory.svg";
const manusIcon = "/assets/agents/manus.svg";
const logo = "/assets/brand/logo.svg";
const openClawIcon = "/assets/agents/openclaw.svg";
const openCodeIcon = "/assets/agents/opencode.svg";
const v0Icon = "/assets/agents/v0.svg";

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

// The Creed brandmark rendered in brand blue, for the in-app "Creed" agent's
// identity on proposal cards and activity rows. The logo SVG is used as a mask
// over a solid accent fill, so the shape reads as exactly --creed-accent in
// both themes (a plain <img> can't be recoloured to an exact hue).
export function CreedAgentGlyph({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Creed"
      className={cn("block shrink-0", className)}
      style={{
        backgroundColor: "var(--creed-accent)",
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
  );
}

// Type of every glyph the brand component knows how to render. Kept as
// a literal union (rather than a runtime object whose keys are read at
// type-time) so the value isn't constructed just to satisfy `keyof`.
type GlyphKind =
  | "claude"
  | "claudecode"
  | "codex"
  | "chatgpt"
  | "cursor"
  | "replit"
  | "devin"
  | "whirl"
  | "grok"
  | "v0"
  | "opencode"
  | "openclaw"
  | "hermes"
  | "factory"
  | "manus"
  | "mcp"
  | "cli"
  | "all"
  | "custom";

const MONOCHROME_AGENTS = new Set<GlyphKind>([
  "chatgpt",
  "cursor",
  "devin",
  "grok",
  "v0",
  "opencode",
  "factory",
  "manus",
  "custom",
  "mcp",
  "cli",
  "all",
]);

const glyphBrandAssets = {
  claude: { src: claudeIcon, imageClassName: "scale-[0.92]" },
  claudecode: { src: claudeCodeIcon, imageClassName: "scale-[0.92]" },
  codex: { src: codexIcon, imageClassName: "scale-[0.92]" },
  chatgpt: { src: chatgptIcon, imageClassName: "scale-[0.9]" },
  cursor: { src: cursorIcon, imageClassName: "scale-[0.9]" },
  replit: { src: replitIcon, imageClassName: "scale-[0.9]" },
  devin: { src: devinIcon, imageClassName: "scale-[0.9]" },
  whirl: { src: whirlIcon, imageClassName: "scale-[0.9]" },
  grok: { src: grokIcon, imageClassName: "scale-[0.9]" },
  v0: { src: v0Icon, imageClassName: "scale-[0.9]" },
  opencode: { src: openCodeIcon, imageClassName: "scale-[0.9]" },
  openclaw: { src: openClawIcon, imageClassName: "scale-[0.9]" },
  hermes: { src: hermesIcon, imageClassName: "scale-[0.9]" },
  factory: { src: factoryIcon, imageClassName: "scale-[0.9]" },
  manus: { src: manusIcon, imageClassName: "scale-[0.9]" },
  mcp: { src: mcpIcon, imageClassName: "scale-[0.9]" },
  cli: { src: cliIcon, imageClassName: "scale-[0.9]" },
  all: { src: allAgentsIcon, imageClassName: "scale-[0.9]" },
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
          ? "flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] text-[var(--creed-text-primary)]"
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
              // canvas. Coloured brand assets (claude, claudecode, codex,
              // openclaw, hermes) are skipped.
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
