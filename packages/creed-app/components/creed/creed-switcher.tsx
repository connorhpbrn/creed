"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Check, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@creed/ui/dropdown-menu";
import {
  useCreedActions,
  useCreedStateSelector,
} from "@/components/creed/creed-provider";
import type { CreedState } from "@creed/core/creed-data";
import { ShortcutKey } from "@/components/creed/shortcut-key";
import { ProfileAvatar } from "@/components/creed/profile-avatar";
import { NewCreedDialog } from "@/components/creed/new-creed-dialog";
import { cn } from "@creed/ui/utils";

const LAST_ACTIVE_CREED_KEY = "creed:last-active-creed";

// The Creed switcher, rendered as the file-screen header title. Shows the active
// Creed as a Markdown filename with a dropdown arrow and keyboard affordance.
// The menu remains available with one Creed because creation is part of the switcher.
const TITLE_CLASS =
  "font-heading text-[1.22rem] font-medium tracking-[-0.03em] text-[var(--creed-text-primary)] md:text-[1.45rem]";

function sameSwitcherState(left: CreedState, right: CreedState) {
  return (
    left.creedId === right.creedId &&
    left.creedType === right.creedType &&
    left.shared === right.shared &&
    left.creeds === right.creeds &&
    left.user === right.user
  );
}

export function CreedSwitcher() {
  const { switchCreed } = useCreedActions();
  const state = useCreedStateSelector(
    (snapshot) => snapshot,
    sameSwitcherState,
  );
  const router = useRouter();
  const pathname = usePathname();
  const [switching, setSwitching] = useState(false);
  const [optimisticId, setOptimisticId] = useState<string | null>(null);
  const [newCreedOpen, setNewCreedOpen] = useState(false);
  const previousActiveIdRef = useRef<string | null>(null);

  const creeds = useMemo(() => state.creeds ?? [], [state.creeds]);
  const activeId = state.creedId ?? creeds.find((c) => c.type === "personal")?.id ?? creeds[0]?.id ?? null;
  const shownActiveId = optimisticId ?? activeId;
  const optimisticCreed = useMemo(
    () => creeds.find((creed) => creed.id === shownActiveId) ?? null,
    [creeds, shownActiveId],
  );
  const displayName = optimisticCreed
    ? optimisticCreed.name
    : state.creedType === "shared"
      ? state.shared?.creedName ?? "Shared"
      : state.user.name;
  const hasMarkdownSuffix = /\.md$/i.test(displayName);
  const displayFilename = hasMarkdownSuffix ? displayName : `${displayName}.md`;

  useEffect(() => {
    if (optimisticId && activeId === optimisticId) {
      setOptimisticId(null);
    }
  }, [activeId, optimisticId]);

  const switchTo = useCallback(
    async (creed: { id: string }) => {
      if (creed.id === activeId) return;
      setSwitching(true);
      setOptimisticId(creed.id);
      try {
        // Instant, client-side swap: replaces provider state wholesale, no full
        // route refresh.
        const result = await switchCreed(creed.id);
        if (!result.ok) {
          toast.error(result.error ?? "Could not switch Creed.");
          setOptimisticId(null);
        }
        setSwitching(false);
      } catch {
        toast.error("Could not switch Creed.");
        setOptimisticId(null);
        setSwitching(false);
      }
    },
    [activeId, switchCreed],
  );

  useEffect(() => {
    if (!activeId) return;
    const previous = previousActiveIdRef.current;
    if (previous && previous !== activeId) {
      try {
        window.localStorage.setItem(LAST_ACTIVE_CREED_KEY, previous);
      } catch {}
    }
    previousActiveIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    function isEditable(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "c" && event.key !== "C") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.isComposing || event.repeat || event.defaultPrevented) return;
      if (isEditable(event.target) || switching || !activeId) return;

      event.preventDefault();

      let targetId: string | null = null;
      try {
        const stored = window.localStorage.getItem(LAST_ACTIVE_CREED_KEY);
        if (stored && stored !== activeId && creeds.some((creed) => creed.id === stored)) {
          targetId = stored;
        }
      } catch {}

      if (!targetId) {
        const currentIndex = creeds.findIndex((creed) => creed.id === activeId);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % creeds.length : 0;
        targetId = creeds[nextIndex]?.id ?? null;
      }

      const target = targetId ? creeds.find((creed) => creed.id === targetId) : undefined;
      if (target) {
        void switchTo(target);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeId, creeds, switchTo, switching]);

  return (
    <>
      <DropdownMenu>
        <div className="inline-flex max-w-full min-w-0 items-center gap-2.5">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Switch Creed"
            disabled={switching}
            // No card: aligned like the plain title, greyed on hover the same way
            // the brand mark dims (opacity), and the arrow points down by default,
            // flipping up while the menu is open.
            className="group/switcher inline-flex min-w-0 max-w-full items-center gap-2 text-left transition-opacity duration-[160ms] hover:opacity-60 disabled:opacity-70"
          >
            <span
              className={cn(TITLE_CLASS, "inline-flex min-w-0 max-w-full")}
              title={displayFilename}
            >
              <span className="min-w-0 truncate">{displayName}</span>
              {hasMarkdownSuffix ? null : (
                <span className="shrink-0">.md</span>
              )}
            </span>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-[var(--creed-text-primary)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[state=open]/switcher:rotate-180"
              strokeWidth={2}
            />
          </button>
        </DropdownMenuTrigger>
          <ShortcutKey className="hidden md:inline-flex">C</ShortcutKey>
        </div>
        <DropdownMenuContent
          align="start"
          className="min-w-[250px] rounded-lg border-[var(--creed-border)] bg-[var(--creed-surface)] p-1"
        >
        {creeds.map((creed) => {
          const label = creed.name;
          const isActive = creed.id === shownActiveId;
          return (
            <DropdownMenuItem
              key={creed.id}
              disabled={switching}
              onSelect={() => {
                void switchTo(creed);
              }}
              className="flex items-center justify-between gap-2.5 rounded-sm py-1.5 pl-1.5 pr-2.5 text-[13px]"
            >
              <span className="flex min-w-0 items-center gap-2 text-[var(--creed-text-primary)]">
                <ProfileAvatar
                  kind={creed.type === "shared" ? "shared" : "person"}
                  name={label}
                  initials={creed.avatarInitials}
                  avatarUrl={creed.avatarUrl}
                  size="sm"
                />
                <span className="min-w-0 truncate">{label}</span>
              </span>
              {isActive ? (
                <Check
                  className="h-3.5 w-3.5 shrink-0 text-white!"
                  strokeWidth={1.8}
                />
              ) : null}
            </DropdownMenuItem>
          );
          })}
          <DropdownMenuSeparator className="mx-0 bg-[var(--creed-border)]" />
          <DropdownMenuItem
            disabled={switching}
            onSelect={() => setNewCreedOpen(true)}
            className="flex items-center justify-between gap-2.5 rounded-sm py-1.5 pl-1.5 pr-2.5 text-[13px]"
          >
            <span className="flex min-w-0 items-center gap-2 text-[var(--creed-text-primary)]">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] border border-dashed border-[var(--creed-border-strong)] bg-[var(--creed-surface-raised)]">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 truncate">New Creed</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewCreedDialog
        open={newCreedOpen}
        onOpenChange={setNewCreedOpen}
        accountName={state.user.name}
        initials={state.user.avatarInitials}
        onCreated={async (creed) => {
          setSwitching(true);
          setOptimisticId(creed.id);
          const result = await switchCreed(creed.id);
          if (!result.ok) {
            setSwitching(false);
            setOptimisticId(null);
            throw new Error(result.error ?? "Could not open this Creed.");
          }
          setSwitching(false);
          if (pathname !== "/file") {
            router.push("/file");
          }
        }}
      />
    </>
  );
}
