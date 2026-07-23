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
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import { AnimatedMenuIconItem } from "@/components/creed/animated-icon-action";
import { FeedbackMenuItem } from "@/components/creed/feedback-menu";
import { BookTextIcon } from "@/components/ui/book-text";
import { ConnectIcon } from "@/components/ui/connect";
import { ContrastIcon, type ContrastIconHandle } from "@/components/ui/contrast";
import { CreditCardIcon } from "@/components/ui/credit-card";
import { CpuIcon } from "@/components/ui/cpu";
import { BillingDialog } from "@/components/creed/billing-dialog";
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
import { CreedPanel, PANEL_OPEN_EVENT } from "@/components/creed/panel";
import {
  getAgentRunnerServerSnapshot,
  getAgentRunnerSnapshot,
  subscribeAgentRunner,
} from "@/lib/panel/agent-runner";
import { SearchIcon, type SearchIconHandle } from "@/components/ui/search";
import { useCreed } from "@/components/creed/creed-provider";
import { preloadSettingsData } from "@/components/creed/settings-preload";
import { preloadMcpHealth } from "@/components/creed/mcp-health-preload";
import { ShortcutKey } from "@/components/creed/shortcut-key";

const FILE_NAV_INTENT_KEY = "creed:file-nav-intent";
const SIDEBAR_COLLAPSED_KEY = "creed:sidebar-collapsed";
const SIDEBAR_PRESS_CLASS =
  "transform-gpu transition-[color,background-color,transform,filter] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:translate-y-px active:scale-[0.98] active:brightness-[0.96]";

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
  onOpenPush?: () => void;
  onSetActivityOpen?: (open: boolean) => void;
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
  collapsed,
}: {
  item: (typeof navItems)[number];
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const { iconRef, start, settle, initialState } = useAnimatedIconControls(120);

  return (
    <Link
      href={item.href}
      prefetch={true}
      className={cn(
        // Sizing kept identical to the section nav buttons below this row so
        // the two stacks read as one continuous list. On mobile each button is
        // a centred square (h-8 w-8) so the selected-state background reads as
        // a square, not a slight rectangle; lg restores the full-width row.
        // When the sidebar is collapsed (S key) the lg styles are dropped so
        // desktop renders the same icon rail as mobile.
        "flex h-8 w-8 mx-auto items-center justify-center rounded-sm text-[14px] font-medium text-[var(--creed-text-secondary)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]",
        SIDEBAR_PRESS_CLASS,
        !collapsed &&
          "lg:h-auto lg:w-auto lg:mx-0 lg:min-h-0 lg:justify-start lg:gap-3 lg:px-2 lg:py-2",
        active &&
          "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)] hover:bg-[var(--creed-surface-raised)]"
      )}
      aria-label={item.label}
      onMouseEnter={start}
      onMouseLeave={settle}
    >
      <Icon
        ref={iconRef}
        size={14}
        initialState={initialState}
        className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none"
      />
      <span className={cn("hidden", !collapsed && "lg:inline")}>{item.label}</span>
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
  const [billingOpen, setBillingOpen] = useState(false);
  const searchIconRef = useRef<SearchIconHandle | null>(null);
  const agentRun = useSyncExternalStore(subscribeAgentRunner, getAgentRunnerSnapshot, getAgentRunnerServerSnapshot);
  const agentBusy = agentRun.status === "working" || agentRun.status === "applying";
  // The launcher badge doubles as the agent's background status light: blue
  // while working, green when the last run succeeded, red when it failed, and
  // back to the plain "K" badge when idle.
  const agentTile = agentBusy
    ? { bg: "var(--creed-accent)", label: "Creed is working" }
    : agentRun.status === "result"
      ? { bg: "#16A34A", label: "Creed finished" }
      : agentRun.status === "error"
        ? { bg: "#DC2626", label: "Creed hit an error" }
        : null;
  // Desktop sidebar collapse (S key). Collapsed drops every lg: sidebar style
  // so desktop renders the same 48px icon rail as mobile. Persisted so the
  // choice survives reloads; read in an effect to keep SSR markup stable.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.key !== "s" && event.key !== "S") || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (!target || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;
      if (event.isComposing || event.repeat || event.defaultPrevented) return;
      event.preventDefault();
      setCollapsed((current) => {
        const next = !current;
        try {
          window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
        } catch {}
        return next;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
    // The settings preload warms the PERSONAL settings screen's shared caches
    // (AI settings, credits, usage, GitHub). It only runs for personal Creeds:
    // company mode renders its own settings screen that fetches per-Creed data
    // directly, and warming these creed-agnostic caches with company data would
    // leak it back to the personal screen after a Creed switch.
    if (state.creedType !== "company") {
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
    }
    if (state.sections.length) {
      preloadMcpHealth("30d", state.creedId ?? "");
    }
  }, [
    exportMarkdown,
    state.sections,
    state.creedId,
    state.creedType,
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
      | { type: "push" }
      | { type: "activity"; open: boolean }
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

  function handleProposalClick(proposalId: string) {
    if (pathname === "/file" && fileActionsRef.current.onProposalSelect) {
      fileActionsRef.current.onProposalSelect(proposalId);
      return;
    }

    setFileIntent({ type: "proposal", proposalId });
    router.push("/file");
  }

  function handleOpenPushClick() {
    if (pathname === "/file" && fileActionsRef.current.onOpenPush) {
      fileActionsRef.current.onOpenPush();
      return;
    }

    setFileIntent({ type: "push" });
    router.push("/file");
  }

  function handleActivityClick(open: boolean) {
    if (pathname === "/file" && fileActionsRef.current.onSetActivityOpen) {
      fileActionsRef.current.onSetActivityOpen(open);
      return;
    }

    setFileIntent({ type: "activity", open });
    router.push("/file");
  }

  return (
    <ShellActionsContext.Provider value={shellActions}>
      <div
        className={cn(
          "grid h-screen grid-cols-[48px_minmax(0,1fr)] overflow-hidden bg-[var(--creed-surface)] transition-[grid-template-columns] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          !collapsed && "lg:grid-cols-[220px_minmax(0,1fr)]"
        )}
      >
        <aside
          className={cn(
            "h-screen overflow-hidden border-r border-[var(--creed-border)] bg-[var(--creed-surface)] px-1.5 py-3",
            !collapsed && "lg:px-5 lg:py-5"
          )}
        >
          <div className="flex h-full flex-col">
            <Link
              href="/home"
              aria-label="Creed home"
              className={cn(
                "mx-auto flex h-8 w-8 items-center justify-center rounded-sm transition-opacity duration-200 hover:opacity-60",
                !collapsed && "lg:hidden"
              )}
            >
              <CreedMark />
            </Link>

            <div className={cn("hidden", !collapsed && "lg:flex lg:items-center lg:justify-between lg:gap-3 lg:pr-2")}>
              <Link
                href="/home"
                aria-label="Creed home"
                className="flex min-w-0 items-center rounded-sm px-2 py-1.5 transition-opacity duration-200 hover:opacity-60"
              >
                <CreedWordmark className="ml-0" />
              </Link>
              <ShortcutKey className="hidden lg:inline-flex">S</ShortcutKey>
            </div>

            <div className={cn("hidden justify-center pt-4", collapsed && "lg:flex")}>
              <ShortcutKey>S</ShortcutKey>
            </div>

            <nav className={cn("mt-5 space-y-1", !collapsed && "lg:mt-8")}>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event(PANEL_OPEN_EVENT))}
                onMouseEnter={() => searchIconRef.current?.startAnimation()}
                onMouseLeave={() => searchIconRef.current?.stopAnimation()}
                className={cn(
                  "flex h-8 w-8 mx-auto items-center justify-center rounded-sm text-[14px] font-medium text-[var(--creed-text-secondary)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]",
                  SIDEBAR_PRESS_CLASS,
                  !collapsed && "lg:h-auto lg:w-full lg:mx-0 lg:min-h-0 lg:justify-start lg:gap-3 lg:px-2 lg:py-2"
                )}
                aria-label="Search"
              >
                <span className="relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  <SearchIcon
                    ref={searchIconRef}
                    size={14}
                    className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none"
                  />
                  {/* Agent background status: a small dot on the icon, coloured
                      like the tile below. Hidden on
                      the expanded row, where the tile takes over. */}
                  {agentTile ? (
                    <span
                      className={cn("absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full", !collapsed && "lg:hidden")}
                      style={{ backgroundColor: agentTile.bg }}
                    />
                  ) : null}
                </span>
                <span className={cn("hidden min-w-0 flex-1 text-left", !collapsed && "lg:inline")}>Search</span>
                {agentTile ? (
                  // Sits exactly where the K badge would: same size and slot,
                  // but a solid status tile with a white glyph. Blue + agent
                  // icon while working, green tick on success, red cross on
                  // failure. Only the agent runs in the background.
                  <span
                    className={cn(
                      "hidden h-5 w-5 items-center justify-center rounded text-white",
                      !collapsed && "lg:inline-flex"
                    )}
                    style={{ backgroundColor: agentTile.bg }}
                    aria-label={agentTile.label}
                  >
                    {agentBusy ? (
                      <CpuIcon size={12} className="inline-flex h-3 w-3 items-center justify-center leading-none" />
                    ) : agentRun.status === "result" ? (
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                    ) : (
                      <X className="h-3 w-3" strokeWidth={2.5} />
                    )}
                  </span>
                ) : (
                  <ShortcutKey
                    className={cn(
                      "hidden",
                      !collapsed && "lg:inline-flex"
                    )}
                  >
                    K
                  </ShortcutKey>
                )}
              </button>
              {navItems.map((item) => {
                const active = pathname === item.href;

                return <ShellNavLink key={item.href} item={item} active={active} collapsed={collapsed} />;
              })}
            </nav>

            <Separator className={cn("my-4 bg-[var(--creed-border)]", !collapsed && "lg:my-6")} />

            <div
              className={cn(
                "hidden text-[13px] font-medium text-[var(--creed-text-tertiary)]",
                !collapsed && "lg:block"
              )}
            >
              Sections
            </div>
            <div
              className={cn(
                "mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto creed-scrollbar",
                !collapsed && "lg:mt-4 lg:pr-1"
              )}
            >
              {sections.filter((section) => !section.archived).map((section) => {
                const pendingCount = pendingProposalCountBySection.get(section.id) ?? 0;
                const isActive = activeSectionId === section.id && pathname === "/file";
                const pendingDelete = pendingDeleteSectionIds.has(section.id);
                const content = (
                  <>
                    <span
                      className={cn(
                        "h-2.5 w-2.5 shrink-0 rounded-[3px]",
                        !collapsed && "lg:h-1.5 lg:w-1.5 lg:rounded-[2px]"
                      )}
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
                        "hidden truncate",
                        !collapsed && "lg:inline",
                        pendingDelete && "line-through"
                      )}
                    >
                      {section.name}
                    </span>
                    {pendingCount > 0 ? (
                      <span
                        className={cn(
                          "ml-auto hidden h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-[var(--creed-accent)] px-1.5 text-[10px] font-medium leading-none text-white tabular-nums",
                          !collapsed && "lg:inline-flex"
                        )}
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
                      "flex h-8 w-8 mx-auto items-center justify-center rounded-sm text-left text-[14px] font-medium text-[var(--creed-text-secondary)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]",
                      SIDEBAR_PRESS_CLASS,
                      !collapsed &&
                        "lg:h-auto lg:w-full lg:mx-0 lg:min-h-0 lg:justify-start lg:gap-3 lg:px-2 lg:py-2",
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
                  onClick={() => handleProposalClick(row.id)}
                  className={cn(
                    "flex h-8 w-8 mx-auto items-center justify-center rounded-sm bg-[#ECFDF5] text-left text-[14px] font-medium text-[#047857] hover:bg-[#D1FAE5] hover:text-[#065F46] dark:bg-[#052e1a]/40 dark:text-[#4ade80] dark:hover:bg-[#052e1a]/60 dark:hover:text-[#4ade80]",
                    SIDEBAR_PRESS_CLASS,
                    !collapsed &&
                      "lg:h-auto lg:w-full lg:mx-0 lg:min-h-0 lg:justify-start lg:gap-3 lg:px-2 lg:py-2",
                    // Same active-equals-hover rule as the pending-delete
                    // rows above: once the user has scrolled into the
                    // proposal preview, lock the row into its hover tone.
                    isActive && "bg-[#D1FAE5] text-[#065F46] dark:bg-[#052e1a]/60"
                  )}
                  aria-label={`Proposed: ${row.name}`}
                >
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-[3px]",
                      !collapsed && "lg:h-1.5 lg:w-1.5 lg:rounded-[2px]"
                    )}
                    style={{ backgroundColor: "#10B981" }}
                  />
                  <span className={cn("hidden truncate", !collapsed && "lg:inline")}>{row.name}</span>
                </button>
                );
              })}

              <button
                type="button"
                onClick={handleAddSectionClick}
                className={cn(
                  "flex h-8 w-8 mx-auto items-center justify-center rounded-sm text-left text-[14px] text-[var(--creed-text-tertiary)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]",
                  SIDEBAR_PRESS_CLASS,
                  !collapsed && "lg:h-auto lg:w-full lg:mx-0 lg:min-h-0 lg:justify-start lg:gap-2 lg:px-2 lg:py-2"
                )}
                aria-label="Add section"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
                <span className={cn("hidden", !collapsed && "lg:inline")}> Add section</span>
              </button>
            </div>

            <div className="mt-auto">
              <Separator className={cn("my-4 bg-[var(--creed-border)]", !collapsed && "lg:my-6")} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className={cn(
                      "h-auto w-full min-w-0 justify-center rounded-sm border-0 bg-transparent px-1 py-1 transition-colors hover:bg-[var(--creed-surface-raised)] aria-expanded:bg-[var(--creed-surface-raised)] dark:hover:bg-[var(--creed-surface-raised)]",
                      !collapsed && "lg:justify-between lg:bg-transparent lg:pl-[7px] lg:pr-2.5 lg:py-1.5"
                    )}
                  >
                    <span
                      className={cn(
                        "flex min-w-0 w-full items-center justify-center gap-2.5",
                        !collapsed && "lg:justify-start"
                      )}
                    >
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
                      <span
                        className={cn(
                          "hidden min-w-0 flex-1 truncate text-left text-sm font-medium text-[var(--creed-text-primary)]",
                          !collapsed && "lg:inline"
                        )}
                      >
                        {userName}
                      </span>
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className={cn(
                    "border-[var(--creed-border)] bg-[var(--creed-surface)]",
                    // Collapsed rail: the trigger is a 40px square, so the
                    // trigger-width menu would be unusably narrow.
                    collapsed ? "w-48" : "w-(--radix-dropdown-menu-trigger-width)"
                  )}
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
                    icon={CreditCardIcon}
                    className="text-[13px]"
                    onSelect={() => {
                      setBillingOpen(true);
                    }}
                  >
                    Billing
                  </AnimatedMenuIconItem>
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

      <BillingDialog open={billingOpen} onOpenChange={setBillingOpen} />
      <CreedPanel
        onFileSection={handleSectionClick}
        onFileProposal={handleProposalClick}
        onAddSection={handleAddSectionClick}
        onOpenBilling={() => setBillingOpen(true)}
        onOpenPush={handleOpenPushClick}
        onSetActivity={handleActivityClick}
      />
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
        // On touch / dropdown clicks the cursor isn't a useful origin -
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
        <span className="md:hidden">Theme</span>
        <span className="hidden md:inline">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
      </span>
      <kbd className="inline-flex h-5 w-5 items-center justify-center rounded border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] text-[10px] font-medium text-[var(--creed-text-secondary)]">
        M
      </kbd>
    </DropdownMenuItem>
  );
}
