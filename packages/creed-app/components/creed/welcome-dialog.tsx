"use client";

// One-time welcome pop-up per Creed type. Shown the first time a Cloud-
// entitled user opens their first Personal Creed and again for their first
// Shared Creed they own (see app/(creed-app)/layout.tsx). Slides: what to do
// now, the features, what's coming, and a funnel into the Discord.
// "Skip" on the first slide jumps to the last slide, it is not a dismissal.
//
// Two variants:
//   personal - blue accent, 6 slides, videos from /assets/popups/shared.
//   shared  - amber accent (matching the Shared wordmark), same slides plus a
//              "members" slide in second position, also from /assets/popups/shared.
// The accent is a single CSS var (--tour-accent) set per variant on the dialog,
// so every accented element (button, dots, links, media chip) follows it.
//
// Closing (X, Esc, overlay click, or the final Done button) marks that type's
// tour seen; clicking an inline link (roadmap, Discord) marks it seen too.
// Cloud persists seen with POST /api/welcome/seen and a localStorage mirror.
// Open has no such route, so localStorage alone is enough on a single-owner install.
//
// Dev preview: press ⌘/Ctrl+P (outside any text field) in development, or pick
// it from the Cmd/Ctrl+D panel, to open the tour on demand. It reads the active
// space's variant (set by the app shell) so the preview shows the shared tour
// inside a shared space and the personal tour elsewhere. A dev-preview open
// never marks the tour seen.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { onDevPreviewRequest } from "@/lib/dev-preview";
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
  Users,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@creed/ui/dialog";
import { Button } from "@creed/ui/button";
import { CommandIcon } from "@creed/ui/command";
import { ConnectIcon } from "@creed/ui/connect";
import { FileTextIcon } from "@creed/ui/file-text";
import { GaugeIcon } from "@creed/ui/gauge";
import { TextCursorInputIcon } from "@creed/ui/text-cursor-input";
import { UsersIcon } from "@creed/ui/users";
import { DISCORD_URL } from "@/lib/branding";
import { fireWelcomeConfetti } from "@/lib/confetti";
import {
  getWelcomePreviewVariant,
  WELCOME_MEDIA_VERSION,
  getWelcomeMediaBase,
  type WelcomeVariant,
} from "@/lib/welcome-preview";
import { cn } from "@creed/ui/utils";
import { useCreedEdition } from "@/components/creed/edition-provider";

const STORAGE_KEY_PREFIX = "creed:welcomed";
const OPEN_DELAY_MS = 450;
const IS_DEV = process.env.NODE_ENV !== "production";
const DISCORD_BLURPLE = "#5865F2";

function welcomeStorageKey(variant: WelcomeVariant) {
  return `${STORAGE_KEY_PREFIX}:${variant}`;
}

// Inline-link style: follows the tour's accent, no underline, darkens on hover.
const LINK_CLASS =
  "font-medium text-[var(--tour-accent)] transition-colors hover:text-[var(--tour-accent-hover)]";

type Slide = {
  key: string;
  // Optional: the discord slide renders the Discord glyph instead of a lucide
  // icon, so it omits this. Every other slide sets it (used in the media chip).
  icon?: LucideIcon;
  title: string;
  body: ReactNode;
  hasVideo: boolean;
};

const PERSONAL_SLIDES: Slide[] = [
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
    title: "Tab finishes the thought",
    body: "Press Tab in any section and it completes the line in your voice, drawn from your whole Creed.",
    hasVideo: true,
  },
  {
    key: "discord",
    title: "Join the Discord",
    body: (
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
    ),
    hasVideo: true,
  },
];

// The shared-only slide, shown second (right after "Your Creed is live").
const MEMBERS_SLIDE: Slide = {
  key: "members",
  icon: Users,
  title: "Invite your team",
  body: "Add members, set roles, and choose what each person can read, propose, or edit.",
  hasVideo: true,
};

const SHARED_SLIDES: Slide[] = [
  PERSONAL_SLIDES[0],
  MEMBERS_SLIDE,
  ...PERSONAL_SLIDES.slice(1),
];

function slidesFor(variant: WelcomeVariant): Slide[] {
  return variant === "shared" ? SHARED_SLIDES : PERSONAL_SLIDES;
}

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

// Shared handle shape for the app's animated icon components.
type MorphHandle = { startAnimation: () => void; stopAnimation: () => void };

// Plays one of the lucide-animated morphing icons once on mount, then settles
// it back to rest.
type MorphKind = "file" | "connect" | "gauge" | "command" | "tab" | "users";

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
    case "users":
      return <UsersIcon ref={ref} size={26} />;
  }
}

// The icon to the left of each slide's title. Inherits the title colour and
// springs in when the slide appears; the morphing icons also play once.
function SlideTitleIcon({ slide }: { slide: Slide }) {
  const reduce = useReducedMotion();

  let inner: ReactNode;
  if (slide.key === "file") {
    inner = <MorphIcon kind="file" />;
  } else if (slide.key === "members") {
    inner = <MorphIcon kind="users" />;
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
  const base = `${getWelcomeMediaBase(slide.key)}/${slide.key}`;
  // The redline annotation only makes sense where a video is expected, and only
  // in dev - real users never see file paths.
  const showRedline = IS_DEV && slide.hasVideo;

  return (
    <motion.div variants={lineVariants} className="px-7 pt-4 pb-0">
      {/* max-h caps the 16:9 frame on short viewports so the whole dialog
          fits inside its max-h instead of growing a scrollbar; 394px is the
          frame's natural height at the dialog's 700px max width, so normal
          screens are unaffected. Everything inside is absolutely positioned
          (object-cover video, centered chip), so it degrades to a crop. */}
      <div className="relative aspect-video max-h-[min(45dvh,394px)] w-full overflow-hidden rounded-[var(--radius-lg)] bg-[var(--creed-surface-raised)] ring-1 ring-inset ring-[var(--creed-border)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-50 dark:opacity-40 [mask-image:radial-gradient(ellipse_75%_75%_at_50%_45%,black_40%,transparent_100%)]"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--creed-border-strong) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="absolute inset-0 grid place-items-center">
          <div
            className="grid h-14 w-14 place-items-center rounded-[var(--radius-md)] bg-[var(--creed-surface)] ring-1 ring-[var(--creed-border)] transition-colors duration-[400ms] dark:ring-[var(--creed-border-strong)]"
            style={{
              color: isDiscord ? DISCORD_BLURPLE : "var(--tour-accent)",
            }}
          >
            {isDiscord ? (
              <DiscordGlyph className="h-7 w-7" />
            ) : Icon ? (
              <Icon className="h-6 w-6" strokeWidth={1.5} />
            ) : null}
          </div>
        </div>

        {showRedline ? (
          <div className="absolute bottom-3 left-3 rounded-[var(--radius-sm)] bg-[var(--creed-surface)]/70 px-2 py-1 font-mono text-[11px] leading-[1.5] ring-1 ring-[var(--creed-border)] backdrop-blur-[2px] dark:ring-[var(--creed-border-strong)]">
            <div className="text-[var(--creed-text-tertiary)]">
              16:9 · placeholder
            </div>
            <div className="text-[var(--creed-text-secondary)]">
              {base}.mp4
            </div>
          </div>
        ) : null}

        {slide.hasVideo ? (
          <video
            key={base}
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
            <source src={`${base}.webm?v=${WELCOME_MEDIA_VERSION}`} type="video/webm" />
            <source src={`${base}.mp4?v=${WELCOME_MEDIA_VERSION}`} type="video/mp4" />
          </video>
        ) : null}
      </div>
    </motion.div>
  );
}

type WelcomeDialogProps = {
  show: boolean;
  paidAt: string | null;
  // The active space's variant, driving colour + slides + media folder.
  variant?: WelcomeVariant;
  // When true (dev preview mount only), this instance listens for ⌘/Ctrl+P.
  // The in-app instance leaves it off so there's never a double listener when
  // both are mounted in development.
  previewHotkey?: boolean;
};

export function WelcomeDialog({
  show,
  paidAt,
  variant: variantProp = "personal",
  previewHotkey = false,
}: WelcomeDialogProps) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  // The live variant: the prop for a real open, or the active space's variant
  // (read from the store) when opened via the dev ⌘P shortcut.
  const [variant, setVariant] = useState<WelcomeVariant>(variantProp);
  const persistWelcomeOnServer = useCreedEdition().capabilities.hostedAccounts;
  const reduce = useReducedMotion();

  const indexRef = useRef(0);
  const devPreviewRef = useRef(false);
  const seenRef = useRef(false);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // Keep a real (non-preview) instance in step with the space it's mounted for.
  useEffect(() => {
    if (!devPreviewRef.current) setVariant(variantProp);
  }, [variantProp]);

  const slides = slidesFor(variant);
  const last = slides.length - 1;

  // Celebrate on appearance: a bright poof of confetti the moment the tour
  // opens. The overlay's backdrop blur is left alone so it fades in with the
  // pop-up (like every other dialog) instead of popping in a beat later.
  useEffect(() => {
    if (!open) return;
    fireWelcomeConfetti();
  }, [open]);

  // Real first-run open: only when the server says to and this device hasn't
  // already dismissed this Creed-type tour for the current paid_at.
  useEffect(() => {
    if (!show || !paidAt) return;
    try {
      if (localStorage.getItem(welcomeStorageKey(variant)) === paidAt) return;
    } catch {
      // localStorage unavailable (private mode): fall through and show.
    }
    seenRef.current = false;
    const t = setTimeout(() => {
      setIndex(0);
      setDir(1);
      setOpen(true);
    }, OPEN_DELAY_MS);
    return () => clearTimeout(t);
  }, [show, paidAt, variant]);

  // Dev-only open: ⌘/Ctrl+P, or a request from the Cmd/Ctrl+D panel.
  useEffect(() => {
    if (!IS_DEV || !previewHotkey) return;

    const openPreview = () => {
      devPreviewRef.current = true;
      seenRef.current = false;
      setVariant(getWelcomePreviewVariant());
      setIndex(0);
      setDir(1);
      setOpen(true);
    };

    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.repeat) {
        return;
      }
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
      openPreview();
    };

    window.addEventListener("keydown", onKey);
    const unsubscribe = onDevPreviewRequest((id) => {
      if (id === "welcome") openPreview();
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      unsubscribe();
    };
  }, [previewHotkey]);

  const markSeen = useCallback(() => {
    if (devPreviewRef.current || seenRef.current) return;
    seenRef.current = true;
    try {
      if (paidAt) localStorage.setItem(welcomeStorageKey(variant), paidAt);
    } catch {
      // ignore
    }
    if (!persistWelcomeOnServer) return;
    void fetch("/api/welcome/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variant }),
      keepalive: true,
    }).catch(() => {});
  }, [paidAt, persistWelcomeOnServer, variant]);

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

  const goTo = useCallback(
    (target: number) => {
      const clamped = Math.max(0, Math.min(last, target));
      setDir(clamped >= indexRef.current ? 1 : -1);
      setIndex(clamped);
    },
    [last],
  );

  const slide = slides[Math.min(index, last)];
  const isFirst = index === 0;
  const isLast = index === last;
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
    "rounded-md bg-[var(--tour-accent)] text-white hover:bg-[var(--tour-accent-hover)]";

  // The tour's accent as a CSS var, set per variant so every accented element
  // (button, dots, links, media chip) follows it. Shared is amber, matching the
  // "Shared" wordmark; personal falls back to the app's blue accent.
  const accentVars =
    variant === "shared"
      ? "[--tour-accent:#F59E0B] [--tour-accent-hover:#D97706] dark:[--tour-accent:#F5A623] dark:[--tour-accent-hover:#E0951E]"
      : "[--tour-accent:var(--creed-accent)] [--tour-accent-hover:var(--creed-accent-hover)]";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          "creed-scrollbar flex flex-col gap-0 overflow-x-hidden overflow-y-auto p-0",
          "w-[calc(100vw-1.5rem)] max-w-[700px] sm:w-[calc(100vw-2rem)]",
          "max-h-[calc(100dvh-2rem)]",
          "bg-[var(--creed-surface)]",
          accentVars,
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
              onClick={() => goTo(isFirst ? last : indexRef.current - 1)}
            >
              {isFirst ? "Skip" : "Back"}
            </Button>
          </div>

          <Dots index={index} slides={slides} onJump={goTo} />

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
  slides,
  onJump,
}: {
  index: number;
  slides: Slide[];
  onJump: (i: number) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Progress: step ${index + 1} of ${slides.length}`}
      className="flex items-center justify-self-center gap-1.5"
    >
      {slides.map((s, i) => {
        const current = i === index;
        const done = i < index;
        return (
          <button
            key={s.key}
            type="button"
            aria-label={`Go to step ${i + 1} of ${slides.length}`}
            aria-current={current ? "step" : undefined}
            onClick={() => onJump(i)}
            className={cn(
              "h-[5px] rounded-[3px] outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[var(--tour-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--creed-surface)]",
              current
                ? "w-5 bg-[var(--tour-accent)]"
                : done
                  ? "w-2.5 bg-[var(--tour-accent)]/45"
                  : "w-2.5 bg-[var(--creed-border-strong)]",
            )}
          />
        );
      })}
    </div>
  );
}
