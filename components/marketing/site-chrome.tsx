"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { CreedWordmark } from "@/components/creed/brand";
import { SystemStatusPill } from "@/components/marketing/system-status";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { ArrowRightIcon } from "@/components/ui/arrow-right";
import { Button } from "@/components/ui/button";
import { useLandingAuthState } from "@/components/marketing/use-landing-auth-state";
import { usePaidStatus } from "@/components/marketing/use-paid-status";
import { cn } from "@/lib/utils";

import { CONTACT_MAILTO, GITHUB_URL, INSTAGRAM_URL, TWITTER_URL } from "@/lib/branding";

const navItems = [
  { label: "Privacy", href: "/privacy" },
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: CONTACT_MAILTO },
] as const;

export function MarketingHeader({
  configured,
  scrolled,
}: {
  configured: boolean;
  scrolled: boolean;
}) {
  void scrolled;
  const authState = useLandingAuthState(configured);
  const paidStatus = usePaidStatus(configured);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileGoToAppArrow = useAnimatedIconControls(80, undefined, 420);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    function closeOnScroll() {
      setMobileMenuOpen(false);
    }

    window.addEventListener("scroll", closeOnScroll, { passive: true });
    return () => window.removeEventListener("scroll", closeOnScroll);
  }, [mobileMenuOpen]);

  return (
    <header className="relative mx-auto flex w-full max-w-[760px] items-center justify-between">
      <div className="flex items-center md:hidden">
        <Link
          href="/home"
          aria-label="Creed home"
          className="shrink-0"
          onClick={() => setMobileMenuOpen(false)}
        >
          <CreedWordmark className="ml-0" imageClassName="invert brightness-0" />
        </Link>
      </div>

      <Link href="/home" aria-label="Creed home" className="hidden shrink-0 md:block">
        <CreedWordmark className="ml-0" imageClassName="invert brightness-0" />
      </Link>

      <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
        {navItems.map((item) => (
          <HeaderTextButton key={item.label} href={item.href}>
            {item.label}
          </HeaderTextButton>
        ))}
      </nav>

      <HeaderAuthActions
        configured={configured}
        authState={authState}
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
                outline — the blur just melts into the surrounding hero. */}
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

            <motion.div
              initial={{ opacity: 0, y: -10, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(8px)" }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className="absolute right-4 top-[4.65rem] flex w-[8.25rem] flex-col items-end gap-2 text-white"
            >
              {navItems.map((item, index) => (
                <motion.div
                  key={item.label}
                  className="relative z-10"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.24, delay: 0.04 + index * 0.04, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex h-9 items-center justify-end rounded-md px-3.5 text-[13px] font-medium leading-none text-white/82 transition-all duration-200 hover:bg-white/10 hover:text-white"
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}

              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.24, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 flex flex-col items-end gap-2 pt-1"
              >
                {authState === "signed-in" && paidStatus === "paid" ? (
                  <Button
                    asChild
                    variant="ghost"
                    // White "Go to app" pill — matches the desktop chrome
                    // for paid users. Same dark-mode lock-in as the rest
                    // of the chrome's white pills.
                    className="h-9 rounded-md bg-white px-3.5 text-[13px] font-medium tracking-normal text-[#19345f] shadow-none transition-colors hover:bg-[#f6f7fb] hover:text-[#19345f] dark:bg-white dark:text-[#19345f] dark:hover:bg-[#f6f7fb] dark:hover:text-[#19345f] aria-expanded:bg-white aria-expanded:text-[#19345f]"
                    onMouseEnter={mobileGoToAppArrow.start}
                    onMouseLeave={mobileGoToAppArrow.settle}
                    onPointerDown={(event) => {
                      if (event.pointerType !== "mouse") {
                        mobileGoToAppArrow.start();
                      }
                    }}
                  >
                    <Link href="/file" onClick={() => setMobileMenuOpen(false)}>
                      Go to app
                      <ArrowRightIcon ref={mobileGoToAppArrow.iconRef} className="h-3.5 w-3.5" size={14} />
                    </Link>
                  </Button>
                ) : authState === "loading" ? null : (
                  <>
                    {authState === "signed-out" ? (
                      <GoogleSignInButton
                        configured={configured}
                        label="Login"
                        showIcon={false}
                        className="h-9 rounded-md bg-transparent px-3.5 text-[13px] font-medium text-white/82 transition-all duration-200 hover:bg-white/10 hover:text-white"
                      />
                    ) : null}
                    <Button
                      asChild
                      variant="ghost"
                      className="h-9 rounded-md bg-white px-3.5 text-[13px] font-medium tracking-normal text-[#19345f] shadow-none transition-colors hover:bg-[#f6f7fb] hover:text-[#19345f] dark:bg-white dark:text-[#19345f] dark:hover:bg-[#f6f7fb] dark:hover:text-[#19345f] aria-expanded:bg-white aria-expanded:text-[#19345f]"
                      onMouseEnter={mobileGoToAppArrow.start}
                      onMouseLeave={mobileGoToAppArrow.settle}
                      onPointerDown={(event) => {
                        if (event.pointerType !== "mouse") {
                          mobileGoToAppArrow.start();
                        }
                      }}
                    >
                      <Link href="/pricing" onClick={() => setMobileMenuOpen(false)}>
                        Get Started
                        <ArrowRightIcon ref={mobileGoToAppArrow.iconRef} className="h-3.5 w-3.5" size={14} />
                      </Link>
                    </Button>
                  </>
                )}
              </motion.div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

// `useLandingAuthState` now lives in components/marketing/use-landing-auth-state.ts
// so both the chrome and the pricing card share the same auth listener
// rather than each spinning up their own.

function HeaderAuthActions({
  configured,
  authState,
  mobileMenuOpen,
  setMobileMenuOpen,
}: {
  configured: boolean;
  authState: "loading" | "signed-in" | "signed-out";
  mobileMenuOpen: boolean;
  setMobileMenuOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const goToAppArrow = useAnimatedIconControls(80, undefined, 420);
  const paidStatus = usePaidStatus(configured);

  // Mobile-menu trigger is shared across all states so the navigation
  // links remain reachable. We render it once at the end.
  const mobileLinksTrigger = (
    <Button
      type="button"
      variant="ghost"
      onClick={() => setMobileMenuOpen((value) => !value)}
      className="h-9 rounded-md bg-transparent px-3.5 text-[13px] font-medium tracking-normal text-white/82 hover:bg-white/8 hover:text-white aria-expanded:bg-transparent aria-expanded:text-white/82 active:translate-y-0 active:bg-transparent focus-visible:ring-white/20 md:hidden"
      aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
      aria-expanded={mobileMenuOpen}
    >
      Links
      <ChevronDown
        className={cn(
          "ml-1.5 h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          mobileMenuOpen && "rotate-180"
        )}
      />
    </Button>
  );

  if (authState === "loading") {
    return <div className="h-10 w-[110px] md:w-[164px]" aria-hidden="true" />;
  }

  // Signed in + paid → white "Go to app" pill (same white pill chrome as
  // the unpaid Get Started, just with the animated arrow + relabeled).
  // We deliberately don't recolour the pill green — the label change +
  // arrow are enough to signal ownership without competing with the rest
  // of the chrome.
  if (authState === "signed-in" && paidStatus === "paid") {
    return (
      <div className="flex items-center gap-2">
        <Button
          asChild
          variant="ghost"
          className="hidden h-9 rounded-md bg-white px-3.5 text-[13px] font-medium tracking-normal text-[#19345f] shadow-none transition-colors hover:bg-[#f6f7fb] hover:text-[#19345f] dark:bg-white dark:text-[#19345f] dark:hover:bg-[#f6f7fb] dark:hover:text-[#19345f] aria-expanded:bg-white aria-expanded:text-[#19345f] md:inline-flex"
          onMouseEnter={goToAppArrow.start}
          onMouseLeave={goToAppArrow.settle}
        >
          <Link href="/file">
            Go to app
            <ArrowRightIcon ref={goToAppArrow.iconRef} className="h-3.5 w-3.5" size={14} />
          </Link>
        </Button>
        {mobileLinksTrigger}
      </div>
    );
  }

  // Signed in but not paid yet → only show "Get Started" (no Login
  // alongside, since they're already signed in). The pricing page picks
  // up from here and runs them straight into Stripe Checkout. Reusing
  // `goToAppArrow` — only one of these CTA buttons ever renders at a
  // time so they can share the same controls ref.
  if (authState === "signed-in") {
    return (
      <div className="flex items-center gap-2">
        <Button
          asChild
          variant="ghost"
          className="hidden h-9 rounded-md bg-white px-3.5 text-[13px] font-medium tracking-normal text-[#19345f] shadow-none transition-colors hover:bg-[#f6f7fb] hover:text-[#19345f] dark:bg-white dark:text-[#19345f] dark:hover:bg-[#f6f7fb] dark:hover:text-[#19345f] aria-expanded:bg-white aria-expanded:text-[#19345f] md:inline-flex"
          onMouseEnter={goToAppArrow.start}
          onMouseLeave={goToAppArrow.settle}
        >
          <Link href="/pricing">
            Get Started
            <ArrowRightIcon ref={goToAppArrow.iconRef} className="h-3.5 w-3.5" size={14} />
          </Link>
        </Button>
        {mobileLinksTrigger}
      </div>
    );
  }

  // Signed out → Login (Google OAuth) + Get Started (Link to /pricing).
  // The two-pill pair is the marketing-page default.
  return (
    <div className="flex items-center gap-2">
      <GoogleSignInButton
        configured={configured}
        label="Login"
        showIcon={false}
        className="hidden h-9 rounded-md bg-transparent px-3.5 text-[13px] font-medium text-white/82 transition-all duration-200 hover:bg-white/10 hover:text-white md:inline-flex"
      />
      <Button
        asChild
        variant="ghost"
        className="hidden h-9 rounded-md bg-white px-3.5 text-[13px] font-medium tracking-normal text-[#19345f] shadow-none transition-colors hover:bg-[#f6f7fb] hover:text-[#19345f] dark:bg-white dark:text-[#19345f] dark:hover:bg-[#f6f7fb] dark:hover:text-[#19345f] aria-expanded:bg-white aria-expanded:text-[#19345f] md:inline-flex"
        onMouseEnter={goToAppArrow.start}
        onMouseLeave={goToAppArrow.settle}
      >
        <Link href="/pricing">
          Get Started
          <ArrowRightIcon ref={goToAppArrow.iconRef} className="h-3.5 w-3.5" size={14} />
        </Link>
      </Button>
      {mobileLinksTrigger}
    </div>
  );
}

function HeaderTextButton({
  children,
  href,
  className,
}: {
  children: React.ReactNode;
  href: string;
  className?: string;
}) {
  return (
    <Button
      asChild
      variant="ghost"
      className={cn(
        "h-9 rounded-md px-3.5 text-[13px] font-medium text-white/82 transition-all duration-200 hover:bg-white/10 hover:text-white",
        className
      )}
    >
      <Link href={href}>{children}</Link>
    </Button>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--creed-border)] px-6 pt-12 md:px-10 md:pt-16 lg:px-12">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.1fr_0.9fr]">
        <div>
          <Link href="/home" aria-label="Creed home" className="inline-block transition-opacity hover:opacity-80">
            <CreedWordmark />
          </Link>
          <p className="t-body-lg mt-4 max-w-sm text-[var(--creed-text-secondary)]">
            Personal context for your agents.
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          <FooterColumn title="Product" links={["Pricing"]} />
          <FooterColumn title="Legal" links={["Privacy", "Terms", "Stack"]} />
          <FooterColumn title="Resources" links={["Docs", "Contact"]} />
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-7xl">
        <SystemStatusPill />
      </div>

      <div className="mx-auto mt-6 flex max-w-7xl flex-col gap-4 border-t border-[var(--creed-border)] py-6 md:flex-row md:items-center md:justify-between">
        <div className="t-meta text-[var(--creed-text-tertiary)]">© 2026 Creed</div>
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
                fill="currentColor"
                aria-hidden="true"
                className="h-[19px] w-[19px]"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"
                />
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
                <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
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

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: string[];
}) {
  return (
    <div>
      <div className="t-body-lg font-medium text-[var(--creed-text-primary)]">{title}</div>
      <div className="mt-4 space-y-3">
        {links.map((link) => (
          <Link
            key={link}
            href={
              link === "Pricing"
                ? "/pricing"
                : link === "Privacy"
                ? "/privacy"
                : link === "Terms"
                  ? "/terms"
                  : link === "Stack"
                    ? "/stack"
                    : link === "Docs"
                      ? "/docs"
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
