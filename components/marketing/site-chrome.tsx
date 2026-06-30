"use client";

import {
  useEffect,
  useRef,
  useState,
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
import { cn } from "@/lib/utils";

import {
  CONTACT_MAILTO,
  GITHUB_URL,
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
      { label: "Examples", href: "/examples" },
      { label: "Roadmap", href: "/roadmap" },
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
  {
    label: "Resources",
    items: [
      { label: "Docs", href: "/docs" },
      { label: "Context", href: "/context" },
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
  // condenses into a translucent rounded bar (in-app surface material).
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setIsScrolled(window.scrollY > 64);
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
          "pointer-events-auto relative mx-auto w-full transition-[max-width] duration-300 ease-out",
          isScrolled ? "max-w-[720px]" : "max-w-[880px]",
        )}
      >
        {/* Translucent bar material on its OWN layer behind the content. It must
            not wrap the nav, because a backdrop-filter is canceled inside a
            backdrop-filter ancestor - keeping the blur a sibling (not a parent)
            of the dropdown blurs lets both render. */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300 ease-out",
            isScrolled
              ? "bg-[color:var(--creed-surface)]/80 opacity-100 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.22)] backdrop-blur-md"
              : "opacity-0",
          )}
        />
        <header
          className={cn(
            "relative flex w-full items-center justify-between transition-[padding] duration-300 ease-out",
            isScrolled ? "py-1.5 pl-4 pr-1.5" : "px-1 py-1",
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
            imageClassName={isScrolled ? undefined : "invert brightness-0"}
          />
        </Link>
      </div>

      <Link
        href="/home"
        aria-label="Creed home"
        className="hidden shrink-0 transition-opacity duration-200 hover:opacity-60 md:block"
      >
        <CreedWordmark className="ml-0" imageClassName={isScrolled ? undefined : "invert brightness-0"} />
      </Link>

      <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
        {navGroups.map((group) => (
          <HeaderDropdown
            key={group.label}
            label={group.label}
            items={group.items}
            align="left"
            scrolled={isScrolled}
          />
        ))}
      </nav>

      <HeaderAuthActions
        authState={authState}
        scrolled={isScrolled}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      <AnimatePresence initial={false}>
        {mobileMenuOpen ? (
          <div className="fixed inset-0 z-[90] md:hidden">
            {/* Invisible tap-to-close layer. The blur is local to the
                dropdown card below, not full-screen. */}
            <motion.button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute inset-0 bg-transparent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            />

            {/* Subtle backdrop blur localized to the menu area. Sits
                OUTSIDE the motion.div below because motion's filter
                animation creates a stacking context that nukes
                backdrop-filter on descendants. A radial-mask fades the
                blur to zero at the edges so there's no visible card
                outline - the blur just melts into the surrounding hero. */}
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-none absolute right-0 top-[3.65rem] h-[19rem] w-[12rem] backdrop-blur-[6px]"
              style={{
                WebkitBackdropFilter: "blur(6px)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 70% 70% at 70% 50%, black 35%, transparent 80%)",
                maskImage:
                  "radial-gradient(ellipse 70% 70% at 70% 50%, black 35%, transparent 80%)",
              }}
            />

            {/* No filter animation here: a lingering filter (even blur(0px))
                forms a backdrop root that cancels the per-row backdrop-blur on
                the expanded sub-items below. */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className="absolute right-4 top-[4.65rem] flex flex-col items-end gap-2 text-white"
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
                      ease: [0.16, 1, 0.3, 1],
                    },
                  }}
                  transition={{
                    duration: 0.24,
                    delay: 0.04 + gIndex * 0.05,
                    ease: [0.16, 1, 0.3, 1],
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
                    transition: { duration: 0.24, delay: 0.04, ease: [0.16, 1, 0.3, 1] },
                  }}
                  transition={{
                    duration: 0.24,
                    delay: 0.04 + navGroups.length * 0.05,
                    ease: [0.16, 1, 0.3, 1],
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
                    transition: { duration: 0.24, delay: 0, ease: [0.16, 1, 0.3, 1] },
                  }}
                  transition={{
                    duration: 0.24,
                    delay: 0.04 + (navGroups.length + 1) * 0.05,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <GitHubStarButton onNavigate={() => setMobileMenuOpen(false)} />
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
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onScroll() {
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
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

  const linkClass = cn(
    "flex h-9 items-center rounded-md px-3.5 text-[14px] font-medium leading-none transition-colors duration-200",
    scrolled
      ? "text-[var(--creed-text-primary)] hover:text-[var(--creed-text-secondary)]"
      : "text-white hover:text-white/55",
    alignRight ? "justify-end" : "justify-start",
  );

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
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
          <>
            {/* Localized blur behind the menu (sibling of the menu, not a child:
                motion's filter animation creates a stacking context that would
                nuke a child's backdrop-filter). A feathered mask melts it in. */}
            <motion.div
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "pointer-events-none absolute top-[1.6rem] w-[11rem] backdrop-blur-[7px]",
                alignRight ? "-right-4" : "-left-4",
              )}
              style={{
                // Centred on the menu's bounding box (top-[2.6rem], w-[9rem], the
                // h-9 rows with gap-2) with ~1rem of feather padding all round, so
                // the soft mask edges fade out beyond the items, not across them.
                height: `${items.length * 2.75 + 1.5}rem`,
                WebkitBackdropFilter: "blur(7px)",
                // Feathered rectangle (solid centre, soft edges on every side) with
                // a wide, gradual fade so the blur melts into the hero instead of
                // ending on a hard edge. Wider feather than the mobile menu since
                // this is a tall vertical stack.
                WebkitMaskImage:
                  "linear-gradient(to right, transparent 0%, #000 15%, #000 85%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 18%, #000 82%, transparent 100%)",
                maskImage:
                  "linear-gradient(to right, transparent 0%, #000 15%, #000 85%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 18%, #000 82%, transparent 100%)",
                maskComposite: "intersect",
                WebkitMaskComposite: "source-in",
              }}
            />
            <motion.div
              initial={{ opacity: 0, y: -10, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(8px)" }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "absolute top-[2.6rem] z-10 flex w-[9rem] flex-col gap-2 text-white",
                alignRight ? "right-0 items-end" : "left-0 items-start",
              )}
            >
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
                      duration: 0.2,
                      delay: (items.length - 1 - index) * 0.04,
                      ease: [0.16, 1, 0.3, 1],
                    },
                  }}
                  transition={{
                    duration: 0.24,
                    delay: 0.04 + index * 0.04,
                    ease: [0.16, 1, 0.3, 1],
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
            </motion.div>
          </>
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
// right of the label and points left when closed, rotating to point right when
// open as the sub-links slide in to the left of the label.
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
    // Fixed height so expanding a group (its items panel is taller than the
    // h-9 button because of the blur-feather padding) doesn't grow the row and
    // jump the spacing between the dropdown buttons. The panel overflows this
    // row visually but never changes its layout height.
    <div className="flex h-9 items-center gap-2">
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="items"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-1 overflow-hidden px-5 py-2.5 backdrop-blur-[7px]"
            style={{
              WebkitBackdropFilter: "blur(7px)",
              // A flat, evenly-feathered panel rather than a radial "wheel":
              // two linear fades intersected give a solid centre with a soft
              // edge on every side, and the generous padding makes the blurred
              // area extend well beyond the text.
              maskImage:
                "linear-gradient(to right, transparent 0%, #000 13%, #000 87%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 22%, #000 78%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0%, #000 13%, #000 87%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 22%, #000 78%, transparent 100%)",
              maskComposite: "intersect",
              WebkitMaskComposite: "source-in",
            }}
          >
            {items.map((item, index) => (
              <motion.span
                key={item.label}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{
                  duration: 0.24,
                  delay: 0.05 + index * 0.05,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className="block whitespace-nowrap px-2.5 py-1 text-[14px] font-medium text-white transition-colors duration-200 hover:text-white/55"
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
        className="flex h-9 shrink-0 items-center gap-1.5 px-3.5 text-[14px] font-medium text-white transition-colors duration-200 hover:text-white/55"
      >
        {label}
        <ChevronLeft
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-300",
            open && "rotate-180",
          )}
        />
      </button>
    </div>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--creed-border)] px-6 pt-12 md:px-10 md:pt-16 lg:px-12">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.1fr_0.9fr]">
        <div>
          <Link
            href="/home"
            aria-label="Creed home"
            className="inline-block transition-opacity hover:opacity-80"
          >
            <CreedWordmark />
          </Link>
          <p className="t-body-lg mt-4 max-w-sm text-[var(--creed-text-secondary)]">
            Personal context for your agents.
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          <FooterColumn title="Product" links={["Pricing", "Examples", "Roadmap"]} />
          <FooterColumn title="Legal" links={["Privacy", "Terms", "Stack"]} />
          <FooterColumn
            title="Resources"
            links={["Docs", "Context", "Contact"]}
          />
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-7xl">
        <SystemStatusPill />
      </div>

      <div className="mx-auto mt-6 flex max-w-7xl flex-col gap-4 border-t border-[var(--creed-border)] py-6 md:flex-row md:items-center md:justify-between">
        <div className="t-meta text-[var(--creed-text-tertiary)]">
          © 2026 Creed
        </div>
        {/* Social icons: left-to-right order is GitHub → Instagram → X.
            Default colour is the tertiary text grey (inherited from the
            wrapping div); hover fills with the brand blue. */}
        <div className="flex items-center gap-4 text-[var(--creed-text-tertiary)]">
          {GITHUB_URL ? (
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              className="transition-colors hover:text-[#2563EB]"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="h-[19px] w-[19px]"
              >
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
              </svg>
            </a>
          ) : null}
          {INSTAGRAM_URL ? (
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
              className="transition-colors hover:text-[#2563EB]"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="h-[20px] w-[20px]"
              >
                <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle
                  cx="17.5"
                  cy="6.5"
                  r="1.1"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
            </a>
          ) : null}
          {TWITTER_URL ? (
            <a
              href={TWITTER_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="X"
              className="transition-colors hover:text-[#2563EB]"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                className="h-[18px] w-[18px]"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <div className="t-body-lg font-medium text-[var(--creed-text-primary)]">
        {title}
      </div>
      <div className="mt-4 space-y-3">
        {links.map((link) => (
          <Link
            key={link}
            href={
              link === "Pricing"
                ? "/pricing"
                : link === "Examples"
                  ? "/examples"
                  : link === "Roadmap"
                  ? "/roadmap"
                  : link === "Privacy"
                  ? "/privacy"
                  : link === "Terms"
                    ? "/terms"
                    : link === "Stack"
                      ? "/stack"
                      : link === "Docs"
                        ? "/docs"
                        : link === "Context"
                          ? "/context"
                          : link === "Contact"
                            ? CONTACT_MAILTO
                            : "#"
            }
            className="t-body-lg block text-[var(--creed-text-secondary)] hover:text-[#2563EB]"
          >
            {link}
          </Link>
        ))}
      </div>
    </div>
  );
}
