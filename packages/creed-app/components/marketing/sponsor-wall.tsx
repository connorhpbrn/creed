"use client";

import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@creed/ui/dialog";
import { cn } from "@creed/ui/utils";

export type PublicSponsor = {
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

export function publicSponsorFromApi(value: unknown): PublicSponsor | null {
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
    0,
  );
  return `hsl(${(seed + sponsorOffset) % 360} 58% 42%)`;
}

export function usePublicSponsors(limit: number) {
  const [sponsors, setSponsors] = useState<PublicSponsor[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      limit: String(limit),
      offset: "0",
    });
    void fetch(`/api/sponsor/wall?${params}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Sponsor wall request failed");
        return response.json() as Promise<{ sponsors?: unknown[] }>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setSponsors(
          (payload.sponsors ?? [])
            .map(publicSponsorFromApi)
            .filter((value): value is PublicSponsor => Boolean(value)),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setSponsors([]);
      });
    return () => controller.abort();
  }, [limit]);

  return sponsors;
}

export function SponsorAvatar({ sponsor }: { sponsor: PublicSponsor }) {
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

export function SponsorWallCard({
  sponsor,
  className,
  onOpen,
}: {
  sponsor: PublicSponsor;
  className?: string;
  onOpen: (sponsor: PublicSponsor) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(sponsor)}
      className={cn(
        "flex max-h-[230px] flex-col rounded-xl bg-[var(--creed-surface)] p-5 text-left transition-colors hover:bg-[var(--creed-surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--creed-accent)]/35",
        className,
      )}
    >
      <SponsorAvatar sponsor={sponsor} />
      <h2 className="mt-4 text-[15px] font-medium">{sponsor.name || "Anonymous"}</h2>
      {sponsor.message ? (
        <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-[var(--creed-text-secondary)]">
          {sponsor.message}
        </p>
      ) : null}
      <DonationTags donations={sponsor.donations} responsive className="pt-4" />
    </button>
  );
}

export function SponsorMessageDialog({
  open,
  sponsor,
  onOpenChange,
}: {
  open: boolean;
  sponsor: PublicSponsor | null;
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
              <DialogTitle className="mt-6">{sponsor.name || "Anonymous"}</DialogTitle>
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

export async function loadSponsorDetail(sponsor: PublicSponsor) {
  try {
    const response = await fetch(`/api/sponsor/wall/${sponsor.id}`);
    if (!response.ok) return sponsor;
    const payload = (await response.json()) as { sponsor?: unknown };
    return publicSponsorFromApi(payload.sponsor) ?? sponsor;
  } catch {
    return sponsor;
  }
}

export function DonationTags({
  donations,
  responsive = false,
  className,
}: {
  donations: readonly number[];
  responsive?: boolean;
  className?: string;
}) {
  if (responsive) {
    return <ResponsiveDonationTags donations={donations} className={className} />;
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
        (_, index) => measurementRefs.current[index]?.offsetWidth ?? 0,
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
  ),
);

DonationTag.displayName = "DonationTag";
