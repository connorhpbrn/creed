"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  HeartHandshakeIcon,
  type HeartHandshakeIconHandle,
} from "@creed/ui/heart-handshake";
import { Input } from "@creed/ui/input";
import { cn } from "@creed/ui/utils";
import { SponsorDialog } from "@creed/edition/ui";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import {
  MarketingFooter,
  MarketingHeroBanner,
} from "@/components/marketing/site-chrome";
import {
  loadSponsorDetail,
  publicSponsorFromApi,
  SponsorMessageDialog,
  SponsorWallCard,
  type PublicSponsor,
} from "@/components/marketing/sponsor-wall";

export function SponsorPageView() {
  const [scrolled, setScrolled] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSponsor, setSelectedSponsor] = useState<PublicSponsor | null>(
    null
  );
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sponsors, setSponsors] = useState<PublicSponsor[]>([]);
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
          setSponsors((payload.sponsors ?? []).map(publicSponsorFromApi).filter((value): value is PublicSponsor => Boolean(value)));
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
      const next = (payload.sponsors ?? []).map(publicSponsorFromApi).filter((value): value is PublicSponsor => Boolean(value));
      setSponsors((current) => [...current, ...next]);
    } catch {
      toast.error("Could not load more sponsors.");
    }
  }

  async function openSponsor(sponsor: PublicSponsor) {
    setSelectedSponsor(sponsor);
    setMessageDialogOpen(true);
    const detail = await loadSponsorDetail(sponsor);
    setSelectedSponsor((current) => (current?.id === detail.id ? detail : current));
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
                <SponsorWallCard
                  key={sponsor.id}
                  sponsor={sponsor}
                  onOpen={(next) => void openSponsor(next)}
                />
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
