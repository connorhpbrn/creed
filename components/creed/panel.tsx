"use client";

// Panel: press K anywhere in the app shell. Three modes, one surface:
//   • Search (default)  - instant local fuzzy find; Enter opens. No match →
//     "Find" runs AI smart search and navigates.
//   • Ask (Tab)         - a mini chatbot over your creed + the app. Answers
//     stream in with a waterfall reveal; navigation is offered only when going
//     somewhere is actually the point.
//   • Agent (⌘ tap)     - the in-app Creed agent. Plans edits in the MCP
//     proposal contract, streams live progress, files proposals from "Creed",
//     and keeps running in the background even if you close the panel.
// # references a section (Ask + Agent). Backspace on an empty input returns to
// Search. Esc steps back to Search, then closes.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ForwardRefExoticComponent,
  type HTMLAttributes,
  type RefAttributes,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { motion, useAnimation } from "framer-motion";
import { Check, LoaderCircle } from "lucide-react";
import { Dialog, DialogPortal } from "@/components/ui/dialog";
import { ArchiveIcon } from "@/components/ui/archive";
import { BookTextIcon } from "@/components/ui/book-text";
import { ChartColumnIcon } from "@/components/ui/chart-column";
import { CompassIcon } from "@/components/ui/compass";
import { ConnectIcon } from "@/components/ui/connect";
import { ContrastIcon } from "@/components/ui/contrast";
import { CpuIcon } from "@/components/ui/cpu";
import { CreditCardIcon } from "@/components/ui/credit-card";
import { DatabaseIcon } from "@/components/ui/database";
import { DownloadIcon } from "@/components/ui/download";
import { FileTextIcon } from "@/components/ui/file-text";
import { GitBranchIcon } from "@/components/ui/git-branch";
import { HistoryIcon } from "@/components/ui/history";
import { LinkIcon } from "@/components/ui/link";
import { LogoutIcon } from "@/components/ui/logout";
import { PlusIcon } from "@/components/ui/plus";
import { SearchIcon } from "@/components/ui/search";
import { SettingsIcon } from "@/components/ui/settings";
import { SlidersHorizontalIcon } from "@/components/ui/sliders-horizontal";
import { TriangleAlertIcon } from "@/components/ui/triangle-alert";
import { UserIcon } from "@/components/ui/user";
import { CreedAgentGlyph } from "@/components/creed/brand";
import {
  MentionInput,
  type MentionInputHandle,
} from "@/components/creed/mention-input";
import { RichAnswer } from "@/components/creed/rich-answer";
import { useCreed } from "@/components/creed/creed-provider";
import { useTheme } from "@/components/creed/theme-provider";
import { accentColorMap } from "@/lib/creed-data";
import { fuzzyScore } from "@/lib/panel/fuzzy";
import type {
  PanelAction,
  PanelResult,
  PanelTurn,
  SettingsSectionKey,
} from "@/lib/panel/actions";
import { AGENT_STAGE_LABEL, type AgentStage } from "@/lib/panel/agent";
import {
  clearAgentRun,
  getAgentRunnerServerSnapshot,
  getAgentRunnerSnapshot,
  startAgentRun,
  stopAgentRun,
  subscribeAgentRunner,
} from "@/lib/panel/agent-runner";
import {
  dispatchSettingsPanelIntent,
  setSettingsPanelIntent,
  type SettingsPanelIntent,
} from "@/lib/panel/settings-intent";
import { cn } from "@/lib/utils";

export const PANEL_OPEN_EVENT = "creed:panel-open";

type PanelProps = {
  onFileSection: (sectionId: string) => void;
  onFileProposal: (proposalId: string) => void;
  onAddSection: () => void;
  onOpenBilling: () => void;
  onOpenPush: () => void;
  onSetActivity: (open: boolean) => void;
};

type Mode = "search" | "ask" | "agent";
type AskPhase = "idle" | "working" | "error";
type AskTurn = {
  role: "user" | "assistant";
  text: string;
  actions: PanelAction[];
};

type AnimatedIconHandle = {
  startAnimation: () => void;
  stopAnimation: () => void;
};
type AnimatedIconComponent = ForwardRefExoticComponent<
  HTMLAttributes<HTMLDivElement> & {
    size?: number;
  } & RefAttributes<AnimatedIconHandle>
>;

type Command = {
  id: string;
  label: string;
  group: "Pages" | "Sections" | "Proposals" | "Settings" | "Actions";
  keywords: string[];
  icon?: AnimatedIconComponent;
  dot?: string;
  run: () => void;
};

const GROUP_ORDER: Command["group"][] = [
  "Pages",
  "Sections",
  "Proposals",
  "Settings",
  "Actions",
];
const PLACEHOLDER: Record<Mode, string> = {
  search: "Search or jump to…",
  ask: "Ask about your creed…",
  agent: "Tell Creed what to change…",
};
const AGENT_STAGES: AgentStage[] = ["reading", "planning", "writing", "filing"];
const AGENT_RESULT_REFRESH_DELAYS_MS = [400, 1200] as const;

const SETTINGS_COMMANDS: Array<{
  key: SettingsSectionKey;
  label: string;
  keywords: string[];
  icon: AnimatedIconComponent;
}> = [
  {
    key: "profile",
    label: "Profile",
    keywords: ["name", "email", "account", "display name"],
    icon: UserIcon,
  },
  {
    key: "agent-edits",
    label: "Agent edit behaviour",
    keywords: [
      "permissions",
      "propose",
      "direct",
      "read-only",
      "hidden",
      "agents",
    ],
    icon: SlidersHorizontalIcon,
  },
  {
    key: "integrations",
    label: "Integrations",
    keywords: [
      "google",
      "github",
      "twitter",
      "x",
      "link account",
      "connect account",
    ],
    icon: LinkIcon,
  },
  {
    key: "model-usage",
    label: "Model usage",
    keywords: [
      "ai spend",
      "spend",
      "usage",
      "credits",
      "balance",
      "cost",
      "byok",
      "api key",
      "openrouter",
      "allowance",
    ],
    icon: ChartColumnIcon,
  },
  {
    key: "version-control",
    label: "Version control",
    keywords: [
      "github",
      "repo",
      "repository",
      "branch",
      "sync",
      "push",
      "pull",
      "commit",
    ],
    icon: GitBranchIcon,
  },
  {
    key: "archived",
    label: "Archived",
    keywords: ["restore", "archive", "archived sections"],
    icon: ArchiveIcon,
  },
  {
    key: "data",
    label: "Data",
    keywords: ["export", "download", "backup", "markdown", "word count"],
    icon: DatabaseIcon,
  },
  {
    key: "danger",
    label: "Danger zone",
    keywords: ["delete account", "remove account"],
    icon: TriangleAlertIcon,
  },
];

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] px-1 text-[10px] font-medium text-[var(--creed-text-secondary)]">
      {children}
    </kbd>
  );
}

function PanelRowIcon({
  Icon,
  active,
}: {
  Icon: AnimatedIconComponent;
  active: boolean;
}) {
  const ref = useRef<AnimatedIconHandle>(null);
  useEffect(() => {
    if (active) ref.current?.startAnimation();
    else ref.current?.stopAnimation();
  }, [active]);
  return (
    <Icon
      ref={ref}
      size={14}
      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none"
    />
  );
}

export function CreedPanel({
  onFileSection,
  onFileProposal,
  onAddSection,
  onOpenBilling,
  onOpenPush,
  onSetActivity,
}: PanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    state,
    signOut,
    exportMarkdown,
    exportActivityJson,
    exportAllDataJson,
    refreshState,
  } = useCreed();
  const { toggleTheme } = useTheme();

  const agentRun = useSyncExternalStore(
    subscribeAgentRunner,
    getAgentRunnerSnapshot,
    getAgentRunnerServerSnapshot,
  );

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Search smart-find async.
  const [searchPhase, setSearchPhase] = useState<AskPhase>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);

  // Ask chat.
  const [askTurns, setAskTurns] = useState<AskTurn[]>([]);
  const [askPhase, setAskPhase] = useState<AskPhase>("idle");
  const [askError, setAskError] = useState<string | null>(null);

  // Latest mode for the ⌘-tap handler (bound once in an effect).
  const modeRef = useRef<Mode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const shakeControls = useAnimation();
  const searchAbortRef = useRef<AbortController | null>(null);
  const askAbortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mentionInputRef = useRef<MentionInputHandle | null>(null);
  // All three mode icons share the AnimatedIconHandle shape, so the refs share
  // a type - which lets `inputIconRef` below assign to <InputIcon> without a
  // cast, whichever icon the current mode selects.
  const searchIconRef = useRef<AnimatedIconHandle | null>(null);
  const compassIconRef = useRef<AnimatedIconHandle | null>(null);
  const cpuIconRef = useRef<AnimatedIconHandle | null>(null);

  const close = useCallback(() => {
    // Search + Ask are cheap and tied to the panel; abort them on close. A live
    // or reviewable Agent run deliberately survives (agent-runner keeps
    // streaming, clearAgentRun no-ops while it works), but a finished *error*
    // isn't actionable, so drop it - otherwise reopening resurrects a stale
    // error in Agent mode instead of landing on Search.
    searchAbortRef.current?.abort();
    askAbortRef.current?.abort();
    if (agentRun.status === "error") clearAgentRun();
    setOpen(false);
  }, [agentRun.status]);

  const resetTransient = useCallback(() => {
    setQuery("");
    setMentionIds([]);
    setActiveIndex(0);
    setSearchPhase("idle");
    setSearchError(null);
    setAskTurns([]);
    setAskPhase("idle");
    setAskError(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        close();
        return;
      }
      setOpen(true);
      resetTransient();
      // Reopen straight into a live / finished Agent run if there is one.
      setMode(agentRun.status === "idle" ? "search" : "agent");
    },
    [agentRun.status, close, resetTransient],
  );

  const switchMode = useCallback((next: Mode) => {
    searchAbortRef.current?.abort();
    askAbortRef.current?.abort();
    setMode(next);
    setQuery("");
    setMentionIds([]);
    setActiveIndex(0);
    setSearchPhase("idle");
    setSearchError(null);
    setAskTurns([]);
    setAskPhase("idle");
    setAskError(null);
  }, []);

  // K opens (Search); Cmd/Ctrl+K is the alias.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.key !== "k" && event.key !== "K") || event.altKey) return;
      if (!(event.metaKey || event.ctrlKey)) {
        const target = event.target as HTMLElement | null;
        if (
          !target ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
          target.isContentEditable
        )
          return;
        if (event.isComposing || event.repeat || event.defaultPrevented) return;
        event.preventDefault();
        handleOpenChange(true);
        return;
      }
      event.preventDefault();
      handleOpenChange(true);
    };
    const onOpenEvent = () => handleOpenChange(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(PANEL_OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(PANEL_OPEN_EVENT, onOpenEvent);
    };
  }, [handleOpenChange]);

  // ⌘ tap (bare Meta/Ctrl down→up) jumps to Agent while open.
  useEffect(() => {
    if (!open) return;
    // A genuine ⌘/Ctrl "tap": the modifier goes down and up quickly with NO
    // other key pressed in between. Any other keydown (a chord like ⌘C, or an
    // aborted reach for a shortcut) disqualifies it, so it never fires while
    // the user is typing or using a real shortcut - which would otherwise wipe
    // the input on an accidental switch.
    let tapStart = 0;
    const TAP_MAX_MS = 400;
    const down = (event: KeyboardEvent) => {
      if (event.repeat) return;
      tapStart =
        event.key === "Meta" || event.key === "Control" ? Date.now() : 0;
    };
    const up = (event: KeyboardEvent) => {
      if (
        (event.key === "Meta" || event.key === "Control") &&
        tapStart > 0 &&
        Date.now() - tapStart < TAP_MAX_MS
      ) {
        tapStart = 0;
        switchMode(modeRef.current === "agent" ? "search" : "agent");
      }
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, [open, switchMode]);

  // Lock background scroll while open. We do this ourselves (rather than let a
  // modal dialog's react-remove-scroll do it) because that library also blocks
  // wheel events on the portaled mention popup. Plain body overflow:hidden
  // stops background scroll without touching the popup's own scrolling.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Mode icon: subtle one-shot animation on open + every switch.
  useEffect(() => {
    if (!open) return;
    const handle =
      mode === "agent"
        ? cpuIconRef.current
        : mode === "ask"
          ? compassIconRef.current
          : searchIconRef.current;
    const startId = window.setTimeout(() => handle?.startAnimation(), 150);
    const stopId = window.setTimeout(() => handle?.stopAnimation(), 1300);
    return () => {
      window.clearTimeout(startId);
      window.clearTimeout(stopId);
    };
  }, [open, mode]);

  const goSettings = useCallback(
    (intent: SettingsPanelIntent) => {
      setSettingsPanelIntent(intent);
      if (pathname === "/settings") dispatchSettingsPanelIntent();
      else router.push("/settings");
    },
    [pathname, router],
  );

  const liveSections = useMemo(
    () => state.sections.filter((section) => !section.archived),
    [state.sections],
  );
  const pendingProposals = useMemo(
    () => state.proposals.filter((proposal) => proposal.status === "pending"),
    [state.proposals],
  );
  const mentionSections = useMemo(
    () =>
      liveSections.map((section) => ({
        id: section.id,
        name: section.name,
        accent: section.accent,
      })),
    [liveSections],
  );

  const commands = useMemo<Command[]>(() => {
    return [
      {
        id: "page:file",
        label: "File",
        group: "Pages",
        keywords: ["editor", "creed", "sections", "proposals"],
        icon: FileTextIcon as AnimatedIconComponent,
        run: () => router.push("/file"),
      },
      {
        id: "page:connections",
        label: "Connections",
        group: "Pages",
        keywords: ["agents", "mcp", "clients", "connected"],
        icon: ConnectIcon as AnimatedIconComponent,
        run: () => router.push("/connections"),
      },
      {
        id: "page:settings",
        label: "Settings",
        group: "Pages",
        keywords: ["preferences", "options"],
        icon: SettingsIcon as AnimatedIconComponent,
        run: () => router.push("/settings"),
      },
      ...liveSections.map<Command>((section) => ({
        id: `section:${section.id}`,
        label: section.name,
        group: "Sections",
        keywords: [],
        dot: accentColorMap[section.accent],
        run: () => onFileSection(section.id),
      })),
      ...pendingProposals.map<Command>((proposal) => ({
        id: `proposal:${proposal.id}`,
        label: `${proposal.sectionName} · ${proposal.agentName}`,
        group: "Proposals",
        keywords: [proposal.reason],
        dot: "#10B981",
        run: () => onFileProposal(proposal.id),
      })),
      ...SETTINGS_COMMANDS.map<Command>((entry) => ({
        id: `settings:${entry.key}`,
        label: entry.label,
        group: "Settings",
        keywords: entry.keywords,
        icon: entry.icon,
        run: () => goSettings({ scrollTo: entry.key }),
      })),
      // Section creation is owner/admin-only in company mode; hide it for members.
      ...(state.creedType !== "company" ||
      state.company?.myRole === "owner" ||
      state.company?.myRole === "admin"
        ? ([
            {
              id: "action:add-section",
              label: "Add section",
              group: "Actions",
              keywords: ["new section", "create section", "compose"],
              icon: PlusIcon as AnimatedIconComponent,
              run: () => onAddSection(),
            },
          ] as Command[])
        : []),
      {
        id: "action:push",
        label: "Push to GitHub",
        group: "Actions",
        keywords: ["push", "github", "sync", "commit", "publish"],
        icon: GitBranchIcon,
        run: () => onOpenPush(),
      },
      {
        id: "action:activity",
        label: "Activity",
        group: "Actions",
        keywords: ["activity", "history", "log", "changes", "recent edits"],
        icon: HistoryIcon as AnimatedIconComponent,
        run: () => onSetActivity(true),
      },
      {
        id: "action:add-credits",
        label: "Add credits",
        group: "Actions",
        keywords: ["top up", "buy credits", "topup"],
        icon: CreditCardIcon as AnimatedIconComponent,
        run: () =>
          goSettings({ scrollTo: "model-usage", openDialog: "add-credits" }),
      },
      {
        id: "action:credits-history",
        label: "Credits history",
        group: "Actions",
        keywords: ["transactions", "ledger", "spend history"],
        icon: HistoryIcon as AnimatedIconComponent,
        run: () =>
          goSettings({
            scrollTo: "model-usage",
            openDialog: "credits-history",
          }),
      },
      {
        id: "action:billing",
        label: "Billing",
        group: "Actions",
        keywords: ["subscription", "plan", "invoice", "stripe"],
        icon: CreditCardIcon as AnimatedIconComponent,
        run: () => onOpenBilling(),
      },
      {
        id: "action:export-creed",
        label: "Export creed",
        group: "Actions",
        keywords: ["export", "download", "markdown", "backup"],
        icon: DownloadIcon as AnimatedIconComponent,
        run: () =>
          downloadFile(
            "creed.md",
            exportMarkdown(),
            "text/markdown;charset=utf-8",
          ),
      },
      {
        id: "action:toggle-theme",
        label: "Toggle theme",
        group: "Actions",
        keywords: ["dark mode", "light mode", "appearance"],
        icon: ContrastIcon as AnimatedIconComponent,
        run: () => toggleTheme(),
      },
      {
        id: "action:docs",
        label: "Docs",
        group: "Actions",
        keywords: ["documentation", "help", "guide"],
        icon: BookTextIcon as AnimatedIconComponent,
        run: () => router.push("/docs"),
      },
      {
        id: "action:log-out",
        label: "Log out",
        group: "Actions",
        keywords: ["sign out", "logout"],
        icon: LogoutIcon as AnimatedIconComponent,
        run: () => void signOut(),
      },
    ];
  }, [
    exportMarkdown,
    goSettings,
    liveSections,
    onAddSection,
    onFileProposal,
    onFileSection,
    onOpenBilling,
    onOpenPush,
    onSetActivity,
    pendingProposals,
    router,
    signOut,
    toggleTheme,
    state.creedType,
    state.company?.myRole,
  ]);

  const groups = useMemo(() => {
    const trimmed = query.trim();
    const scored = trimmed
      ? commands
          .map((command) => ({
            command,
            score: fuzzyScore(trimmed, command.label, command.keywords),
          }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((entry) => entry.command)
      : commands;
    return GROUP_ORDER.map((group) => ({
      label: group,
      items: scored.filter((command) => command.group === group),
    })).filter((group) => group.items.length > 0);
  }, [commands, query]);

  const flatResults = useMemo(
    () => groups.flatMap((group) => group.items),
    [groups],
  );

  useEffect(() => {
    if (mode === "search") setActiveIndex(0);
  }, [query, mode]);

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, flatResults.length]);

  // Keep the chat / progress scrolled to the newest content.
  useEffect(() => {
    if (mode !== "search")
      bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [askTurns, askPhase, agentRun, mode]);

  const runCommand = useCallback(
    (command: Command) => {
      close();
      command.run();
    },
    [close],
  );

  const executeActions = useCallback(
    (actions: PanelAction[]) => {
      const intent: SettingsPanelIntent = {};
      let navTarget: "/file" | "/connections" | "/settings" | null = null;
      for (const action of actions) {
        switch (action.kind) {
          case "navigate":
            navTarget = action.target;
            break;
          case "settings-section":
            intent.scrollTo = action.target;
            break;
          case "usage-range":
            intent.usageRange = action.value;
            intent.scrollTo = intent.scrollTo ?? "model-usage";
            break;
          case "usage-mode":
            intent.aiMode = action.value;
            intent.scrollTo = intent.scrollTo ?? "model-usage";
            break;
          case "open-dialog":
            if (action.target === "billing") onOpenBilling();
            else {
              intent.openDialog = action.target;
              intent.scrollTo = intent.scrollTo ?? "model-usage";
            }
            break;
          case "file-section":
            onFileSection(action.target);
            break;
          case "file-proposal":
            onFileProposal(action.target);
            break;
          case "compose-section":
            onAddSection();
            break;
          case "open-push":
            onOpenPush();
            break;
          case "activity-panel":
            onSetActivity(action.value === "open");
            break;
          case "export":
            if (action.target === "creed")
              downloadFile(
                "creed.md",
                exportMarkdown(),
                "text/markdown;charset=utf-8",
              );
            else if (action.target === "activity")
              downloadFile(
                "creed-activity.json",
                exportActivityJson(),
                "application/json;charset=utf-8",
              );
            else
              downloadFile(
                "creed-data.json",
                exportAllDataJson(),
                "application/json;charset=utf-8",
              );
            break;
          case "copy-creed":
            void navigator.clipboard?.writeText(exportMarkdown());
            break;
          case "toggle-theme":
            toggleTheme();
            break;
        }
      }
      if (
        intent.scrollTo ||
        intent.usageRange ||
        intent.aiMode ||
        intent.openDialog
      )
        goSettings(intent);
      else if (navTarget) router.push(navTarget);
    },
    [
      exportActivityJson,
      exportAllDataJson,
      exportMarkdown,
      goSettings,
      onAddSection,
      onFileProposal,
      onFileSection,
      onOpenBilling,
      onOpenPush,
      onSetActivity,
      router,
      toggleTheme,
    ],
  );

  const shake = useCallback(() => {
    void shakeControls.start({
      x: [0, -7, 7, -5, 5, -2, 0],
      transition: { duration: 0.35, ease: "easeOut" },
    });
  }, [shakeControls]);

  const runSmartFind = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearchPhase("working");
    setSearchError(null);
    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;
    try {
      const response = await fetch("/api/app/ai/panel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "search",
          query: trimmed,
          page: pathname,
        }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as Partial<PanelResult> & {
        error?: string;
      };
      if (!response.ok) {
        setSearchPhase("error");
        setSearchError(payload.error || "That didn't go through. Try again");
        shake();
        return;
      }
      if (!payload.ok || !payload.actions?.length) {
        setSearchPhase("error");
        setSearchError(payload.reason || "Couldn't find anything for that.");
        shake();
        return;
      }
      executeActions(payload.actions);
      close();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setSearchPhase("error");
      setSearchError("Couldn't reach the server. Try again");
      shake();
    }
  }, [close, executeActions, pathname, query, shake]);

  const sendAsk = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const priorHistory: PanelTurn[] = askTurns
        .slice(-4)
        .map((turn) => ({ role: turn.role, text: turn.text }));
      setAskTurns((turns) => [
        ...turns,
        { role: "user", text: trimmed, actions: [] },
      ]);
      mentionInputRef.current?.clear();
      setQuery("");
      setAskPhase("working");
      setAskError(null);
      const controller = new AbortController();
      askAbortRef.current?.abort();
      askAbortRef.current = controller;
      try {
        const response = await fetch("/api/app/ai/panel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "ask",
            query: trimmed,
            page: pathname,
            mentioned: mentionIds,
            history: priorHistory,
          }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as Partial<PanelResult> & {
          error?: string;
        };
        if (!response.ok) {
          setAskPhase("error");
          setAskError(payload.error || "That didn't go through. Try again");
          shake();
          return;
        }
        if (!payload.ok) {
          setAskPhase("error");
          setAskError(payload.reason || "I couldn't work that one out.");
          shake();
          return;
        }
        setAskTurns((turns) => [
          ...turns,
          {
            role: "assistant",
            text: payload.answer ?? "",
            actions: payload.actions ?? [],
          },
        ]);
        setAskPhase("idle");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAskPhase("error");
        setAskError("Couldn't reach the server. Try again");
        shake();
      }
    },
    [askTurns, mentionIds, pathname, shake],
  );

  // Everything the agent did was applied + persisted server-side (direct edits
  // and reversible meta) or filed as a proposal row. The client just pulls the
  // fresh state - no client mutation, so nothing races the server persist (the
  // old bug where an accepted edit vanished on refresh). Runs even if the panel
  // is closed when the run finishes.
  const applyAgentResult = useCallback(async () => {
    await refreshState();
    for (const delay of AGENT_RESULT_REFRESH_DELAYS_MS) {
      window.setTimeout(() => void refreshState(), delay);
    }
  }, [refreshState]);

  const sendAgent = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      startAgentRun({
        query: trimmed,
        mentioned: mentionIds,
        apply: applyAgentResult,
      });
      mentionInputRef.current?.clear();
      setQuery("");
    },
    [applyAgentResult, mentionIds],
  );

  const reviewAgentResults = useCallback(() => {
    const result = agentRun.result;
    if (!result) return;
    // Prefer a filed proposal (there's something to review); otherwise land on
    // a directly-applied section.
    const proposal = result.results.find((item) => item.kind === "proposal");
    const applied = result.results.find((item) => item.kind === "applied");
    const sectionId =
      proposal && proposal.kind === "proposal"
        ? proposal.sectionId
        : applied?.sectionId;
    close();
    clearAgentRun();
    // Defer to after the panel closes + the freshly filed proposal paints, then
    // scroll the same way the working "Jump to section" button does: query the
    // section node directly and scrollIntoView. The prop path (offsetTop-based)
    // wasn't landing here. Fall back to it only when the node isn't on the page
    // yet (i.e. we're not on /file), which navigates there via file intent.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = sectionId
          ? document.querySelector<HTMLElement>(
              `[data-section-id="${sectionId}"]`,
            )
          : null;
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (
          proposal &&
          proposal.kind === "proposal" &&
          proposal.sectionId === "new-section"
        ) {
          // A brand-new section has no live node to scroll to; open its card.
          onFileProposal(proposal.proposalId);
        } else if (sectionId) {
          // Off /file: navigate to /file and scroll to the section - the exact
          // path the sidebar section links use, which works cross-page.
          onFileSection(sectionId);
        }
      }),
    );
  }, [agentRun.result, close, onFileProposal, onFileSection]);

  const backToSearch = useCallback(() => {
    if (mode === "search") {
      close();
      return;
    }
    switchMode("search");
  }, [close, mode, switchMode]);

  // Composer keys for Ask + Agent (mention picker handles its own keys first).
  const onComposerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Tab toggles Ask: press it in Ask to go back to Search.
      if (event.key === "Tab") {
        event.preventDefault();
        switchMode(mode === "ask" ? "search" : "ask");
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        backToSearch();
        return;
      }
      if (event.key === "Backspace" && query === "") {
        event.preventDefault();
        switchMode("search");
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (query.trim()) {
          if (mode === "ask") void sendAsk(query);
          else sendAgent(query);
          return;
        }
        // Empty input: confirm a held affordance.
        if (mode === "ask") {
          const last = askTurns[askTurns.length - 1];
          if (last?.role === "assistant" && last.actions.length) {
            executeActions(last.actions);
            close();
          }
        } else if (mode === "agent" && agentRun.status === "result") {
          reviewAgentResults();
        }
      }
    },
    [
      agentRun.status,
      askTurns,
      backToSearch,
      close,
      executeActions,
      mode,
      query,
      reviewAgentResults,
      sendAgent,
      sendAsk,
      switchMode,
    ],
  );

  const onSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Tab") {
        event.preventDefault();
        switchMode("ask");
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) =>
          Math.min(index + 1, Math.max(flatResults.length - 1, 0)),
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const active = flatResults[activeIndex];
        if (active) runCommand(active);
        else if (query.trim()) void runSmartFind();
      }
    },
    [
      activeIndex,
      close,
      flatResults,
      query,
      runCommand,
      runSmartFind,
      switchMode,
    ],
  );

  const showSmartFind =
    mode === "search" &&
    query.trim().length > 0 &&
    flatResults.length === 0 &&
    searchPhase !== "working";
  const outOfCredits =
    searchError === "Out of credits" ||
    askError === "Out of credits" ||
    agentRun.error === "Out of credits";
  const InputIcon =
    mode === "agent" ? CpuIcon : mode === "ask" ? CompassIcon : SearchIcon;
  const inputIconRef =
    mode === "agent"
      ? cpuIconRef
      : mode === "ask"
        ? compassIconRef
        : searchIconRef;
  // Only Search shows an input-row spinner; Ask + Agent show progress in the
  // body (the chat "Thinking…" line / the Agent stage list).
  const showInputSpinner = mode === "search" && searchPhase === "working";
  const stageIndex = agentRun.stage ? AGENT_STAGES.indexOf(agentRun.stage) : -1;

  return (
    // Non-modal on purpose: a modal Radix dialog installs react-remove-scroll,
    // which blocks wheel/trackpad scrolling everywhere except the dialog content
    // - and the #-section popup is portaled to the body, so it couldn't scroll.
    // We lock background scroll ourselves (see the effect above) instead.
    <Dialog open={open} onOpenChange={handleOpenChange} modal={false}>
      <DialogPortal>
        {/* Manual overlay: a non-modal Radix dialog doesn't render its own, so
            we dim + blur the background ourselves to match the other popups. */}
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          data-state={open ? "open" : "closed"}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            // Don't let Radix restore focus to the trigger on close - its
            // auto-focus interrupts the smooth scroll we kick off when the user
            // reviews an agent result or jumps to a section, so it just looks
            // like the panel closed without moving.
            event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (mode !== "search") {
              event.preventDefault();
              switchMode("search");
            }
          }}
          onInteractOutside={(event) => {
            // The #-section popup is portaled to the body (outside Content), so
            // a click on a section row reads as "outside" and would dismiss the
            // whole panel. Keep it open when the interaction is inside the popup.
            const target = event.target as HTMLElement | null;
            if (target?.closest("[data-creed-mention-popup]"))
              event.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--creed-surface)] p-0 text-popover-foreground ring-1 ring-foreground/8 shadow-[0_18px_48px_rgba(28,28,26,0.08)] outline-none duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          <DialogPrimitive.Title className="sr-only">
            Panel
          </DialogPrimitive.Title>
          <motion.div animate={shakeControls}>
            {/* Input row */}
            <div className="flex items-center gap-2.5 border-b border-[var(--creed-border)] px-4">
              <InputIcon
                ref={inputIconRef}
                size={16}
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center leading-none text-[var(--creed-text-tertiary)]"
              />
              {mode === "search" ? (
                <input
                  ref={searchInputRef}
                  autoFocus
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    if (searchPhase === "error") {
                      setSearchPhase("idle");
                      setSearchError(null);
                    }
                  }}
                  onKeyDown={onSearchKeyDown}
                  placeholder={PLACEHOLDER.search}
                  spellCheck={false}
                  autoComplete="off"
                  className="h-[52px] w-full bg-transparent text-[15px] text-[var(--creed-text-primary)] outline-none placeholder:text-[var(--creed-text-tertiary)]"
                />
              ) : (
                <MentionInput
                  key={mode}
                  ref={mentionInputRef}
                  sections={mentionSections}
                  placeholder={PLACEHOLDER[mode]}
                  onChange={(text, ids) => {
                    setQuery(text);
                    setMentionIds(ids);
                    if (askPhase === "error") {
                      setAskPhase("idle");
                      setAskError(null);
                    }
                  }}
                  onKeyDown={onComposerKeyDown}
                />
              )}
              {showInputSpinner ? (
                <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-[var(--creed-text-tertiary)]" />
              ) : null}
            </div>

            {/* Body */}
            {mode === "search" ? (
              showSmartFind ? (
                <div className="p-1.5">
                  <button
                    type="button"
                    onClick={() => void runSmartFind()}
                    className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] bg-accent px-2.5 py-2 text-left text-[14px] font-medium text-accent-foreground"
                  >
                    <span className="truncate">
                      Find &ldquo;{query.trim()}&rdquo;
                    </span>
                    <span className="ml-auto">
                      <Kbd>↵</Kbd>
                    </span>
                  </button>
                </div>
              ) : searchPhase === "error" && searchError ? (
                <div className="p-1.5">
                  <div className="rounded-[var(--radius-md)] bg-[#FEF2F2] px-3 py-2.5 text-[13px] leading-[1.55] text-[#B91C1C] dark:bg-[#3F1212]/35 dark:text-[#F87171]">
                    {searchError}
                  </div>
                </div>
              ) : (
                <div
                  ref={listRef}
                  className="max-h-[324px] overflow-y-auto p-1.5 creed-scrollbar"
                >
                  {groups.map((group) => (
                    <div key={group.label}>
                      <div className="px-2.5 pb-1 pt-2 text-[12px] font-medium text-[var(--creed-text-tertiary)]">
                        {group.label}
                      </div>
                      {group.items.map((command) => {
                        const index = flatResults.indexOf(command);
                        const active = index === activeIndex;
                        return (
                          <button
                            key={command.id}
                            type="button"
                            data-active={active}
                            onMouseMove={() => setActiveIndex(index)}
                            onClick={() => runCommand(command)}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left text-[14px] font-medium text-[var(--creed-text-secondary)] transition-colors duration-150",
                              active && "bg-accent text-accent-foreground",
                            )}
                          >
                            {command.icon ? (
                              <PanelRowIcon
                                Icon={command.icon}
                                active={active}
                              />
                            ) : command.dot ? (
                              <span
                                className="h-1.5 w-1.5 shrink-0 rounded-[2px]"
                                style={{ backgroundColor: command.dot }}
                              />
                            ) : null}
                            <span className="truncate">{command.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div
                ref={bodyRef}
                className="max-h-[360px] overflow-y-auto p-2.5 creed-scrollbar"
              >
                {/* ---- ASK ---- */}
                {mode === "ask" ? (
                  <div className="space-y-3">
                    {askTurns.length === 0 && askPhase === "idle" ? (
                      <div className="px-0.5 py-1 text-[13px] leading-[1.55] text-[var(--creed-text-tertiary)]">
                        Ask about your creed, a feature, or where to find
                        something. Type # to mention a section.
                      </div>
                    ) : null}
                    {askTurns.map((turn, index) =>
                      turn.role === "user" ? (
                        <div key={index} className="flex justify-end">
                          <div className="max-w-[85%] rounded-[var(--radius-md)] bg-[var(--creed-surface-raised)] px-3 py-1.5 text-[14px] leading-[1.5] text-[var(--creed-text-primary)]">
                            {turn.text}
                          </div>
                        </div>
                      ) : (
                        <div key={index} className="flex gap-2">
                          <CreedAgentGlyph className="mt-[3px] h-3.5 w-3.5 shrink-0" />
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="text-[14px] leading-[1.6] text-[var(--creed-text-primary)]">
                              <RichAnswer
                                markdown={turn.text}
                                animate={index === askTurns.length - 1}
                              />
                            </div>
                            {turn.actions.length ? (
                              <button
                                type="button"
                                onClick={() => {
                                  executeActions(turn.actions);
                                  close();
                                }}
                                className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-2 py-1 text-[13px] font-medium text-accent-foreground"
                              >
                                Take me there <Kbd>↵</Kbd>
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ),
                    )}
                    {askPhase === "working" ? (
                      <div className="flex items-center gap-2 px-0.5 text-[13px] text-[var(--creed-text-secondary)]">
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[var(--creed-text-tertiary)]" />{" "}
                        Thinking…
                      </div>
                    ) : null}
                    {askPhase === "error" && askError ? (
                      <div className="rounded-[var(--radius-md)] bg-[#FEF2F2] px-3 py-2.5 text-[13px] leading-[1.55] text-[#B91C1C] dark:bg-[#3F1212]/35 dark:text-[#F87171]">
                        {askError}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* ---- AGENT ---- */}
                {mode === "agent" ? (
                  <div className="space-y-2.5">
                    {agentRun.status === "idle" ? (
                      <div className="px-0.5 py-1 text-[13px] leading-[1.55] text-[var(--creed-text-tertiary)]">
                        Tell Creed what to change. It follows your agent
                        permissions. Type # to mention a section.
                      </div>
                    ) : null}

                    {agentRun.status === "working" ||
                    agentRun.status === "applying" ? (
                      <div className="space-y-1.5 px-0.5">
                        {AGENT_STAGES.map((stage, index) => {
                          const done =
                            agentRun.status === "applying" ||
                            index < stageIndex;
                          const current =
                            agentRun.status !== "applying" &&
                            index === stageIndex;
                          return (
                            <div
                              key={stage}
                              className={cn(
                                "flex items-center gap-2 text-[13px]",
                                done
                                  ? "text-[var(--creed-text-secondary)]"
                                  : current
                                    ? "text-[var(--creed-text-primary)]"
                                    : "text-[var(--creed-text-tertiary)]",
                              )}
                            >
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                {done ? (
                                  <Check
                                    className="h-3.5 w-3.5 text-[var(--creed-success)]"
                                    strokeWidth={2.2}
                                  />
                                ) : current ? (
                                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--creed-border-strong)]" />
                                )}
                              </span>
                              <span>{AGENT_STAGE_LABEL[stage]}</span>
                              {current &&
                              stage === "writing" &&
                              agentRun.tokens > 0 ? (
                                <span className="text-[11px] text-[var(--creed-text-tertiary)] tabular-nums">
                                  {agentRun.tokens}
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => stopAgentRun()}
                          className="mt-1 flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-1 text-[12px] font-medium text-[var(--creed-text-tertiary)] transition-colors hover:text-[var(--creed-danger)]"
                        >
                          <Kbd>esc</Kbd> or click to stop
                        </button>
                      </div>
                    ) : null}

                    {agentRun.status === "result" && agentRun.result ? (
                      <>
                        <div className="flex items-center gap-2 px-0.5 py-1 text-[13px] text-[var(--creed-text-primary)]">
                          <CreedAgentGlyph className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {agentRun.result.summary || "Done."}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {agentRun.result.results.map((item, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 px-0.5 py-1 text-[13px] text-[var(--creed-text-secondary)]"
                            >
                              <Check
                                className="h-3.5 w-3.5 shrink-0 text-[var(--creed-success)]"
                                strokeWidth={2.2}
                              />
                              <span className="truncate">{item.label}</span>
                              <span className="ml-auto shrink-0 text-[11px] text-[var(--creed-text-tertiary)]">
                                {item.kind === "proposal"
                                  ? "proposed"
                                  : "applied"}
                              </span>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={reviewAgentResults}
                          className="mt-0.5 flex w-full items-center gap-2.5 rounded-[var(--radius-md)] bg-accent px-2.5 py-2 text-left text-[14px] font-medium text-accent-foreground"
                        >
                          <span className="truncate">
                            {agentRun.result.results.some(
                              (item) => item.kind === "proposal",
                            )
                              ? "Review"
                              : "View"}
                          </span>
                          <span className="ml-auto">
                            <Kbd>↵</Kbd>
                          </span>
                        </button>
                      </>
                    ) : null}

                    {agentRun.status === "error" && agentRun.error ? (
                      <>
                        <div className="rounded-[var(--radius-md)] bg-[#FEF2F2] px-3 py-2.5 text-[13px] leading-[1.55] text-[#B91C1C] dark:bg-[#3F1212]/35 dark:text-[#F87171]">
                          {agentRun.error}
                        </div>
                        {outOfCredits ? (
                          <button
                            type="button"
                            onClick={() => {
                              close();
                              clearAgentRun();
                              goSettings({
                                scrollTo: "model-usage",
                                openDialog: "add-credits",
                              });
                            }}
                            className="mt-1 flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left text-[14px] font-medium text-[var(--creed-text-secondary)] transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
                          >
                            Add credits
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => clearAgentRun()}
                            className="mt-1 px-0.5 text-[12px] font-medium text-[var(--creed-text-tertiary)] transition-colors hover:text-[var(--creed-text-primary)]"
                          >
                            Dismiss
                          </button>
                        )}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            {/* Footer */}
            <div className="flex h-10 items-center gap-4 border-t border-[var(--creed-border)] bg-muted/50 px-3.5 text-[12px] text-[var(--creed-text-tertiary)]">
              {mode === "search" ? (
                <>
                  <span className="flex items-center gap-1.5">
                    <Kbd>↵</Kbd> open
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Kbd>⇥</Kbd> ask
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Kbd>⌘</Kbd> agent
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <Kbd>esc</Kbd> close
                  </span>
                </>
              ) : mode === "ask" ? (
                <>
                  <span className="flex items-center gap-1.5">
                    <Kbd>↵</Kbd> send
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Kbd>⇥</Kbd> search
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Kbd>⌘</Kbd> agent
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <Kbd>esc</Kbd> back
                  </span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1.5">
                    <Kbd>↵</Kbd> run
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Kbd>⇥</Kbd> ask
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Kbd>⌘</Kbd> search
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <Kbd>esc</Kbd> back
                  </span>
                </>
              )}
            </div>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
