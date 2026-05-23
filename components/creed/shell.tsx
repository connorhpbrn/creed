"use client";

import Image from "next/image";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { AnimatedMenuIconItem } from "@/components/creed/animated-icon-action";
import { FeedbackMenuItem } from "@/components/creed/feedback-menu";
import { BookTextIcon } from "@/components/ui/book-text";
import { ConnectIcon } from "@/components/ui/connect";
import { ContrastIcon, type ContrastIconHandle } from "@/components/ui/contrast";
import { FileTextIcon } from "@/components/ui/file-text";
import { LinkIcon } from "@/components/ui/link";
import { LogoutIcon } from "@/components/ui/logout";
import { SettingsIcon } from "@/components/ui/settings";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { useTheme } from "@/components/creed/theme-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { accentColorMap, type CreedSection } from "@/lib/creed-data";
import { cn } from "@/lib/utils";
import { CreedMark, CreedWordmark } from "@/components/creed/brand";
import { useCreed } from "@/components/creed/creed-provider";
import { preloadSettingsData } from "@/components/creed/settings-preload";

const FILE_NAV_INTENT_KEY = "creed:file-nav-intent";

type ShellProps = {
  children: ReactNode;
  userName: string;
  avatarInitials: string;
  avatarUrl?: string;
  sections: CreedSection[];
  pendingProposalSectionIds?: string[];
};

type ShellFileActions = {
  onAddSection?: () => void;
  onSectionSelect?: (sectionId: string) => void;
  onProposalSelect?: (proposalId: string) => void;
};

type ShellActionsContextValue = {
  registerFileActions: (actions: ShellFileActions) => () => void;
  setActiveSectionId: (sectionId: string | null) => void;
};

const ShellActionsContext = createContext<ShellActionsContextValue | null>(null);

const navItems = [
  { href: "/file", label: "File", icon: FileTextIcon },
  { href: "/connections", label: "Connections", icon: ConnectIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function ShellNavLink({
  item,
  active,
}: {
  item: (typeof navItems)[number];
  active: boolean;
}) {
  const Icon = item.icon;
  const router = useRouter();
  const { iconRef, start, settle, initialState } = useAnimatedIconControls(120);

  return (
    <Link
      href={item.href}
      className={cn(
        // Sizing kept identical to the section nav buttons below this row
        // (rounded-[10px], px-1.5 py-2.5, lg:px-2 lg:py-2, min-h-[34px])
        // so the two stacks read as one continuous list of equal-height
        // pills rather than two different button styles.
        "flex min-h-[34px] items-center justify-center rounded-[10px] px-1.5 py-2.5 text-[13px] font-medium text-[var(--creed-text-secondary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] lg:min-h-0 lg:justify-start lg:gap-3 lg:px-2 lg:py-2",
        active &&
          "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)] hover:bg-[var(--creed-surface-raised)]"
      )}
      aria-label={item.label}
      onMouseEnter={() => {
        router.prefetch(item.href);
        start();
      }}
      onMouseLeave={settle}
    >
      <Icon
        ref={iconRef}
        size={14}
        initialState={initialState}
        className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none"
      />
      <span className="hidden lg:inline">{item.label}</span>
    </Link>
  );
}

export function CreedShell({
  children,
  userName,
  avatarInitials,
  avatarUrl,
  sections,
  pendingProposalSectionIds = [],
}: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut, state, exportMarkdown } = useCreed();
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const fileActionsRef = useRef<ShellFileActions>({});
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const registerFileActions = useCallback((actions: ShellFileActions) => {
    fileActionsRef.current = actions;

    return () => {
      if (fileActionsRef.current === actions) {
        fileActionsRef.current = {};
      }
    };
  }, []);
  const shellActions = useMemo<ShellActionsContextValue>(
    () => ({
      registerFileActions,
      setActiveSectionId,
    }),
    [registerFileActions]
  );
  const showAvatarImage = Boolean(avatarUrl) && failedAvatarUrl !== avatarUrl;
  const pendingProposalCountBySection = useMemo(() => {
    const counts = new Map<string, number>();
    for (const proposal of state.proposals) {
      if (proposal.status !== "pending") continue;
      counts.set(proposal.sectionId, (counts.get(proposal.sectionId) ?? 0) + 1);
    }
    if (pendingProposalSectionIds.length && counts.size === 0) {
      // Fall back to the boolean signal from the parent if state.proposals
      // hasn't hydrated yet.
      for (const id of pendingProposalSectionIds) counts.set(id, 1);
    }
    return counts;
  }, [state.proposals, pendingProposalSectionIds]);

  // Sidebar previews for structural proposals. Existing sections with a
  // pending delete-section proposal get a red wash; pending new-section
  // proposals render a green phantom row so the proposed section is
  // visible alongside real ones.
  const pendingDeleteSectionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const proposal of state.proposals) {
      if (proposal.status !== "pending") continue;
      if (proposal.draft.kind === "delete-section") {
        ids.add(proposal.sectionId);
      }
    }
    return ids;
  }, [state.proposals]);
  const pendingNewSections = useMemo(() => {
    const rows: Array<{ id: string; name: string }> = [];
    for (const proposal of state.proposals) {
      if (proposal.status !== "pending") continue;
      if (proposal.draft.kind !== "new-section") continue;
      rows.push({
        id: proposal.id,
        name: proposal.draft.name?.trim() || "New section",
      });
    }
    return rows;
  }, [state.proposals]);

  useEffect(() => {
    navItems.forEach((item) => {
      router.prefetch(item.href);
    });
  }, [router]);

  useEffect(() => {
    preloadSettingsData({
      scope: state.user.email || state.user.handle,
      githubConnected: state.settings.integrations.github.status === "connected",
      repoOwner: state.settings.versionControl.repoOwner,
      repoName: state.settings.versionControl.repoName,
      markdown: state.sections.length ? exportMarkdown() : undefined,
    });
  }, [
    exportMarkdown,
    state.sections,
    state.user.email,
    state.user.handle,
    state.settings.integrations.github.status,
    state.settings.versionControl.repoName,
    state.settings.versionControl.repoOwner,
  ]);

  function setFileIntent(
    intent:
      | { type: "section"; sectionId: string }
      | { type: "compose" }
      | { type: "proposal"; proposalId: string }
  ) {
    if (typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem(FILE_NAV_INTENT_KEY, JSON.stringify(intent));
  }

  function handleSectionClick(sectionId: string) {
    if (pathname === "/file" && fileActionsRef.current.onSectionSelect) {
      fileActionsRef.current.onSectionSelect(sectionId);
      return;
    }

    setFileIntent({ type: "section", sectionId });
    router.push("/file");
  }

  function handleAddSectionClick() {
    if (pathname === "/file" && fileActionsRef.current.onAddSection) {
      fileActionsRef.current.onAddSection();
      return;
    }

    setFileIntent({ type: "compose" });
    router.push("/file");
  }

  return (
    <ShellActionsContext.Provider value={shellActions}>
      <div className="grid h-screen grid-cols-[52px_minmax(0,1fr)] overflow-hidden bg-[var(--creed-surface)] lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="h-screen overflow-hidden border-r border-[var(--creed-border)] bg-[var(--creed-surface)] px-1.5 py-3 lg:px-5 lg:py-5">
          <div className="flex h-full flex-col">
            <div className="flex justify-center lg:justify-start">
              <div className="lg:hidden">
                <CreedMark />
              </div>
              <div className="hidden lg:block">
                <CreedWordmark className="ml-2" />
              </div>
            </div>

            <nav className="mt-5 space-y-1 lg:mt-8">
              {navItems.map((item) => {
                const active = pathname === item.href;

                return <ShellNavLink key={item.href} item={item} active={active} />;
              })}
            </nav>

            <Separator className="my-4 bg-[var(--creed-border)] lg:my-6" />

            <div className="hidden text-[12px] font-medium text-[var(--creed-text-tertiary)] lg:block">
              Sections
            </div>
            <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto creed-scrollbar lg:mt-4 lg:pr-1">
              {sections.map((section) => {
                const pendingCount = pendingProposalCountBySection.get(section.id) ?? 0;
                const isActive = activeSectionId === section.id && pathname === "/file";
                const pendingDelete = pendingDeleteSectionIds.has(section.id);
                const content = (
                  <>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full lg:h-1.5 lg:w-1.5"
                      style={{
                        // Pending-delete dot turns red so the row reads as
                        // a coherent "this is being removed" signal rather
                        // than the original accent next to a red wash.
                        backgroundColor: pendingDelete
                          ? "#DC2626"
                          : accentColorMap[section.accent],
                      }}
                    />
                    <span
                      className={cn(
                        "hidden truncate lg:inline",
                        pendingDelete && "line-through"
                      )}
                    >
                      {section.name}
                    </span>
                    {pendingCount > 0 ? (
                      <span
                        className="ml-auto hidden h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-[#2563EB] px-1.5 text-[10px] font-medium leading-none text-white tabular-nums lg:inline-flex"
                        aria-label={`${pendingCount} pending proposal${pendingCount === 1 ? "" : "s"}`}
                      >
                        {pendingCount}
                      </span>
                    ) : null}
                  </>
                );

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => handleSectionClick(section.id)}
                    className={cn(
                      "flex min-h-[34px] w-full items-center justify-center rounded-[10px] px-1.5 py-2.5 text-left text-[13px] text-[var(--creed-text-secondary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] lg:min-h-0 lg:justify-start lg:gap-3 lg:px-2 lg:py-2",
                      isActive &&
                        "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)] hover:bg-[var(--creed-surface-raised)]",
                      // Pending delete: subtle red wash and red text so the
                      // row reads as "this section is on its way out" but
                      // still navigable until the user accepts/rejects.
                      pendingDelete &&
                        "bg-[#FEF2F2] text-[#B91C1C] hover:bg-[#FDE2E2] hover:text-[#991B1B] dark:bg-[#3F1212]/35 dark:text-[#F87171] dark:hover:bg-[#3F1212]/55 dark:hover:text-[#F87171]",
                      // When the user is currently viewing a pending-delete
                      // section, lock in the hover variant so the active
                      // state reads the same way it does on every other
                      // tab in this sidebar.
                      pendingDelete && isActive &&
                        "bg-[#FDE2E2] text-[#991B1B] dark:bg-[#3F1212]/55"
                    )}
                    aria-label={section.name}
                  >
                    {content}
                  </button>
                );
              })}

              {/* Phantom rows for pending new-section proposals. Visually a
                  preview of what the sidebar would look like if the user
                  accepts the proposal. Clicking jumps to /file so the user
                  can review the proposal in context. */}
              {pendingNewSections.map((row) => {
                const isActive = activeSectionId === row.id && pathname === "/file";
                return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    if (pathname === "/file" && fileActionsRef.current.onProposalSelect) {
                      fileActionsRef.current.onProposalSelect(row.id);
                      return;
                    }
                    setFileIntent({ type: "proposal", proposalId: row.id });
                    router.push("/file");
                  }}
                  className={cn(
                    "flex min-h-[34px] w-full items-center justify-center rounded-[10px] bg-[#ECFDF5] px-1.5 py-2.5 text-left text-[13px] text-[#047857] transition-colors duration-150 hover:bg-[#D1FAE5] hover:text-[#065F46] dark:bg-[#052e1a]/40 dark:text-[#4ade80] dark:hover:bg-[#052e1a]/60 dark:hover:text-[#4ade80] lg:min-h-0 lg:justify-start lg:gap-3 lg:px-2 lg:py-2",
                    // Same active-equals-hover rule as the pending-delete
                    // rows above: once the user has scrolled into the
                    // proposal preview, lock the row into its hover tone.
                    isActive && "bg-[#D1FAE5] text-[#065F46] dark:bg-[#052e1a]/60"
                  )}
                  aria-label={`Proposed: ${row.name}`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full lg:h-1.5 lg:w-1.5"
                    style={{ backgroundColor: "#10B981" }}
                  />
                  <span className="hidden truncate lg:inline">{row.name}</span>
                </button>
                );
              })}

              <button
                type="button"
                onClick={handleAddSectionClick}
                className="flex min-h-[34px] w-full items-center justify-center rounded-[10px] px-1.5 py-2.5 text-left text-[13px] text-[var(--creed-text-tertiary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] lg:min-h-0 lg:justify-start lg:gap-2 lg:px-2 lg:py-2"
                aria-label="Add section"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
                <span className="hidden lg:inline"> Add section</span>
              </button>
            </div>

            <div className="mt-auto">
              <Separator className="my-4 bg-[var(--creed-border)] lg:my-6" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-auto w-full min-w-0 justify-center rounded-md border-0 bg-transparent px-1 py-1 transition-colors hover:bg-[var(--creed-surface-raised)] aria-expanded:bg-[var(--creed-surface-raised)] lg:justify-between lg:bg-transparent lg:px-2.5 lg:py-1.5"
                  >
                    <span className="flex min-w-0 w-full items-center justify-center gap-2.5 lg:justify-start">
                      <Avatar className="h-6 w-6 overflow-hidden rounded-[8px] border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] after:rounded-[8px]">
                        {showAvatarImage && avatarUrl ? (
                          <Image
                            key={avatarUrl}
                            src={avatarUrl}
                            alt={userName}
                            fill
                            className="rounded-[8px] object-cover"
                            referrerPolicy="no-referrer"
                            unoptimized
                            onError={() => setFailedAvatarUrl(avatarUrl)}
                          />
                        ) : (
                          <AvatarFallback className="bg-transparent text-xs font-medium text-[var(--creed-text-primary)]">
                            {avatarInitials}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <span className="hidden min-w-0 flex-1 truncate text-left text-sm font-medium text-[var(--creed-text-primary)] lg:inline">
                        {userName}
                      </span>
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-(--radix-dropdown-menu-trigger-width) border-[var(--creed-border)] bg-[var(--creed-surface)]"
                >
                  <AnimatedMenuIconItem
                    icon={LinkIcon}
                    className="text-[13px]"
                    onSelect={() => {
                      router.push("/home");
                    }}
                  >
                    Homepage
                  </AnimatedMenuIconItem>
                  <AnimatedMenuIconItem
                    icon={BookTextIcon}
                    className="text-[13px]"
                    onSelect={() => {
                      router.push("/docs");
                    }}
                  >
                    Docs
                  </AnimatedMenuIconItem>
                  <FeedbackMenuItem />
                  <ThemeToggleMenuItem />
                  <AnimatedMenuIconItem
                    icon={LogoutIcon}
                    className="text-[13px]"
                    onSelect={() => {
                      void signOut();
                    }}
                  >
                    Log out
                  </AnimatedMenuIconItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </aside>

        <main className="h-screen min-w-0 overflow-hidden bg-[var(--creed-surface)]">
          {children}
        </main>
      </div>
    </ShellActionsContext.Provider>
  );
}

export function useCreedShellFileActions(actions: ShellFileActions) {
  const context = useContext(ShellActionsContext);

  useEffect(() => {
    if (!context) {
      return;
    }

    return context.registerFileActions(actions);
  }, [actions, context]);
}

export function useCreedShellActiveSection() {
  const context = useContext(ShellActionsContext);
  return context?.setActiveSectionId ?? (() => {});
}

function ThemeToggleMenuItem() {
  const { theme, toggleTheme } = useTheme();
  const iconRef = useRef<ContrastIconHandle | null>(null);

  return (
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault();
        // On touch / dropdown clicks the cursor isn't a useful origin —
        // emit the reveal from the centre of the menu row itself so the
        // animation feels rooted at the button the user just tapped.
        const target = event.target as HTMLElement | null;
        const rect = target?.getBoundingClientRect();
        const origin = rect
          ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          : undefined;
        toggleTheme(origin);
      }}
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
      className="flex items-center justify-between gap-2 text-[13px]"
    >
      <span className="flex items-center gap-2">
        <ContrastIcon ref={iconRef} size={14} className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
        <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
      </span>
      <kbd className="inline-flex h-5 w-5 items-center justify-center rounded border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] text-[10px] font-medium text-[var(--creed-text-secondary)]">
        M
      </kbd>
    </DropdownMenuItem>
  );
}
