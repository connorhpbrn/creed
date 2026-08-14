"use client";

import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  HeartHandshakeIcon,
  type HeartHandshakeIconHandle,
} from "@creed/ui/heart-handshake";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@creed/ui/dialog";
import { Input } from "@creed/ui/input";
import { cn } from "@creed/ui/utils";
import { SponsorDialog } from "@creed/edition/ui";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import {
  MarketingFooter,
  MarketingHeroBanner,
} from "@/components/marketing/site-chrome";

type Sponsor = {
  id: string;
  donations: readonly number[];
  name?: string;
  message?: string;
  image?: string;
  avatarColor: string;
};

function formatDonation(amount: number) {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function sponsorFromApi(value: unknown): Sponsor | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !Array.isArray(row.donationAmounts)) return null;
  return {
    id: row.id,
    name: typeof row.name === "string" ? row.name : undefined,
    message: typeof row.message === "string" ? row.message : undefined,
    image: typeof row.image === "string" ? row.image : undefined,
    donations: row.donationAmounts
      .filter((amount): amount is number => typeof amount === "number")
      .map((amount) => amount / 100),
    avatarColor: browserAvatarColor(row.id),
  };
}

function browserAvatarColor(sponsorId: string) {
  let seed = 0;
  try {
    const stored = localStorage.getItem("creed-sponsor-color-seed");
    seed = stored ? Number(stored) : Math.floor(Math.random() * 360);
    if (!stored) localStorage.setItem("creed-sponsor-color-seed", String(seed));
  } catch {
    seed = 197;
  }
  const sponsorOffset = [...sponsorId].reduce(
    (total, character) => total + character.charCodeAt(0),
    0
  );
  return `hsl(${(seed + sponsorOffset) % 360} 58% 42%)`;
}

export function SponsorPageView() {
  const [scrolled, setScrolled] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSponsor, setSelectedSponsor] = useState<Sponsor | null>(
    null
  );
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [totalSponsors, setTotalSponsors] = useState(0);
  const [loadingSponsors, setLoadingSponsors] = useState(true);
  const [sponsorLoadFailed, setSponsorLoadFailed] = useState(false);
  const contributeIconRef = useRef<HeartHandshakeIconHandle>(null);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentIntentId = params.get("payment_intent");
    if (!paymentIntentId) return;
    window.history.replaceState({}, "", "/sponsor");
    void fetch("/api/sponsor/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentIntentId }),
    }).then((response) => {
      if (response.ok) toast.success("Thank you for supporting Creed.");
      else toast.error("The payment is still being confirmed.");
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoadingSponsors(true);
      setSponsorLoadFailed(false);
      const params = new URLSearchParams({ limit: "24", offset: "0" });
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      void fetch(`/api/sponsor/wall?${params}`, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Sponsor wall request failed");
          return response.json() as Promise<{ sponsors?: unknown[]; total?: number }>;
        })
        .then((payload) => {
          if (controller.signal.aborted) return;
          setSponsors((payload.sponsors ?? []).map(sponsorFromApi).filter((value): value is Sponsor => Boolean(value)));
          setTotalSponsors(typeof payload.total === "number" ? payload.total : 0);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSponsors([]);
            setTotalSponsors(0);
            setSponsorLoadFailed(true);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingSponsors(false);
        });
    }, searchQuery ? 180 : 0);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [searchQuery]);

  async function loadMoreSponsors() {
    try {
      const params = new URLSearchParams({ limit: "24", offset: String(sponsors.length) });
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      const response = await fetch(`/api/sponsor/wall?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Sponsor wall request failed");
      const payload = (await response.json()) as { sponsors?: unknown[] };
      const next = (payload.sponsors ?? []).map(sponsorFromApi).filter((value): value is Sponsor => Boolean(value));
      setSponsors((current) => [...current, ...next]);
    } catch {
      toast.error("Could not load more sponsors.");
    }
  }

  async function openSponsor(sponsor: Sponsor) {
    setSelectedSponsor(sponsor);
    setMessageDialogOpen(true);
    try {
      const response = await fetch(`/api/sponsor/wall/${sponsor.id}`);
      if (!response.ok) return;
      const payload = (await response.json()) as { sponsor?: unknown };
      const detail = sponsorFromApi(payload.sponsor);
      if (detail) setSelectedSponsor(detail);
    } catch {
      return;
    }
  }

  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <MarketingHeroBanner configured scrolled={scrolled} />

      <main className="mx-auto max-w-4xl px-6 pb-20 pt-8 md:px-10 md:pb-24 md:pt-10">
        <div className="flex items-center justify-between gap-6 border-b border-[var(--creed-border)] pb-8">
          <AnimatedPageTitle text="Sponsor" />
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            onMouseEnter={() => contributeIconRef.current?.startAnimation()}
            onMouseLeave={() => contributeIconRef.current?.stopAnimation()}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-[var(--creed-accent)] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[var(--creed-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--creed-accent)]/40"
          >
            Contribute
            <HeartHandshakeIcon
              ref={contributeIconRef}
              size={17}
              aria-hidden="true"
            />
          </button>
        </div>

        <section className="py-10 md:py-12">
          <div className="flex items-center justify-between gap-4">
            {totalSponsors > 0 || searchQuery ? (
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--creed-text-tertiary)]"
                  aria-hidden="true"
                />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search sponsors"
                  aria-label="Search sponsors"
                  className="h-10 rounded-lg border-[var(--creed-border)] bg-[var(--creed-surface)] pl-9 pr-9 text-[14px]"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--creed-text-tertiary)] transition-colors hover:text-[var(--creed-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--creed-accent)]/35"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ) : (
              <span />
            )}
            <div className="shrink-0 text-[13px] text-[var(--creed-text-tertiary)]">
              {totalSponsors} {totalSponsors === 1 ? "sponsor" : "sponsors"}
            </div>
          </div>

          {sponsors.length > 0 ? (
            <>
              <div className="mt-3 grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sponsors.map((sponsor) => (
                <button
                  type="button"
                  key={sponsor.id}
                  onClick={() => void openSponsor(sponsor)}
                  className="flex max-h-[230px] flex-col rounded-xl bg-[var(--creed-surface)] p-5 text-left transition-colors hover:bg-[var(--creed-surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--creed-accent)]/35"
                >
                  <SponsorAvatar sponsor={sponsor} />
                  <h2 className="mt-4 text-[15px] font-medium">
                    {sponsor.name || "Anonymous"}
                  </h2>
                  {sponsor.message ? (
                    <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-[var(--creed-text-secondary)]">
                      {sponsor.message}
                    </p>
                  ) : null}
                  <DonationTags
                    donations={sponsor.donations}
                    responsive
                    className="pt-4"
                  />
                </button>
                ))}
              </div>
              {sponsors.length < totalSponsors ? (
                <div className="flex justify-center pt-3">
                <button
                  type="button"
                  onClick={() => void loadMoreSponsors()}
                  className="h-9 rounded-md px-4 text-[13px] font-medium text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface)] hover:text-[var(--creed-text-primary)]"
                >
                  Load more
                </button>
                </div>
              ) : null}
            </>
          ) : (
            <div
              className={cn(
                "mt-3 flex items-center justify-center rounded-xl bg-[var(--creed-surface)] px-6 text-center",
                searchQuery
                  ? "min-h-40 text-[14px] text-[var(--creed-text-secondary)]"
                  : "min-h-[230px] border border-dashed border-[var(--creed-border-strong)] py-12 text-[18px] font-medium"
              )}
            >
              {loadingSponsors
                ? "Loading sponsors."
                : sponsorLoadFailed
                  ? "Could not load sponsors."
                  : searchQuery
                    ? "No sponsors found."
                    : "Be the first sponsor."}
            </div>
          )}
        </section>
      </main>

      <MarketingFooter />
      <SponsorDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <SponsorMessageDialog
        open={messageDialogOpen}
        sponsor={selectedSponsor}
        onOpenChange={setMessageDialogOpen}
      />
    </div>
  );
}

function SponsorAvatar({ sponsor }: { sponsor: Sponsor }) {
  if (sponsor.image) {
    return (
      <Image
        src={sponsor.image}
        alt=""
        width={48}
        height={48}
        className="size-12 rounded-lg object-cover"
      />
    );
  }

  return (
    <span
      aria-label="Default sponsor picture"
      role="img"
      className="inline-flex size-12 items-center justify-center rounded-lg text-[18px] font-medium text-white"
      style={{ backgroundColor: sponsor.avatarColor }}
    >
      ?
    </span>
  );
}

function SponsorMessageDialog({
  open,
  sponsor,
  onOpenChange,
}: {
  open: boolean;
  sponsor: Sponsor | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="supports-backdrop-filter:backdrop-blur-none"
        className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]"
      >
        {sponsor ? (
          <>
            <DialogHeader className="gap-0">
              <SponsorAvatar sponsor={sponsor} />
              <DialogTitle className="mt-6">
                {sponsor.name || "Anonymous"}
              </DialogTitle>
            </DialogHeader>
            <p className="mt-1 text-[14px] leading-6 text-[var(--creed-text-secondary)]">
              {sponsor.message || "No message was left."}
            </p>
            <DonationTags donations={sponsor.donations} className="mt-2" />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DonationTags({
  donations,
  responsive = false,
  className,
}: {
  donations: readonly number[];
  responsive?: boolean;
  className?: string;
}) {
  if (responsive) {
    return (
      <ResponsiveDonationTags donations={donations} className={className} />
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {donations.map((donation, index) => (
        <DonationTag key={`${donation}-${index}`}>{formatDonation(donation)}</DonationTag>
      ))}
    </div>
  );
}

function ResponsiveDonationTags({
  donations,
  className,
}: {
  donations: readonly number[];
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measurementRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const ellipsisRef = useRef<HTMLSpanElement>(null);
  const [visibleCount, setVisibleCount] = useState(donations.length);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function measure() {
      const availableWidth = container?.clientWidth ?? 0;
      const tagWidths = donations.map(
        (_, index) => measurementRefs.current[index]?.offsetWidth ?? 0
      );
      const gap = 6;
      const fullWidth =
        tagWidths.reduce((total, width) => total + width, 0) +
        Math.max(tagWidths.length - 1, 0) * gap;

      if (fullWidth <= availableWidth) {
        setVisibleCount(donations.length);
        return;
      }

      const ellipsisWidth = ellipsisRef.current?.offsetWidth ?? 0;
      let usedWidth = ellipsisWidth;
      let nextVisibleCount = 0;

      for (const tagWidth of tagWidths) {
        if (usedWidth + gap + tagWidth > availableWidth) break;
        usedWidth += gap + tagWidth;
        nextVisibleCount += 1;
      }

      setVisibleCount(nextVisibleCount);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    measure();
    return () => observer.disconnect();
  }, [donations]);

  const hasOverflow = visibleCount < donations.length;

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="flex items-center gap-1.5 overflow-hidden">
        {donations.slice(0, visibleCount).map((donation, index) => (
          <DonationTag key={`${donation}-${index}`}>{formatDonation(donation)}</DonationTag>
        ))}
        {hasOverflow ? <DonationTag>…</DonationTag> : null}
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-x-0 top-0 flex items-center gap-1.5"
      >
        {donations.map((donation, index) => (
          <DonationTag
            key={`${donation}-${index}`}
            ref={(element) => {
              measurementRefs.current[index] = element;
            }}
          >
            {formatDonation(donation)}
          </DonationTag>
        ))}
        <DonationTag ref={ellipsisRef}>…</DonationTag>
      </div>
    </div>
  );
}

const DonationTag = forwardRef<HTMLSpanElement, { children: ReactNode }>(
  ({ children }, ref) => (
  <span
    ref={ref}
    className="inline-flex shrink-0 items-center whitespace-nowrap rounded-[6px] bg-[#ECFDF5] px-1.5 py-0.5 text-[12px] font-medium text-[#047857] dark:bg-[#052e1a]/50 dark:text-[#4ade80]"
  >
    {children}
  </span>
  )
);

DonationTag.displayName = "DonationTag";
