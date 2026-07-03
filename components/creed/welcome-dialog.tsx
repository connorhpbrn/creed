"use client";

// One-time welcome pop-up. Shown the first time a paid + onboarded user lands
// in the app (see app/(creed-app)/layout.tsx, which computes `show`). Six
// slides: what to do now, the features, what's coming, and a funnel into the
// Discord. "Skip" on the first slide jumps to the last slide, it is not a
// dismissal.
//
// Closing (X, Esc, overlay click, or the final Done button) marks the tour
// seen; clicking an inline link (roadmap, Discord) marks it seen too. Seen is
// persisted two ways: a POST to /api/welcome/seen (server truth, so it doesn't
// re-show on another device) and a localStorage mirror keyed to paid_at
// (anti-flash + covers a lost POST on this device). Keying on paid_at means a
// cancel -> re-buy naturally re-triggers the tour, since paid_at moves forward.
//
// Dev preview: press P (outside any text field) in development to open the tour
// on demand. It's mounted at the root via WelcomeDevPreview so P works on any
// page. A dev-preview open never marks the tour seen.
//
// Videos: each slide points at /assets/popups/personal/<key>.mp4 (+ .webm),
// warmed ahead of time (see WelcomeVideoPreloader). If a clip is missing the
// media frame shows a deliberate placeholder, so adding one is a drop-in swap.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";
import {
  Command,
  FileText,
  Gauge,
  Plug,
  TextCursorInput,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CommandIcon } from "@/components/ui/command";
import { ConnectIcon } from "@/components/ui/connect";
import { FileTextIcon } from "@/components/ui/file-text";
import { GaugeIcon } from "@/components/ui/gauge";
import { TextCursorInputIcon } from "@/components/ui/text-cursor-input";
import { DISCORD_URL } from "@/lib/branding";
import { fireWelcomeConfetti } from "@/lib/confetti";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "creed:welcomed";
const OPEN_DELAY_MS = 450;
const MEDIA_BASE = "/assets/popups/personal";
const IS_DEV = process.env.NODE_ENV !== "production";
const DISCORD_BLURPLE = "#5865F2";

// The app's inline-link style (see components/marketing/docs-page-view.tsx):
// brand blue, no underline, darkens on hover.
const LINK_CLASS =
  "font-medium text-[var(--creed-accent)] transition-colors hover:text-[var(--creed-accent-hover)]";

type Slide = {
  key: string;
  // Optional: the discord slide renders the Discord glyph instead of a lucide
  // icon, so it omits this. Every other slide sets it (used in the media chip).
  icon?: LucideIcon;
  title: string;
  body: ReactNode;
  hasVideo: boolean;
};

const SLIDES: Slide[] = [
  {
    key: "file",
    icon: FileText,
    title: "Your Creed is live",
    body: "Read it top to bottom, fix what the setup got wrong, and flesh out any thin sections.",
    hasVideo: true,
  },
  {
    key: "connect",
    icon: Plug,
    title: "Connect your agents",
    body: "Paste your MCP URL into any agent. They read your Creed and propose edits you approve.",
    hasVideo: true,
  },
  {
    key: "analysis",
    icon: Gauge,
    title: "Analysis keeps it sharp",
    body: "Every save gets scored, and vague, stale, or contradictory lines get flagged.",
    hasVideo: true,
  },
  {
    key: "panel",
    icon: Command,
    title: "Press K for anything",
    body: "Search your Creed, ask a question, or run the agent from anywhere. Tab switches modes.",
    hasVideo: true,
  },
  {
    key: "tab",
    icon: TextCursorInput,
    title: "Tab is coming",
    body: (
      <>
        It drafts the next line in your voice as you type.{" "}
        <a href="/roadmap" className={LINK_CLASS}>
          See the roadmap
        </a>{" "}
        for what is next.
      </>
    ),
    hasVideo: true,
  },
  {
    key: "discord",
    title: "Join the Discord",
    body: DISCORD_URL ? (
      <>
        We are building Creed out in the open forever.{" "}
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noreferrer"
          className={LINK_CLASS}
        >
          Join the Discord
        </a>{" "}
        to shape what ships next.
      </>
    ) : (
      "We are building Creed out in the open forever. Come shape what ships next."
    ),
    hasVideo: true,
  },
];

const LAST = SLIDES.length - 1;

function DiscordGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

// Shared handle shape for the app's animated icon components (connect, file).
type MorphHandle = { startAnimation: () => void; stopAnimation: () => void };

// Plays one of the lucide-animated morphing icons once on mount, then settles
// it back to rest.
type MorphKind = "file" | "connect" | "gauge" | "command" | "tab";

function MorphIcon({ kind }: { kind: MorphKind }) {
  const reduce = useReducedMotion();
  const ref = useRef<MorphHandle | null>(null);
  useEffect(() => {
    if (reduce) return;
    const start = window.setTimeout(() => ref.current?.startAnimation(), 240);
    const stop = window.setTimeout(() => ref.current?.stopAnimation(), 1300);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(stop);
    };
  }, [reduce]);
  switch (kind) {
    case "file":
      return <FileTextIcon ref={ref} size={26} />;
    case "connect":
      return <ConnectIcon ref={ref} size={26} />;
    case "gauge":
      return <GaugeIcon ref={ref} size={26} />;
    case "command":
      return <CommandIcon ref={ref} size={26} />;
    case "tab":
      return <TextCursorInputIcon ref={ref} size={26} />;
  }
}

// The icon to the left of each slide's title. Inherits the title colour (white
// in dark mode, dark in light so it stays visible) and springs in when the
// slide appears; file + connect additionally play their morph animation.
function SlideTitleIcon({ slide }: { slide: Slide }) {
  const reduce = useReducedMotion();

  let inner: ReactNode;
  if (slide.key === "file") {
    inner = <MorphIcon kind="file" />;
  } else if (slide.key === "connect") {
    inner = <MorphIcon kind="connect" />;
  } else if (slide.key === "analysis") {
    inner = <MorphIcon kind="gauge" />;
  } else if (slide.key === "panel") {
    inner = <MorphIcon kind="command" />;
  } else if (slide.key === "tab") {
    inner = <MorphIcon kind="tab" />;
  } else {
    // discord: not a lucide icon; the glyph rides the spring entrance below.
    inner = <DiscordGlyph className="h-[26px] w-[26px]" />;
  }

  return (
    <motion.div
      aria-hidden
      className="flex shrink-0 items-center text-[var(--creed-text-primary)]"
      initial={{
        scale: reduce ? 1 : 0.4,
        rotate: reduce ? 0 : -12,
        opacity: 0,
      }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={
        reduce
          ? { duration: 0.15 }
          : { type: "spring", stiffness: 480, damping: 17, delay: 0.06 }
      }
    >
      {inner}
    </motion.div>
  );
}

function MediaFrame({
  slide,
  lineVariants,
}: {
  slide: Slide;
  lineVariants: Variants;
}) {
  const [ready, setReady] = useState(false);
  const reduce = useReducedMotion();
  const Icon = slide.icon;
  const isDiscord = slide.key === "discord";
  const base = `${MEDIA_BASE}/${slide.key}`;
  // The redline annotation only makes sense where a video is expected, and only
  // in dev - real users never see file paths.
  const showRedline = IS_DEV && slide.hasVideo;

  return (
    <motion.div variants={lineVariants} className="px-7 pt-4 pb-0">
      <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-lg)] bg-[var(--creed-surface-raised)] ring-1 ring-inset ring-[var(--creed-border)]">
        {/* Whisper dot-grid, masked so it fades before the hairline ring. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-50 dark:opacity-40 [mask-image:radial-gradient(ellipse_75%_75%_at_50%_45%,black_40%,transparent_100%)]"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--creed-border-strong) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        {/* Centered icon chip, one elevation step above the plate. */}
        <div className="absolute inset-0 grid place-items-center">
          <div
            className="grid h-14 w-14 place-items-center rounded-[var(--radius-md)] bg-[var(--creed-surface)] ring-1 ring-[var(--creed-border)] transition-colors duration-[400ms] dark:ring-[var(--creed-border-strong)]"
            style={{
              color: isDiscord ? DISCORD_BLURPLE : "var(--creed-accent)",
            }}
          >
            {isDiscord ? (
              <DiscordGlyph className="h-7 w-7" />
            ) : Icon ? (
              <Icon className="h-6 w-6" strokeWidth={1.5} />
            ) : null}
          </div>
        </div>

        {/* Dev-only redline: a frosted mono pill naming aspect + path. */}
        {showRedline ? (
          <div className="absolute bottom-3 left-3 rounded-[var(--radius-sm)] bg-[var(--creed-surface)]/70 px-2 py-1 font-mono text-[11px] leading-[1.5] ring-1 ring-[var(--creed-border)] backdrop-blur-[2px] dark:ring-[var(--creed-border-strong)]">
            <div className="text-[var(--creed-text-tertiary)]">
              16:9 · placeholder
            </div>
            <div className="text-[var(--creed-text-secondary)]">
              /public/assets/popups/personal/{slide.key}.mp4
            </div>
          </div>
        ) : null}

        {slide.hasVideo ? (
          <video
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
              ready ? "opacity-100" : "opacity-0",
            )}
            autoPlay={!reduce}
            muted
            loop={!reduce}
            playsInline
            preload="auto"
            onCanPlay={() => setReady(true)}
            onError={() => setReady(false)}
          >
            <source src={`${base}.webm`} type="video/webm" />
            <source src={`${base}.mp4`} type="video/mp4" />
          </video>
        ) : null}
      </div>
    </motion.div>
  );
}

type WelcomeDialogProps = {
  show: boolean;
  paidAt: string | null;
  // When true (dev preview mount only), this instance listens for the P
  // shortcut. The in-app instance leaves it off so there's never a double
  // listener when both are mounted in development.
  previewHotkey?: boolean;
};

export function WelcomeDialog({
  show,
  paidAt,
  previewHotkey = false,
}: WelcomeDialogProps) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const reduce = useReducedMotion();

  const indexRef = useRef(0);
  const devPreviewRef = useRef(false);
  const seenRef = useRef(false);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // Celebrate on appearance: a bright poof of confetti from both screen edges
  // the moment the tour opens (they just paid + finished onboarding).
  //
  // The dialog's full-screen backdrop blur is what still makes the burst stutter
  // (the color picker fires with no blur and is perfectly smooth): compositing a
  // full-viewport animating canvas over a backdrop-filter forces it to re-run
  // per frame even with the canvas on its own GPU layer. blur-xs is only 2px, so
  // we drop it just for the ~1.4s the burst is on screen - imperceptible - and
  // restore it after, which removes the last of the lag.
  useEffect(() => {
    if (!open) return;
    fireWelcomeConfetti();
    if (reduce) return; // no confetti under reduced motion -> nothing to relax

    // Drop the overlay's backdrop blur for the burst. Query on the next frame
    // so Radix's portal has mounted, and use !important so it beats the
    // Tailwind backdrop-blur utility; removeProperty restores it after.
    let overlay: HTMLElement | null = null;
    const raf = requestAnimationFrame(() => {
      overlay = document.querySelector<HTMLElement>(
        '[data-slot="dialog-overlay"]'
      );
      overlay?.style.setProperty("backdrop-filter", "none", "important");
      overlay?.style.setProperty("-webkit-backdrop-filter", "none", "important");
    });
    const clearBlurOverride = () => {
      overlay?.style.removeProperty("backdrop-filter");
      overlay?.style.removeProperty("-webkit-backdrop-filter");
    };
    const restore = window.setTimeout(clearBlurOverride, 1500);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(restore);
      clearBlurOverride();
    };
  }, [open, reduce]);

  // Real first-run open: only when the server says to and this device hasn't
  // already dismissed it for the current paid_at.
  useEffect(() => {
    if (!show || !paidAt) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === paidAt) return;
    } catch {
      // localStorage unavailable (private mode): fall through and show.
    }
    const t = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => clearTimeout(t);
  }, [show, paidAt]);

  // Dev-only P shortcut to preview the tour on demand.
  useEffect(() => {
    if (!IS_DEV || !previewHotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "p" && e.key !== "P") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable ||
          t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT")
      ) {
        return;
      }
      e.preventDefault();
      devPreviewRef.current = true;
      seenRef.current = false;
      setIndex(0);
      setDir(1);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewHotkey]);

  const markSeen = useCallback(() => {
    if (devPreviewRef.current || seenRef.current) return;
    seenRef.current = true;
    try {
      if (paidAt) localStorage.setItem(STORAGE_KEY, paidAt);
    } catch {
      // ignore
    }
    void fetch("/api/welcome/seen", { method: "POST", keepalive: true }).catch(
      () => {},
    );
  }, [paidAt]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setOpen(true);
        return;
      }
      markSeen();
      setOpen(false);
      devPreviewRef.current = false;
    },
    [markSeen],
  );

  const goTo = useCallback((target: number) => {
    const clamped = Math.max(0, Math.min(LAST, target));
    setDir(clamped >= indexRef.current ? 1 : -1);
    setIndex(clamped);
  }, []);

  const slide = SLIDES[index];
  const isFirst = index === 0;
  const isLast = index === LAST;
  const offset = reduce ? 0 : 24;

  const slideVariants: Variants = {
    enter: (d: number) => ({ opacity: 0, x: d * offset }),
    center: {
      opacity: 1,
      x: 0,
      transition: {
        duration: reduce ? 0.15 : 0.28,
        ease: [0.32, 0.72, 0, 1],
        when: "beforeChildren",
        staggerChildren: reduce ? 0 : 0.04,
        delayChildren: reduce ? 0 : 0.02,
      },
    },
    exit: (d: number) => ({
      opacity: 0,
      x: d * -offset,
      transition: { duration: reduce ? 0.12 : 0.2, ease: [0.32, 0.72, 0, 1] },
    }),
  };

  const lineVariants: Variants = {
    enter: { opacity: 0, y: reduce ? 0 : 6 },
    center: {
      opacity: 1,
      y: 0,
      transition: { duration: reduce ? 0.15 : 0.3, ease: [0.32, 0.72, 0, 1] },
    },
    exit: { opacity: 0, transition: { duration: reduce ? 0.1 : 0.15 } },
  };

  const primaryBtn =
    "rounded-md bg-[var(--creed-accent)] text-white hover:bg-[var(--creed-accent-hover)]";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          "creed-scrollbar flex flex-col gap-0 overflow-x-hidden overflow-y-auto p-0",
          "w-[calc(100vw-1.5rem)] max-w-[700px] sm:w-[calc(100vw-2rem)]",
          "max-h-[calc(100dvh-2rem)]",
          "bg-[var(--creed-surface)]",
        )}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || (e.key === "Enter" && !isLast)) {
            e.preventDefault();
            goTo(indexRef.current + 1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            goTo(indexRef.current - 1);
          }
        }}
      >
        <DialogTitle className="sr-only">Welcome to Creed</DialogTitle>

        {/* Stage: grid so both slides share one cell during the crossfade and
            the dialog height simply follows the content (no dead space). */}
        <div className="grid overflow-x-hidden">
          <AnimatePresence initial={false} custom={dir}>
            <motion.div
              key={slide.key}
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="flex min-w-0 flex-col [grid-area:1/1]"
              onClick={(e) => {
                // Any inline link click (roadmap, Discord) counts as engaging
                // with the tour, so mark it seen. Discord opens a new tab and
                // does not close; roadmap navigates away.
                if ((e.target as HTMLElement).closest?.("a")) markSeen();
              }}
            >
              <motion.div
                variants={lineVariants}
                className="flex items-center gap-2.5 px-7 pt-5"
              >
                <SlideTitleIcon slide={slide} />
                <h2 className="font-heading text-[1.4rem] font-medium leading-tight tracking-[-0.02em] text-[var(--creed-text-primary)]">
                  {slide.title}
                </h2>
              </motion.div>
              <motion.p
                variants={lineVariants}
                className="mt-2.5 min-h-[3.2rem] max-w-[52ch] px-7 text-[15px] leading-[1.7] text-[var(--creed-text-secondary)]"
              >
                {slide.body}
              </motion.p>

              <MediaFrame slide={slide} lineVariants={lineVariants} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer: 3-column grid keeps the two buttons at fixed edges and the
            progress bar dead-centre, regardless of button widths. */}
        <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-6 py-5">
          <div className="justify-self-start">
            <Button
              variant="ghost"
              className="rounded-md"
              onClick={() => goTo(isFirst ? LAST : indexRef.current - 1)}
            >
              {isFirst ? "Skip" : "Back"}
            </Button>
          </div>

          <Dots index={index} onJump={goTo} />

          <div className="justify-self-end">
            {isLast ? (
              <Button
                onClick={() => handleOpenChange(false)}
                className={primaryBtn}
              >
                Done
              </Button>
            ) : (
              <Button
                onClick={() => goTo(indexRef.current + 1)}
                className={primaryBtn}
              >
                Continue
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Dots({
  index,
  onJump,
}: {
  index: number;
  onJump: (i: number) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Progress: step ${index + 1} of ${SLIDES.length}`}
      className="flex items-center justify-self-center gap-1.5"
    >
      {SLIDES.map((s, i) => {
        const current = i === index;
        const done = i < index;
        return (
          <button
            key={s.key}
            type="button"
            aria-label={`Go to step ${i + 1} of ${SLIDES.length}`}
            aria-current={current ? "step" : undefined}
            onClick={() => onJump(i)}
            className={cn(
              "h-[5px] rounded-[3px] outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[var(--creed-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--creed-surface)]",
              current
                ? "w-5 bg-[var(--creed-accent)]"
                : done
                  ? "w-2.5 bg-[var(--creed-accent)]/45"
                  : "w-2.5 bg-[var(--creed-border-strong)]",
            )}
          />
        );
      })}
    </div>
  );
}
