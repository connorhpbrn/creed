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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Checkerboard,
  Contrast,
  ChevronDown,
  Logout,
  Plug,
  Settings,
} from "@/components/ui/phosphor-icons";
import { NotificationMenu } from "@/components/creed/notification-menu";
import { useTheme } from "@/components/creed/theme-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { accentColorMap, type CreedSection } from "@/lib/creed-data";
import { sectionDepth, sectionHasChildren, collapsedHiddenIds } from "@/lib/section-hierarchy";
import { cn } from "@/lib/utils";
import { useCreed } from "@/components/creed/creed-provider";
import { preloadSettingsData } from "@/components/creed/settings-preload";
import { preloadMcpHealth } from "@/components/creed/mcp-health-preload";

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
  onSectionSelect?: (sectionId: string) => void;
  onProposalSelect?: (proposalId: string) => void;
};

type ShellActionsContextValue = {
  registerFileActions: (actions: ShellFileActions) => () => void;
  setActiveSectionId: (sectionId: string | null) => void;
  setLiveSections: (sections: CreedSection[] | null) => void;
};

const ShellActionsContext = createContext<ShellActionsContextValue | null>(null);

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Checkerboard },
  { href: "/connections", label: "Connections", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
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

  return (
    <Link
      href={item.href}
      className={cn(
        // Sizing kept identical to the section nav buttons below this row so
        // the two stacks read as one continuous list. On mobile each button is
        // a centred square (h-8 w-8) so the selected-state background reads as
        // a square, not a slight rectangle; lg restores the full-width row.
        "flex h-8 w-8 mx-auto items-center justify-center rounded-[10px] text-[14px] font-medium text-[var(--creed-text-secondary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] lg:h-auto lg:w-auto lg:mx-0 lg:min-h-0 lg:justify-start lg:gap-3 lg:px-2 lg:py-2",
        active &&
          "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)] hover:bg-[var(--creed-surface-raised)]"
      )}
      aria-label={item.label}
      onMouseEnter={() => {
        router.prefetch(item.href);
      }}
    >
      <Icon className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
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
  const searchParams = useSearchParams();
  const { signOut, state, exportMarkdown } = useCreed();
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const fileActionsRef = useRef<ShellFileActions>({});
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [liveSections, setLiveSections] = useState<CreedSection[] | null>(null);
  const documentOpen = pathname === "/file" && Boolean(searchParams.get("document"));
  // On a shared-document view the sidebar becomes the document's outline: a
  // work tree of its sections (nested by depth) instead of the global app nav.
  // Everywhere else the sidebar stays identical to /dashboard. The document's
  // live sections are pushed in from file-screen via useCreedShellLiveSections.
  const visibleNavItems = documentOpen ? [] : navItems;
  // Only render the document outline once its live sections have actually
  // arrived (file-screen pushes them via useCreedShellLiveSections). Until then
  // liveSections is null, so we keep the sidebar clean during skeleton load.
  const showLegacySections: boolean = documentOpen && liveSections !== null;
  // In document mode the outline must come ONLY from the open document's live
  // sections. Never fall back to the personal-creed `sections` here or they
  // leak into the document sidebar during the brief window before mount.
  const sidebarSections = useMemo(
    () => liveSections ?? (documentOpen ? [] : sections),
    [documentOpen, liveSections, sections]
  );
  // Sidebar outline collapse. View-only and local to the rail: collapsing a
  // parent here hides its subtree in the outline without touching the editor's
  // own collapse state or anything serialized. Mirrors the editor's logic via
  // the shared section-hierarchy helpers so nesting reads consistently.
  const [collapsedSidebarIds, setCollapsedSidebarIds] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  const toggleSidebarCollapsed = useCallback((sectionId: string) => {
    setCollapsedSidebarIds((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);
  const activeSidebarSections = useMemo(
    () => sidebarSections.filter((section) => !section.archived),
    [sidebarSections]
  );
  const sidebarHasDisclosure = useMemo(
    () => activeSidebarSections.some((_, index) => sectionHasChildren(activeSidebarSections, index)),
    [activeSidebarSections]
  );
  const hiddenSidebarIds = useMemo(
    () => collapsedHiddenIds(activeSidebarSections, collapsedSidebarIds),
    [activeSidebarSections, collapsedSidebarIds]
  );
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
      setLiveSections,
    }),
    [registerFileActions]
  );
  const pendingProposalCountBySection = useMemo(() => {
    if (documentOpen) {
      return new Map<string, number>();
    }
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
  }, [documentOpen, state.proposals, pendingProposalSectionIds]);

  // Sidebar previews for structural proposals. Existing sections with a
  // pending delete-section proposal get a red wash; pending new-section
  // proposals render a green phantom row so the proposed section is
  // visible alongside real ones.
  const pendingDeleteSectionIds = useMemo(() => {
    const ids = new Set<string>();
    if (documentOpen) {
      return ids;
    }
    for (const proposal of state.proposals) {
      if (proposal.status !== "pending") continue;
      if (proposal.draft.kind === "delete-section") {
        ids.add(proposal.sectionId);
      }
    }
    return ids;
  }, [documentOpen, state.proposals]);
  const pendingNewSections = useMemo(() => {
    const rows: Array<{ id: string; name: string }> = [];
    if (documentOpen) {
      return rows;
    }
    for (const proposal of state.proposals) {
      if (proposal.status !== "pending") continue;
      if (proposal.draft.kind !== "new-section") continue;
      rows.push({
        id: proposal.id,
        name: proposal.draft.name?.trim() || "Untitled",
      });
    }
    return rows;
  }, [documentOpen, state.proposals]);

  useEffect(() => {
    navItems.forEach((item) => {
      router.prefetch(item.href);
    });
  }, [router]);

  useEffect(() => {
    const githubConnected = state.settings.integrations.github.status === "connected";
    preloadSettingsData({
      scope: state.user.email || state.user.handle,
      githubConnected,
      repoOwner: state.settings.versionControl.repoOwner,
      repoName: state.settings.versionControl.repoName,
      // The markdown only feeds the GitHub version-status preload, so skip the
      // full export rebuild entirely when GitHub isn't connected.
      markdown: githubConnected && state.sections.length ? exportMarkdown() : undefined,
    });
    if (state.sections.length) {
      preloadMcpHealth();
    }
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

  return (
    <ShellActionsContext.Provider value={shellActions}>
      <div className="grid h-screen grid-cols-[48px_minmax(0,1fr)] overflow-hidden bg-[var(--creed-surface)] lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="h-screen overflow-hidden border-r border-[var(--creed-border)] bg-[var(--creed-surface)] px-1.5 py-3 lg:px-5 lg:py-5">
          <div className="flex h-full flex-col">
            <div className="hidden flex-col gap-3 px-1 lg:flex">
              {documentOpen ? (
                <ShellUtilityActions
                  signOut={signOut}
                  includeDashboard
                  className="w-full flex-row justify-between gap-1"
                  itemClassName="flex-1"
                />
              ) : null}
              <div className="flex items-center gap-2.5 px-0.5">
                <ShellAvatar
                  avatarInitials={avatarInitials}
                  avatarUrl={avatarUrl}
                  failedAvatarUrl={failedAvatarUrl}
                  userName={userName}
                  onAvatarError={setFailedAvatarUrl}
                  className="h-7 w-7 rounded-[9px] after:rounded-[9px]"
                  imageClassName="rounded-[9px]"
                />
                <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-[var(--creed-text-primary)]">
                  {userName}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center px-1 py-1 lg:hidden">
              <ShellAvatar
                avatarInitials={avatarInitials}
                avatarUrl={avatarUrl}
                failedAvatarUrl={failedAvatarUrl}
                userName={userName}
                onAvatarError={setFailedAvatarUrl}
                className="h-6 w-6 rounded-[8px] after:rounded-[8px]"
                imageClassName="rounded-[8px]"
              />
            </div>
            <Separator className="my-2 bg-[var(--creed-border)]" />

            {visibleNavItems.length > 0 ? (
              <nav className="space-y-1">
                {visibleNavItems.map((item) => {
                  const active = pathname === item.href;

                  return <ShellNavLink key={item.href} item={item} active={active} />;
                })}
              </nav>
            ) : null}

            {showLegacySections ? (
              <>
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto creed-scrollbar lg:pr-1">
              {activeSidebarSections.map((section, sectionIndex) => {
                if (hiddenSidebarIds.has(section.id)) return null;
                const pendingCount = pendingProposalCountBySection.get(section.id) ?? 0;
                const isActive = activeSectionId === section.id && pathname === "/file";
                const pendingDelete = pendingDeleteSectionIds.has(section.id);
                const depth = sectionDepth(section);
                const hasChildren = sectionHasChildren(activeSidebarSections, sectionIndex);
                const collapsed = collapsedSidebarIds.has(section.id);
                const content = (
                  <>
                    {depth > 0 ? (
                      // Indent nested sections so the outline reads as a work
                      // tree. Only on lg where labels are visible; the mobile
                      // rail is icon-only and stays flush.
                      <span
                        aria-hidden
                        className="hidden shrink-0 lg:block"
                        style={{ width: depth * 10 }}
                      />
                    ) : null}
                    {/* Only reserve disclosure space when this outline actually
                        has expandable rows. A flat document should start its
                        dots at the chevron position, not after an invisible
                        placeholder. */}
                    {hasChildren ? (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-expanded={!collapsed}
                        aria-label={collapsed ? `Expand ${section.name}` : `Collapse ${section.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleSidebarCollapsed(section.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleSidebarCollapsed(section.id);
                          }
                        }}
                        className="hidden h-3.5 w-3.5 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--creed-text-secondary)] transition-colors hover:text-[var(--creed-text-primary)] lg:inline-flex"
                      >
                        <ChevronDown
                          className={cn(
                            "h-3 w-3 transition-transform duration-200",
                            collapsed ? "-rotate-90" : "rotate-0"
                          )}
                        />
                      </span>
                    ) : sidebarHasDisclosure ? (
                      <span aria-hidden className="hidden h-3.5 w-3.5 shrink-0 lg:block" />
                    ) : (
                      null
                    )}
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[3px] lg:h-1.5 lg:w-1.5 lg:rounded-[2px]"
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
                      "flex h-8 w-8 mx-auto items-center justify-center rounded-[10px] text-left text-[12px] font-medium text-[var(--creed-text-secondary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] lg:h-auto lg:w-full lg:mx-0 lg:min-h-0 lg:justify-start lg:gap-1.5 lg:px-1.5 lg:py-1.5",
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
                    "flex h-8 w-8 mx-auto items-center justify-center rounded-[10px] bg-[#ECFDF5] text-left text-[12px] font-medium text-[#047857] transition-colors duration-150 hover:bg-[#D1FAE5] hover:text-[#065F46] dark:bg-[#052e1a]/40 dark:text-[#4ade80] dark:hover:bg-[#052e1a]/60 dark:hover:text-[#4ade80] lg:h-auto lg:w-full lg:mx-0 lg:min-h-0 lg:justify-start lg:gap-1.5 lg:px-1.5 lg:py-1.5",
                    // Same active-equals-hover rule as the pending-delete
                    // rows above: once the user has scrolled into the
                    // proposal preview, lock the row into its hover tone.
                    isActive && "bg-[#D1FAE5] text-[#065F46] dark:bg-[#052e1a]/60"
                  )}
                  aria-label={`Proposed: ${row.name}`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-[3px] lg:h-1.5 lg:w-1.5 lg:rounded-[2px]"
                    style={{ backgroundColor: "#10B981" }}
                  />
                  <span className="hidden truncate lg:inline">{row.name}</span>
                </button>
                );
              })}
            </div>
              </>
            ) : (
              <div className="min-h-0 flex-1" />
            )}

            <div className="mt-auto">
              <Separator className="my-4 bg-[var(--creed-border)] lg:my-5" />
              <ShellUtilityActions
                signOut={signOut}
                includeDashboard={!documentOpen}
                className={cn(
                  "flex-col items-center gap-1 lg:flex-row lg:justify-center lg:gap-1.5",
                  documentOpen && "lg:hidden"
                )}
              />
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

export function useCreedShellLiveSections(sections: CreedSection[] | null) {
  const context = useContext(ShellActionsContext);

  useEffect(() => {
    if (!context) {
      return;
    }

    context.setLiveSections(sections);
    return () => context.setLiveSections(null);
  }, [context, sections]);
}

function ShellAvatar({
  avatarInitials,
  avatarUrl,
  failedAvatarUrl,
  userName,
  onAvatarError,
  className,
  imageClassName,
}: {
  avatarInitials: string;
  avatarUrl?: string;
  failedAvatarUrl: string | null;
  userName: string;
  onAvatarError: (url: string) => void;
  className?: string;
  imageClassName?: string;
}) {
  const showAvatarImage = Boolean(avatarUrl) && failedAvatarUrl !== avatarUrl;

  return (
    <Avatar
      className={cn(
        "overflow-hidden border border-[var(--creed-border)] bg-[var(--creed-surface-raised)]",
        className
      )}
    >
      {showAvatarImage && avatarUrl ? (
        <Image
          key={avatarUrl}
          src={avatarUrl}
          alt={userName}
          fill
          className={cn("object-cover", imageClassName)}
          referrerPolicy="no-referrer"
          unoptimized
          onError={() => onAvatarError(avatarUrl)}
        />
      ) : (
        <AvatarFallback className="bg-transparent text-xs font-medium text-[var(--creed-text-primary)]">
          {avatarInitials}
        </AvatarFallback>
      )}
    </Avatar>
  );
}

function ShellUtilityActions({
  signOut,
  includeDashboard,
  className,
  itemClassName,
}: {
  signOut: () => void | Promise<void>;
  includeDashboard?: boolean;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <div className={cn("flex", className)}>
      {includeDashboard ? (
        <SimpleTooltip label="Dashboard">
          <Button
            asChild
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 rounded-[10px] text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]",
              itemClassName
            )}
            aria-label="Dashboard"
          >
            <Link href="/dashboard">
              <Checkerboard className="h-4 w-4" />
            </Link>
          </Button>
        </SimpleTooltip>
      ) : null}
      <NotificationMenu iconOnly className={itemClassName} />
      <DarkModeButton className={itemClassName} />
      <SimpleTooltip label="Log out">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 rounded-[10px] text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]",
            itemClassName
          )}
          aria-label="Log out"
          onClick={() => void signOut()}
        >
          <Logout className="h-4 w-4" />
        </Button>
      </SimpleTooltip>
    </div>
  );
}

function DarkModeButton({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <SimpleTooltip label={theme === "dark" ? "Switch to light" : "Switch to dark"}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8 rounded-[10px] text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]",
          className
        )}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        onClick={(event) => {
          // Emit the theme reveal from the centre of the button so the
          // animation feels rooted where the user clicked.
          const rect = event.currentTarget.getBoundingClientRect();
          toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        }}
      >
        <Contrast className="h-4 w-4" />
      </Button>
    </SimpleTooltip>
  );
}
