"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { SceneryFade, SceneryImage } from "@/components/marketing/scenery-image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronDown,
  ChevronLeft,
  LoaderCircle,
  Star,
} from "lucide-react";
import { MenuIcon } from "@creed/ui/menu";
import {
  HandHeartIcon,
  type HandHeartIconHandle,
} from "@creed/ui/hand-heart";
import { ContrastIcon, type ContrastIconHandle } from "@creed/ui/contrast";
import { BrandedCredit } from "@creed/ui/branded-credit";
import {
  ArrowUpRightIcon,
  type ArrowUpRightIconHandle,
} from "@creed/ui/arrow-up-right";
import { CreedWordmark } from "@/components/creed/brand";
import { SystemStatusPill } from "@/components/marketing/system-status";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { ArrowRightIcon } from "@creed/ui/arrow-right";
import { useLandingAuthState } from "@/components/marketing/use-landing-auth-state";
import { useEditionContinueHref } from "@creed/edition/ui";
import type { SignedInContinueHref } from "@/lib/marketing/signed-in-continue";
import { useGitHubStars } from "@/components/marketing/use-github-stars";
import { CREED_TAGLINE } from "@/lib/marketing/brand";
import { cn } from "@creed/ui/utils";
import { useCreedEdition } from "@/components/creed/edition-provider";
import { useTheme } from "@/components/creed/theme-provider";

import {
  DISCORD_URL,
  GITHUB_URL,
  INSTAGRAM_URL,
  TWITTER_URL,
} from "@/lib/branding";

type NavItem = { label: string; href: string };

// Header nav groups. Mirror the footer's Product / Legal / Resources columns so
// the two stay in lockstep; each renders as a dropdown in the desktop chrome.
//
const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Product",
    items: [
      { label: "Pricing", href: "/pricing" },
      { label: "Sponsor", href: "/sponsor" },
      { label: "Roadmap", href: "/roadmap" },
      { label: "Status", href: "https://status.creed.md" },
    ],
  },
  {
    label: "Resources",
    items: [
      { label: "Docs", href: "https://docs.creed.md" },
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
    ],
  },
];

function editionNavGroups(hasHostedAccounts: boolean) {
  if (hasHostedAccounts) return navGroups;
  return navGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.href !== "/sponsor"),
  }));
}

const heroImage = "/assets/landing/scenery/garden.png";

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
            src={heroImage}
            fileName="garden.png"
            label="Garden"
            priority
          />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,31,60,0.16)_0%,rgba(15,31,60,0.08)_28%,rgba(15,31,60,0.05)_56%,rgba(255,255,255,0)_76%)] dark:bg-[linear-gradient(180deg,rgba(0,0,0,0.32)_0%,rgba(0,0,0,0.18)_28%,rgba(0,0,0,0.08)_56%,rgba(0,0,0,0)_76%)]" />
        {/* Bottom fade melts the art into the page background. Eased multi-stop
            gradient so the transition reads smooth, not banded. */}
        <SceneryFade direction="down" />
      </div>
      <MarketingHeader configured={configured} scrolled={scrolled} />
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
  const { hostedAccounts: hasHostedAccounts } = useCreedEdition().capabilities;
  const visibleNavGroups = editionNavGroups(hasHostedAccounts);
  const cloudAuthEnabled = configured && hasHostedAccounts;
  void scrolled;
  const authState = useLandingAuthState(cloudAuthEnabled);
  const { href: continueHref } = useEditionContinueHref();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const [mobileMenuSurfaceHeight, setMobileMenuSurfaceHeight] = useState<number>();
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

  useLayoutEffect(() => {
    if (!mobileMenuOpen || !mobileMenuRef.current) {
      setMobileMenuSurfaceHeight(undefined);
      return;
    }

    const menu = mobileMenuRef.current;
    const measure = () => {
      setMobileMenuSurfaceHeight(menu.offsetTop + menu.offsetHeight + 12);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(menu);
    measure();
    return () => observer.disconnect();
  }, [mobileMenuOpen, authState]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 isolate px-3 pt-3 md:px-4 md:pt-4">
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
          animate={{
            height:
              mobileMenuOpen && mobileMenuSurfaceHeight
                ? mobileMenuSurfaceHeight
                : "100%",
          }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 drop-shadow-[0_10px_18px_rgba(0,0,0,0.16)]",
            stickyChromeActive ? "opacity-100" : "opacity-0",
          )}
        >
          <div className="absolute inset-0 rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)]" />
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
            onTransparent={!stickyChromeActive}
          />
        </Link>
      </div>

      <Link
        href="/home"
        aria-label="Creed home"
        className="hidden shrink-0 transition-opacity duration-200 hover:opacity-60 md:block"
      >
        <CreedWordmark className="ml-0" onTransparent={!stickyChromeActive} />
      </Link>

      <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
        {visibleNavGroups.map((group) => (
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
        hasHostedAccounts={hasHostedAccounts}
        authState={authState}
        continueHref={continueHref}
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
              ref={mobileMenuRef}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="absolute right-2 top-[4rem] z-10 flex flex-col items-end gap-2 text-[var(--creed-text-primary)]"
            >
              {visibleNavGroups.map((group, gIndex) => (
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
                        delay: (visibleNavGroups.length + 1 - gIndex) * 0.04,
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

              {hasHostedAccounts && authState !== "loading" ? (
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
                    delay: 0.04 + visibleNavGroups.length * 0.05,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  {authState === "signed-in" ? (
                    <MobileNavRow
                      label="Start"
                      items={[{ label: "Continue", href: continueHref }]}
                      open={openMobileGroup === "Start"}
                      onToggle={() =>
                        setOpenMobileGroup((cur) => (cur === "Start" ? null : "Start"))
                      }
                      onNavigate={() => setMobileMenuOpen(false)}
                    />
                  ) : (
                    <MobileSponsorLink onNavigate={() => setMobileMenuOpen(false)} />
                  )}
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
                    delay: 0.04 + (visibleNavGroups.length + 1) * 0.05,
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

function DiscordMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
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
        "github-star-button inline-flex h-9 items-center gap-2.5 rounded-md px-3 text-[14px] font-medium shadow-none transition-colors duration-300",
        scrolled
          ? "bg-[var(--creed-accent)] text-white hover:bg-[var(--creed-accent-hover)]"
          : "bg-white text-[#19345f] hover:bg-[#f6f7fb]",
        className,
      )}
    >
      <GitHubMark className="h-[18px] w-[18px]" />
      <span className="inline-flex items-center gap-1.5">
        <Star className="github-star-icon h-3.5 w-3.5" strokeWidth={1.8} />
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
              <div className="flex flex-col gap-1 rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1.5 shadow-[0_10px_18px_rgba(0,0,0,0.16)]">
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
                    <AnimatedNavLink
                      item={item}
                      onClick={() => setOpen(false)}
                      className={linkClass}
                      arrowClassName="ml-auto"
                    />
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
  hasHostedAccounts,
  authState,
  continueHref,
  scrolled,
  mobileMenuOpen,
  setMobileMenuOpen,
}: {
  hasHostedAccounts: boolean;
  authState: "loading" | "signed-in" | "signed-out";
  continueHref: SignedInContinueHref;
  scrolled?: boolean;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const enterArrow = useAnimatedIconControls(80, undefined, 420);
  const [continuePending, setContinuePending] = useState(false);
  const continuePendingTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (continuePendingTimerRef.current !== null) {
        window.clearTimeout(continuePendingTimerRef.current);
      }
    },
    [],
  );

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

  if (!hasHostedAccounts) {
    return (
      <div className="flex items-center gap-2">
        <GitHubStarButton scrolled={scrolled} className="hidden md:inline-flex" />
        {mobileLinksTrigger}
      </div>
    );
  }

  if (authState === "loading") {
    return <div className="h-9 w-[120px] md:w-[184px]" aria-hidden="true" />;
  }

  // Signed in → Continue into the correct next step: /file when entitled,
  // otherwise /onboarding. Pricing is only reached via the Pricing nav link.
  if (authState === "signed-in") {
    return (
      <div className="flex items-center gap-2">
        <Link
          href={continueHref}
          aria-busy={continuePending}
          onClick={(event) => {
            if (
              event.button === 0 &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey &&
              !event.altKey
            ) {
              if (continuePendingTimerRef.current !== null) {
                window.clearTimeout(continuePendingTimerRef.current);
              }
              continuePendingTimerRef.current = window.setTimeout(() => {
                setContinuePending(true);
              }, 180);
            }
          }}
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
          {continuePending ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowRightIcon
              ref={enterArrow.iconRef}
              className="h-3.5 w-3.5"
              size={14}
            />
          )}
        </Link>
        <GitHubStarButton scrolled={scrolled} className="hidden md:inline-flex" />
        {mobileLinksTrigger}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <SponsorHeaderLink scrolled={scrolled} />
      <GitHubStarButton scrolled={scrolled} className="hidden md:inline-flex" />
      {mobileLinksTrigger}
    </div>
  );
}

function SponsorHeaderLink({ scrolled }: { scrolled?: boolean }) {
  const iconRef = useRef<HandHeartIconHandle>(null);

  return (
    <Link
      href="/sponsor"
      className={cn(
        "hidden h-9 items-center gap-1.5 rounded-md px-3.5 text-[14px] font-medium transition-colors duration-200 md:inline-flex",
        scrolled
          ? "text-[var(--creed-text-primary)] hover:text-[var(--creed-text-secondary)]"
          : "text-white hover:text-white/55",
      )}
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
    >
      Sponsor
      <HandHeartIcon ref={iconRef} size={15} aria-hidden="true" />
    </Link>
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
                <AnimatedNavLink
                  item={item}
                  onClick={onNavigate}
                  className="group inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1 text-[14px] font-medium transition-opacity duration-200 hover:opacity-55"
                />
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

function MobileSponsorLink({ onNavigate }: { onNavigate: () => void }) {
  return (
    <Link
      href="/sponsor"
      onClick={onNavigate}
      className="flex h-9 items-center justify-end gap-2 px-3.5 text-[14px] font-medium transition-opacity duration-200 hover:opacity-55"
    >
      <HandHeartIcon size={16} aria-hidden="true" />
      Sponsor
    </Link>
  );
}

export function MarketingFooter() {
  const { hostedAccounts: hasHostedAccounts } = useCreedEdition().capabilities;
  const visibleNavGroups = editionNavGroups(hasHostedAccounts);

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
            <p className="t-body-lg mt-4 max-w-sm font-medium text-[var(--creed-text-secondary)]">
              {CREED_TAGLINE}
            </p>
          </div>
          <div>
            <SystemStatusPill href="https://status.creed.md" />
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {visibleNavGroups.map((group) => (
            <FooterColumn key={group.label} title={group.label} items={group.items} />
          ))}
        </div>
      </div>

      <div className="mx-auto mt-8 flex max-w-7xl flex-col gap-4 border-t border-[var(--creed-border)] py-6 md:flex-row md:items-center md:justify-between">
        <BrandedCredit
          accent="var(--creed-accent)"
          className="t-meta justify-start text-[var(--creed-text-tertiary)]"
        />
        <div className="flex items-center gap-4 text-[var(--creed-text-tertiary)]">
          <FooterThemeToggle />
          <InlineSocialIconLink
            href={DISCORD_URL}
            label="Discord"
          >
            <DiscordMark className="h-5 w-5" />
          </InlineSocialIconLink>
          <InlineSocialIconLink
            href={GITHUB_URL}
            label="GitHub"
          >
            <GitHubMark className="h-[17px] w-[17px]" />
          </InlineSocialIconLink>
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

function FooterThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const iconRef = useRef<ContrastIconHandle | null>(null);
  const label = theme === "dark" ? "Light mode" : "Dark mode";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        toggleTheme({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }}
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
      onFocus={() => iconRef.current?.startAnimation()}
      onBlur={() => iconRef.current?.stopAnimation()}
      className="inline-flex h-5 w-5 items-center justify-center transition-colors hover:text-[var(--creed-accent)]"
    >
      <ContrastIcon ref={iconRef} size={20} className="h-5 w-5" />
    </button>
  );
}

function InlineSocialIconLink({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: ReactNode;
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
      className="inline-flex h-5 w-5 items-center justify-center transition-colors hover:text-[var(--creed-accent)]"
    >
      {children}
    </a>
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
      className="inline-flex h-5 w-5 items-center justify-center transition-colors hover:text-[var(--creed-accent)]"
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
      <div className="t-body-lg font-medium text-[var(--creed-text-secondary)]">
        {title}
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <AnimatedNavLink
            key={item.label}
            item={item}
            className="t-body-lg flex w-fit items-center text-[var(--creed-text-primary)] hover:text-[var(--creed-accent)]"
            arrowClassName="ml-6"
          />
        ))}
      </div>
    </div>
  );
}

function AnimatedNavLink({
  item,
  className,
  arrowClassName,
  onClick,
}: {
  item: NavItem;
  className: string;
  arrowClassName?: string;
  onClick?: () => void;
}) {
  const arrowRef = useRef<ArrowUpRightIconHandle | null>(null);
  const external = item.href.startsWith("http");

  return (
    <Link
      href={item.href}
      onClick={onClick}
      onMouseEnter={() => arrowRef.current?.startAnimation()}
      onMouseLeave={() => arrowRef.current?.stopAnimation()}
      className={className}
    >
      {item.label}
      {external ? (
        <ArrowUpRightIcon
          ref={arrowRef}
          size={14}
          className={cn(
            "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center",
            arrowClassName,
          )}
        />
      ) : null}
    </Link>
  );
}
