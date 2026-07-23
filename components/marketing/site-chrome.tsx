"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { SceneryImage } from "@/components/marketing/scenery-image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronLeft, Star } from "lucide-react";
import { MenuIcon } from "@/components/ui/menu";
import { CreedWordmark } from "@/components/creed/brand";
import { SystemStatusPill } from "@/components/marketing/system-status";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { ArrowRightIcon } from "@/components/ui/arrow-right";
import { useLandingAuthState } from "@/components/marketing/use-landing-auth-state";
import { useGitHubStars } from "@/components/marketing/use-github-stars";
import { CREED_TAGLINE } from "@/lib/marketing/brand";
import { cn } from "@/lib/utils";

import {
  CONTACT_MAILTO,
  DISCORD_URL,
  GITHUB_URL,
  HPBRN_URL,
  INSTAGRAM_URL,
  TWITTER_URL,
} from "@/lib/branding";

type NavItem = { label: string; href: string };

// Header nav groups. Mirror the footer's Product / Legal / Resources columns so
// the two stay in lockstep; each renders as a dropdown in the desktop chrome.
const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Product",
    items: [
      { label: "Pricing", href: "/pricing" },
      { label: "Company", href: "/company" },
      { label: "Examples", href: "/examples" },
      { label: "Roadmap", href: "/roadmap" },
    ],
  },
  {
    label: "Resources",
    items: [
      { label: "Docs", href: "/docs" },
      { label: "Learn", href: "/learn" },
      { label: "Bench", href: "/bench" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    label: "Legal",
    items: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Stack", href: "/stack" },
      { label: "Contact", href: CONTACT_MAILTO },
    ],
  },
];

const lightHeroImage = "/assets/landing/scenery/light-hero.png";
const darkHeroImage = "/assets/landing/scenery/dark-hero.png";

// Shared hero banner for the inner marketing pages (pricing, docs, privacy,
// terms, stack). Full-bleed art (no framed card) with the page background
// fading over the lower edge, matching the landing hero treatment.
export function MarketingHeroBanner({
  configured,
  scrolled,
}: {
  configured: boolean;
  scrolled: boolean;
}) {
  return (
    <section className="relative bg-[var(--creed-background)]">
      <div className="relative h-[15rem] overflow-hidden md:h-[18rem]">
        {/* The image covers a reference box matching the landing hero (same
            full-bleed height) so the artwork scales identically; the banner
            just windows the top slice of it. */}
        <div className="absolute inset-x-0 top-0 h-[94svh]">
          <SceneryImage
            src={lightHeroImage}
            fileName="light-hero.png"
            label="Light hero"
            priority
            className="dark:hidden"
          />
          <SceneryImage
            src={darkHeroImage}
            fileName="dark-hero.png"
            label="Dark hero"
            className="hidden dark:block"
          />
        </div>
        {/* Top wash keeps the white header legible over the art. */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,31,60,0.16)_0%,rgba(15,31,60,0.08)_28%,rgba(15,31,60,0.05)_56%,rgba(255,255,255,0)_76%)] dark:bg-[linear-gradient(180deg,rgba(0,0,0,0.32)_0%,rgba(0,0,0,0.18)_28%,rgba(0,0,0,0.08)_56%,rgba(0,0,0,0)_76%)]" />
        {/* Bottom fade melts the art into the page background. Eased multi-stop
            gradient so the transition reads smooth, not banded. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5"
          style={{ backgroundImage: "var(--scenery-fade-down)" }}
        />
        <div className="relative z-10 flex flex-col px-6 py-5 md:px-10 md:py-7">
          <MarketingHeader configured={configured} scrolled={scrolled} />
        </div>
      </div>
    </section>
  );
}

export function MarketingHeader({
  configured,
  scrolled,
}: {
  configured: boolean;
  scrolled: boolean;
}) {
  void scrolled;
  const authState = useLandingAuthState(configured);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Which mobile dropdown row is expanded (one at a time).
  const [openMobileGroup, setOpenMobileGroup] = useState<string | null>(null);
  // Sticky-header morph: once scrolled past the hero's top edge the header
  // condenses into a rounded bar using the in-app surface material.
  const [isScrolled, setIsScrolled] = useState(false);
  const stickyChromeActive = isScrolled || mobileMenuOpen;

  useEffect(() => {
    function onScroll() {
      const nextIsScrolled = window.scrollY > 64;
      setIsScrolled(nextIsScrolled);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) {
      setOpenMobileGroup(null);
      return;
    }

    function closeOnScroll() {
      setMobileMenuOpen(false);
    }

    window.addEventListener("scroll", closeOnScroll, { passive: true });
    return () => window.removeEventListener("scroll", closeOnScroll);
  }, [mobileMenuOpen]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-3 md:px-4 md:pt-4">
      <div
        className={cn(
          "pointer-events-auto relative mx-auto w-full transition-[max-width] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          stickyChromeActive ? "max-w-[800px]" : "max-w-[880px]",
        )}
      >
        {/* The sticky surface stays behind the chrome. On mobile it extends
            from that same rounded card to contain the open navigation menu. */}
        <motion.div
          aria-hidden="true"
          initial={false}
          animate={{ height: mobileMenuOpen ? "18rem" : "100%" }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 drop-shadow-[0_10px_18px_rgba(0,0,0,0.16)]",
            stickyChromeActive ? "opacity-100" : "opacity-0",
          )}
        >
          <div className="absolute inset-0 rounded-xl bg-[var(--creed-surface)]" />
        </motion.div>
        <header
          className={cn(
            "relative z-10 flex w-full items-center justify-between transition-[padding] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            stickyChromeActive ? "py-1.5 pl-4 pr-1.5" : "px-1 py-1",
          )}
        >
      <div className="flex items-center md:hidden">
        <Link
          href="/home"
          aria-label="Creed home"
          className="shrink-0 transition-opacity duration-200 hover:opacity-60"
          onClick={() => setMobileMenuOpen(false)}
        >
          <CreedWordmark
            className="ml-1.5"
            imageClassName={stickyChromeActive ? undefined : "invert brightness-0"}
          />
        </Link>
      </div>

      <Link
        href="/home"
        aria-label="Creed home"
        className="hidden shrink-0 transition-opacity duration-200 hover:opacity-60 md:block"
      >
        <CreedWordmark className="ml-0" imageClassName={stickyChromeActive ? undefined : "invert brightness-0"} />
      </Link>

      <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
        {navGroups.map((group) => (
          <HeaderDropdown
            key={group.label}
            label={group.label}
            items={group.items}
            align="left"
            scrolled={stickyChromeActive}
          />
        ))}
      </nav>

      <HeaderAuthActions
        authState={authState}
        scrolled={stickyChromeActive}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      <AnimatePresence initial={false}>
        {mobileMenuOpen ? (
          <div className="contents md:hidden">
            {/* Invisible outside-tap layer. The header and its extended surface
                sit above it, so the brand and menu button remain visible. */}
            <motion.button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-0 bg-transparent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="absolute right-2 top-[4rem] z-10 flex flex-col items-end gap-2 text-[var(--creed-text-primary)]"
            >
              {navGroups.map((group, gIndex) => (
                <motion.div
                  key={group.label}
                  className="relative z-10"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{
                    opacity: 0,
                    x: 10,
                    transition: {
                      duration: 0.24,
                      delay: (navGroups.length + 1 - gIndex) * 0.04,
                      ease: [0.22, 1, 0.36, 1],
                    },
                  }}
                  transition={{
                    duration: 0.24,
                    delay: 0.04 + gIndex * 0.05,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <MobileNavRow
                    label={group.label}
                    items={group.items}
                    open={openMobileGroup === group.label}
                    onToggle={() =>
                      setOpenMobileGroup((cur) =>
                        cur === group.label ? null : group.label,
                      )
                    }
                    onNavigate={() => setMobileMenuOpen(false)}
                  />
                </motion.div>
              ))}

              {authState !== "loading" ? (
                <motion.div
                  className="relative z-10"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{
                    opacity: 0,
                    x: 10,
                    transition: { duration: 0.24, delay: 0.04, ease: [0.22, 1, 0.36, 1] },
                  }}
                  transition={{
                    duration: 0.24,
                    delay: 0.04 + navGroups.length * 0.05,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <MobileNavRow
                    label="Start"
                    items={
                      authState === "signed-in"
                        ? [{ label: "Continue", href: "/file" }]
                        : [
                            { label: "Login", href: "/login" },
                            { label: "Sign up", href: "/signup" },
                          ]
                    }
                    open={openMobileGroup === "Start"}
                    onToggle={() =>
                      setOpenMobileGroup((cur) => (cur === "Start" ? null : "Start"))
                    }
                    onNavigate={() => setMobileMenuOpen(false)}
                  />
                </motion.div>
              ) : null}

              {authState !== "loading" ? (
                <motion.div
                  className="relative z-10 mt-1"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{
                    opacity: 0,
                    x: 10,
                    transition: { duration: 0.24, delay: 0, ease: [0.22, 1, 0.36, 1] },
                  }}
                  transition={{
                    duration: 0.24,
                    delay: 0.04 + (navGroups.length + 1) * 0.05,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <GitHubStarButton
                    scrolled
                    onNavigate={() => setMobileMenuOpen(false)}
                  />
                </motion.div>
              ) : null}
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
        </header>
      </div>
    </div>
  );
}

// `useLandingAuthState` now lives in components/marketing/use-landing-auth-state.ts
// so both the chrome and the pricing card share the same auth listener
// rather than each spinning up their own.

// Circular (solid) GitHub mark for the star pill - the filled logo rather than
// the line-art octocat.
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function formatStarCount(stars: number | null): string {
  if (stars === null) return "";
  if (stars >= 1000) {
    return `${(stars / 1000).toFixed(stars >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }
  return String(stars);
}

// White GitHub "star" pill: octocat mark + a star outline + the live repo star
// count, linking out to the repo. Replaces the old "Get Started" pill in the
// chrome (desktop) and also appears in the mobile menu.
function GitHubStarButton({
  className,
  onNavigate,
  scrolled,
}: {
  className?: string;
  onNavigate?: () => void;
  scrolled?: boolean;
}) {
  const stars = useGitHubStars();
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Star Creed on GitHub"
      onClick={onNavigate}
      className={cn(
        "inline-flex h-9 items-center gap-2.5 rounded-md px-3 text-[14px] font-medium shadow-none transition-colors duration-300",
        scrolled
          ? "bg-[var(--creed-accent)] text-white hover:bg-[var(--creed-accent-hover)]"
          : "bg-white text-[#19345f] hover:bg-[#f6f7fb]",
        className,
      )}
    >
      <GitHubMark className="h-[18px] w-[18px]" />
      <span className="inline-flex items-center gap-1.5">
        <Star className="h-3.5 w-3.5" strokeWidth={1.8} />
        {stars !== null ? (
          <span className="tabular-nums">{formatStarCount(stars)}</span>
        ) : null}
      </span>
    </a>
  );
}

// A header dropdown: a text trigger that opens a small blurred menu of links in
// the same style as the mobile nav. Used for the centre nav groups (Product /
// Legal / Resources, align left) and the signed-out "Start" menu (Login / Sign
// up, align right). Closes on outside click, scroll, or Escape.
function HeaderDropdown({
  label,
  items,
  align = "left",
  scrolled,
  className,
}: {
  label: string;
  items: NavItem[];
  align?: "left" | "right";
  scrolled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const alignRight = align === "right";

  useEffect(() => {
    if (!open) return;
    const closeDropdown = () => {
      setOpen(false);
    };
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        closeDropdown();
      }
    }
    function onScroll() {
      closeDropdown();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeDropdown();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  const linkClass =
    "flex h-9 items-center justify-start rounded-md px-3.5 text-[14px] font-medium leading-none text-[var(--creed-text-primary)] transition-colors duration-200 hover:text-[var(--creed-text-secondary)]";

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "inline-flex h-9 items-center gap-1 rounded-md px-3.5 text-[14px] font-medium transition-colors duration-200",
          scrolled
            ? "text-[var(--creed-text-primary)] hover:text-[var(--creed-text-secondary)]"
            : "text-white hover:text-white/55",
        )}
      >
        {label}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
            <motion.div
              initial={{
                opacity: 0,
                y: -8,
                scale: 0.98,
              }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                y: -8,
                scale: 0.98,
              }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: "top center" }}
              className={cn(
                "absolute top-full z-10 w-32 pt-4",
                "left-0",
              )}
            >
              <div className="flex flex-col gap-1 rounded-xl bg-[var(--creed-surface)] p-1.5 shadow-[0_10px_18px_rgba(0,0,0,0.16)]">
                {items.map((item, index) => (
                  <motion.div
                    key={item.label}
                    className="w-full"
                    initial={{ opacity: 0, x: alignRight ? 10 : -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{
                      opacity: 0,
                      x: alignRight ? 10 : -10,
                      transition: {
                        duration: 0.16,
                        ease: [0.22, 1, 0.36, 1],
                      },
                    }}
                    transition={{
                      duration: 0.24,
                      delay: 0.04 + index * 0.04,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={linkClass}
                    >
                      {item.label}
                    </Link>
                  </motion.div>
                ))}
              </div>
            </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function HeaderAuthActions({
  authState,
  scrolled,
  mobileMenuOpen,
  setMobileMenuOpen,
}: {
  authState: "loading" | "signed-in" | "signed-out";
  scrolled?: boolean;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const enterArrow = useAnimatedIconControls(80, undefined, 420);

  // Mobile-menu trigger is shared across all states so the navigation links
  // remain reachable. No hover effect (mobile): the icon morphs hamburger <->
  // X as the menu opens and closes, tracking `mobileMenuOpen` through every
  // close path. A plain button (not the shadcn Button) so nothing overrides
  // the icon size or its white colour.
  const mobileLinksTrigger = (
    <button
      type="button"
      onClick={() => setMobileMenuOpen((value) => !value)}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md outline-none focus-visible:ring-2 md:hidden",
        scrolled
          ? "text-[var(--creed-text-primary)] focus-visible:ring-black/10"
          : "text-white focus-visible:ring-white/20",
      )}
      aria-label={
        mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"
      }
      aria-expanded={mobileMenuOpen}
    >
      <MenuIcon open={mobileMenuOpen} size={24} />
    </button>
  );

  if (authState === "loading") {
    return <div className="h-9 w-[120px] md:w-[184px]" aria-hidden="true" />;
  }

  // Signed in → "Open" text link into the app (the /file gate routes
  // unpaid / mid-onboarding users on from there) + the GitHub star pill.
  if (authState === "signed-in") {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/file"
          className={cn(
            "hidden h-9 items-center gap-1.5 rounded-md px-3.5 text-[14px] font-medium transition-colors duration-200 md:inline-flex",
            scrolled
              ? "text-[var(--creed-text-primary)] hover:text-[var(--creed-text-secondary)]"
              : "text-white hover:text-white/55",
          )}
          onMouseEnter={enterArrow.start}
          onMouseLeave={enterArrow.settle}
        >
          Continue
          <ArrowRightIcon
            ref={enterArrow.iconRef}
            className="h-3.5 w-3.5"
            size={14}
          />
        </Link>
        <GitHubStarButton scrolled={scrolled} className="hidden md:inline-flex" />
        {mobileLinksTrigger}
      </div>
    );
  }

  // Signed out → "Start" dropdown (Login / Sign up) + the GitHub star pill.
  // No "Get Started" pill in the chrome anymore; that lives on the landing
  // page itself.
  return (
    <div className="flex items-center gap-2">
      <HeaderDropdown
        label="Start"
        items={[
          { label: "Login", href: "/login" },
          { label: "Sign up", href: "/signup" },
        ]}
        align="right"
        scrolled={scrolled}
        className="hidden md:block"
      />
      <GitHubStarButton scrolled={scrolled} className="hidden md:inline-flex" />
      {mobileLinksTrigger}
    </div>
  );
}

// One row of the mobile menu: a dropdown trigger whose chevron sits to the
// left of the right-aligned label, keeping every label's trailing edge aligned
// with the GitHub star count below.
function MobileNavRow({
  label,
  items,
  open,
  onToggle,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  return (
    // Fixed width and clipping keep the horizontal sub-navigation inside the
    // rounded mobile menu surface instead of letting it pass over the card.
    <div className="flex h-9 w-[calc(100vw-3rem)] max-w-[40rem] items-center justify-end gap-2 overflow-hidden">
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="items"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex max-w-[min(68vw,24rem)] items-center gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain px-7 py-3 backdrop-blur-[12px] [scrollbar-width:none] [touch-action:pan-x] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
            style={{
              WebkitBackdropFilter: "blur(12px)",
              maskImage:
                "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.55) 10%, #000 24%, #000 76%, rgba(0,0,0,0.55) 90%, transparent 100%), linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.55) 14%, #000 30%, #000 70%, rgba(0,0,0,0.55) 86%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.55) 10%, #000 24%, #000 76%, rgba(0,0,0,0.55) 90%, transparent 100%), linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.55) 14%, #000 30%, #000 70%, rgba(0,0,0,0.55) 86%, transparent 100%)",
              maskComposite: "intersect",
              WebkitMaskComposite: "source-in",
            }}
          >
            {items.map((item, index) => (
              <motion.span
                key={item.label}
                className="shrink-0"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{
                  duration: 0.24,
                  delay: 0.05 + index * 0.05,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className="block whitespace-nowrap px-2.5 py-1 text-[14px] font-medium transition-opacity duration-200 hover:opacity-55"
                >
                  {item.label}
                </Link>
              </motion.span>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-9 shrink-0 items-center justify-end gap-3 px-3.5 text-[14px] font-medium transition-opacity duration-200 hover:opacity-55"
      >
        <ChevronLeft
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            open && "rotate-180",
          )}
        />
        {label}
      </button>
    </div>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--creed-border)] px-6 pt-12 md:px-10 md:pt-16 lg:px-12">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.1fr_0.9fr]">
        <div className="flex h-full flex-col justify-between gap-10">
          <div>
            <Link
              href="/home"
              aria-label="Creed home"
              className="inline-block transition-opacity hover:opacity-80"
            >
              <CreedWordmark />
            </Link>
            <p className="t-body-lg mt-4 max-w-sm text-[var(--creed-text-secondary)]">
              {CREED_TAGLINE}
            </p>
          </div>
          <div>
            <SystemStatusPill href="https://status.creed.md" />
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {navGroups.map((group) => (
            <FooterColumn key={group.label} title={group.label} items={group.items} />
          ))}
        </div>
      </div>

      <div className="mx-auto mt-8 flex max-w-7xl flex-col gap-4 border-t border-[var(--creed-border)] py-6 md:flex-row md:items-center md:justify-between">
        <div className="t-meta flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--creed-text-tertiary)]">
          <span>© 2026 Creed</span>
          <span aria-hidden="true">·</span>
          <span>by</span>
          <Link
            href={HPBRN_URL}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[var(--creed-accent)] transition-colors hover:text-[var(--creed-accent-hover)]"
          >
            hpbrn
          </Link>
        </div>
        {/* Social icons: left-to-right order is hpbrn, Discord, GitHub,
            Instagram, X. Icons are local SVG masks so colour stays inherited. */}
        <div className="flex items-center gap-4 text-[var(--creed-text-tertiary)]">
          <SocialIconLink
            href={HPBRN_URL}
            label="hpbrn"
            src="/assets/icons/hpbrn.svg"
            className="h-[19px] w-[19px]"
          />
          <SocialIconLink
            href={DISCORD_URL ?? "https://discord.com"}
            label="Discord"
            src="/assets/icons/discord.svg"
            className="h-[20px] w-[20px]"
          />
          <SocialIconLink
            href={GITHUB_URL}
            label="GitHub"
            src="/assets/icons/github.svg"
            className="h-[19px] w-[19px]"
          />
          <SocialIconLink
            href={INSTAGRAM_URL}
            label="Instagram"
            src="/assets/icons/Instagram.svg"
            className="h-[20px] w-[20px]"
          />
          <SocialIconLink
            href={TWITTER_URL}
            label="X"
            src="/assets/icons/x.svg"
            className="h-[18px] w-[18px]"
          />
        </div>
      </div>
    </footer>
  );
}

function SocialIconLink({
  href,
  label,
  src,
  className,
}: {
  href: string | null;
  label: string;
  src: string;
  className?: string;
}) {
  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="inline-flex items-center justify-center transition-colors hover:text-[var(--creed-accent)]"
    >
      <span
        aria-hidden="true"
        className={cn("block bg-current", className)}
        style={
          {
            WebkitMask: `url(${src}) center / contain no-repeat`,
            mask: `url(${src}) center / contain no-repeat`,
          } as CSSProperties
        }
      />
    </a>
  );
}

// Driven by the same `navGroups` as the header so the two never drift.
function FooterColumn({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div>
      <div className="t-body-lg font-medium text-[var(--creed-text-primary)]">
        {title}
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="t-body-lg block text-[var(--creed-text-secondary)] hover:text-[var(--creed-accent)]"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
