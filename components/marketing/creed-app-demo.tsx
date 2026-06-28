"use client";

// An interactive, miniature replica of the Creed `/file` editor for the
// landing page, framed in a realistic browser window and floating on the blue
// overview gradient. It runs on client-only mock state but is built from the
// ACTUAL app components (Button, ReviewPill, InlineProposalDiff, the quality
// rings + popovers, AgentIconStack, the animated icons) fed real Proposal /
// CreedSection / CreedQualityReport objects, so it matches the product down to
// the corner radii. Section bodies render through the editor's own `.ProseMirror`
// styles. No backend, no provider, no network. The inner HTML is a first-party
// constant, never user input.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Ellipsis,
  Lock,
  PanelLeft,
  Plus,
  RotateCw,
  Share,
  Shield,
  X,
} from "lucide-react";
import { AgentIconStack } from "@/components/creed/agent-icon-stack";
import { CreedMark, CreedWordmark } from "@/components/creed/brand";
import { ReviewPill } from "@/components/creed/review-pill";
import { InlineProposalDiff } from "@/components/creed/inline-proposal-diff";
import {
  OverallQualityPopover,
  QualityRefreshButton,
  QualityRing,
  SectionQualityPopover,
} from "@/components/creed/file-quality-ui";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { AnimatedMenuIconItem } from "@/components/creed/animated-icon-action";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArchiveIcon } from "@/components/ui/archive";
import { ClockIcon } from "@/components/ui/clock";
import { CloudUploadIcon } from "@/components/ui/cloud-upload";
import { ConnectIcon } from "@/components/ui/connect";
import { CopyIcon } from "@/components/ui/copy";
import { DeleteIcon } from "@/components/ui/delete";
import { DownloadIcon } from "@/components/ui/download";
import { FileTextIcon } from "@/components/ui/file-text";
import { FolderUpIcon } from "@/components/ui/folder-up";
import { HistoryIcon } from "@/components/ui/history";
import { LockIcon } from "@/components/ui/lock";
import { LockOpenIcon } from "@/components/ui/lock-open";
import { SettingsIcon } from "@/components/ui/settings";
import { SquarePenIcon } from "@/components/ui/square-pen";
import { AnimatePresence, motion } from "framer-motion";
import { accentColorMap, accentTintMap, type AccentKey, type CreedSection, type Proposal } from "@/lib/creed-data";
import type { CreedQualityReport } from "@/lib/ai/quality";
import { cn } from "@/lib/utils";

// ----- mock content (real CreedSection shape, editor HTML) ------------------

// Match the editor's exact bullet markup (li.creed-list-item > p) so the
// `.ProseMirror` styles render a single squircle marker per item.
const bulletList = (items: string[]) =>
  `<ul class="creed-list creed-list-bullet">${items
    .map((item) => `<li class="creed-list-item"><p>${item}</p></li>`)
    .join("")}</ul>`;

const PREFS_ITEMS = [
  "Lead with the answer, then the supporting detail.",
  "Keep replies tight unless depth genuinely helps.",
  "Skip filler, hedging, and over-praise.",
];
const PREFS_NEW = "Default to TypeScript examples; I work in strict mode.";
const PREFS_HTML = bulletList(PREFS_ITEMS);
const PREFS_HTML_APPLIED = bulletList([...PREFS_ITEMS, PREFS_NEW]);
const PREFS_PLAIN = PREFS_ITEMS.join("\n");
const PREFS_PLAIN_APPLIED = `${PREFS_PLAIN}\n${PREFS_NEW}`;

const ROUTINES_ITEMS = [
  "Deep work 7 to 11am, no meetings before noon.",
  "Review the week every Friday at 4pm.",
  "Ship to production Monday through Thursday only.",
];
const ROUTINES_NEW = "Batch code review into a single block after standup.";
const ROUTINES_HTML = bulletList(ROUTINES_ITEMS);
const ROUTINES_HTML_APPLIED = bulletList([...ROUTINES_ITEMS, ROUTINES_NEW]);
const ROUTINES_PLAIN = ROUTINES_ITEMS.join("\n");
const ROUTINES_PLAIN_APPLIED = `${ROUTINES_PLAIN}\n${ROUTINES_NEW}`;

function section(
  id: string,
  name: string,
  accent: AccentKey,
  template: CreedSection["template"],
  content: string,
  lastEditedLabel: string,
  lastEditedBy = "You",
  lastEditedType: CreedSection["lastEditedType"] = "user"
): CreedSection {
  return {
    id,
    kind: "rich-text",
    template,
    name,
    accent,
    content,
    agentWritable: true,
    agentPermission: "propose",
    lastEditedBy,
    lastEditedType,
    lastEditedLabel,
  };
}

const INITIAL_SECTIONS: CreedSection[] = [
  section(
    "identity",
    "Identity",
    "identity",
    "identity",
    "<p>Founder and designer building <strong>Helm</strong>, a CI dashboard for small teams. Previously at Stripe, now based in Lisbon.</p><p>I think in systems and ship small. I would rather cut scope than miss a date.</p>",
    "Edited by you, 2h ago"
  ),
  section(
    "goals",
    "Goals",
    "projects",
    "focus",
    bulletList([
      "Ship Helm v2 public beta by August.",
      "Reach 50 paying teams before raising a seed.",
      "Publish one essay a month on developer tooling.",
    ]),
    "Edited by you, yesterday"
  ),
  section(
    "work",
    "Work",
    "tools",
    "freeform",
    '<p>Design in Figma, build the app in Next.js, the backend in Go. Deploy on Fly.</p><p><span class="creed-inline-tag">TypeScript</span><span class="creed-inline-tag">Go</span><span class="creed-inline-tag">Figma</span><span class="creed-inline-tag">Linear</span><span class="creed-inline-tag">Fly.io</span></p>',
    "Updated by Claude, 2h ago",
    "Claude",
    "agent"
  ),
  section("preferences", "Preferences", "preferences", "principles", PREFS_HTML, "Edited by you, 3d ago"),
  section("routines", "Routines", "workflows", "principles", ROUTINES_HTML, "Edited by you, 5d ago"),
  section(
    "constraints",
    "Constraints",
    "boundaries",
    "freeform",
    bulletList([
      "Never put a call on my calendar on a Wednesday.",
      "Do not suggest tools that need a card just to try them.",
      "Ask before posting anything to the team Slack.",
    ]),
    "Updated by Codex, yesterday",
    "Codex",
    "agent"
  ),
];

function proposal(
  id: string,
  sectionId: string,
  sectionName: string,
  accent: AccentKey,
  agentName: string,
  reason: string,
  contentMarkdown: string
): Proposal {
  return {
    id,
    sectionId,
    sectionName,
    accent,
    agentName,
    timeLabel: "1h ago",
    changeType: "refines-existing",
    reason,
    impact: "future-responses",
    confidence: "repeated",
    draft: { kind: "rich-text", contentMarkdown },
    status: "pending",
  };
}

const INITIAL_PROPOSALS: Proposal[] = [
  proposal(
    "p-claude-prefs",
    "preferences",
    "Preferences",
    "preferences",
    "Claude",
    "You corrected three JavaScript snippets to TypeScript this week.",
    PREFS_PLAIN_APPLIED
  ),
  proposal(
    "p-codex-routines",
    "routines",
    "Routines",
    "workflows",
    "Codex",
    "You batched every review into one block in our last session.",
    ROUTINES_PLAIN_APPLIED
  ),
];

// Per-proposal: the diff base (plain text, so the diff highlights only the
// addition), the section HTML to apply on accept, the new score, and the
// added-word count for the activity badge.
const PROPOSAL_APPLY: Record<string, { base: string; html: string; score: number; added: number }> = {
  "p-claude-prefs": { base: PREFS_PLAIN, html: PREFS_HTML_APPLIED, score: 90, added: 9 },
  "p-codex-routines": { base: ROUTINES_PLAIN, html: ROUTINES_HTML_APPLIED, score: 84, added: 8 },
};

function note(title: string, detail: string) {
  return { title, detail };
}

function qualitySection(
  sectionId: string,
  sectionName: string,
  score: number,
  tags: string[],
  strength: { title: string; detail: string },
  gap: { title: string; detail: string } | null
): CreedQualityReport["sections"][number] {
  return {
    sectionId,
    sectionName,
    score,
    tags,
    strength,
    gap,
    reasons: [],
    strengths: [],
    gaps: [],
    missingContext: [],
    focus: "",
  };
}

const INITIAL_QUALITY: CreedQualityReport = {
  contentHash: "demo",
  generatedAt: "",
  overall: {
    score: 86,
    summary: "Strong core with room to sharpen.",
    tags: ["Specific", "Current", "Thin"],
    strength: note("Strong, specific core", "Identity and Work name real tools, places, and defaults."),
    gap: note("Sharpen the edges", "Routines and Goals would climb with a time or date on every line."),
    strengths: [],
    gaps: [],
    focus: [],
  },
  sections: [
    qualitySection("identity", "Identity", 93, ["Specific", "Concrete", "Tight"], note("Reads like a person", "Names the company, the role, and a real default."), null),
    qualitySection("goals", "Goals", 82, ["Current", "Drifty"], note("Live and concrete", "Tied to numbers an agent can pull on."), note("One goal floats", "The essay cadence has no review date to anchor it.")),
    qualitySection("work", "Work", 88, ["Concrete", "Examples"], note("Real stack", "Tools are named, not described."), note("How you review", "Add how you like pull requests handled.")),
    qualitySection("preferences", "Preferences", 86, ["Actionable", "Thin"], note("Directly steers replies", "Each line changes how an agent answers."), note("Add a code default", "Nothing yet on how examples should be written.")),
    qualitySection("routines", "Routines", 78, ["Concrete", "Surface"], note("Respects your rhythm", "Deep-work hours are explicit."), note("Two lack a trigger", "Some routines have no time or cue attached.")),
    qualitySection("constraints", "Constraints", 87, ["Durable", "Actionable"], note("Clear hard noes", "Each is a rule an agent can follow."), note("One more edge", "Could name a sensitive topic to avoid.")),
  ],
};

type ActivityStatus = "accepted" | "rejected" | "direct";
type DemoActivity = {
  id: string;
  sectionName: string;
  accent: AccentKey;
  actor: string;
  actorType: "user" | "agent";
  status: ActivityStatus;
  timeLabel: string;
  added: number;
  removed: number;
};

const INITIAL_ACTIVITY: DemoActivity[] = [
  { id: "a1", sectionName: "Identity", accent: "identity", actor: "You", actorType: "user", status: "direct", timeLabel: "2h ago", added: 5, removed: 2 },
  { id: "a2", sectionName: "Work", accent: "tools", actor: "Claude", actorType: "agent", status: "accepted", timeLabel: "2h ago", added: 6, removed: 0 },
  { id: "a3", sectionName: "Constraints", accent: "boundaries", actor: "Codex", actorType: "agent", status: "accepted", timeLabel: "Yesterday", added: 4, removed: 1 },
];

const NAV = [
  { label: "File", Icon: FileTextIcon, active: true },
  { label: "Connections", Icon: ConnectIcon, active: false },
  { label: "Settings", Icon: SettingsIcon, active: false },
] as const;

const STATUS_CLASS: Record<ActivityStatus, string> = {
  accepted: "bg-[#ECFDF5] text-[#047857] dark:bg-[#052e1a]/55 dark:text-[#4ade80]",
  rejected: "bg-[#FEF2F2] text-[#B91C1C] dark:bg-[#3F1212]/55 dark:text-[#fca5a5]",
  direct: "bg-[#FFF7ED] text-[#C2410C] dark:bg-[#431407]/55 dark:text-[#fdba74]",
};
const STATUS_LABEL: Record<ActivityStatus, string> = {
  accepted: "Accepted",
  rejected: "Rejected",
  direct: "Direct edit",
};

// ----- browser chrome ------------------------------------------------------

function ChromeIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--creed-text-tertiary)] transition-colors hover:bg-black/5 hover:text-[var(--creed-text-secondary)] dark:hover:bg-white/5 [&_svg]:h-4 [&_svg]:w-4">
      {children}
    </span>
  );
}

function BrowserChrome() {
  return (
    <div className="relative flex h-11 items-center border-b border-[var(--creed-border)] bg-[var(--creed-surface-raised)] px-3.5">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <div className="ml-3 hidden items-center gap-0.5 sm:flex">
          <ChromeIcon><PanelLeft /></ChromeIcon>
          <ChromeIcon><ChevronLeft /></ChromeIcon>
          <ChromeIcon><ChevronRight /></ChromeIcon>
        </div>
        <div className="ml-1 hidden md:flex">
          <ChromeIcon><Shield /></ChromeIcon>
        </div>
      </div>

      <div className="absolute left-1/2 top-1/2 flex h-7 w-[min(440px,52%)] -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-[8px] bg-[var(--creed-surface)] px-3 text-[13px] text-[var(--creed-text-secondary)]">
        <Lock className="h-3 w-3 shrink-0 opacity-60" />
        <span className="flex-1 text-center">creed.md</span>
        <RotateCw className="h-3 w-3 shrink-0 opacity-60" />
      </div>

      <div className="ml-auto hidden items-center gap-0.5 sm:flex">
        <ChromeIcon><Download /></ChromeIcon>
        <ChromeIcon><Share /></ChromeIcon>
        <ChromeIcon><Plus /></ChromeIcon>
        <ChromeIcon><Copy /></ChromeIcon>
      </div>
    </div>
  );
}

// ----- nav rail (mirrors components/creed/shell.tsx) -----------------------

function NavRail({
  sections,
  activeSectionId,
  pendingCountBySection,
  onSelect,
}: {
  sections: CreedSection[];
  activeSectionId: string;
  pendingCountBySection: Map<string, number>;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="flex w-[52px] shrink-0 flex-col overflow-hidden border-r border-[var(--creed-border)] bg-[var(--creed-surface)] px-1.5 py-3 lg:w-[212px] lg:px-5 lg:py-5">
      <div className="flex justify-center lg:justify-start">
        <div className="lg:hidden">
          <CreedMark />
        </div>
        <div className="hidden lg:block">
          <CreedWordmark className="ml-2" />
        </div>
      </div>

      <nav className="mt-5 space-y-1 lg:mt-8">
        {NAV.map(({ label, Icon, active }) => (
          <div
            key={label}
            className={cn(
              "mx-auto flex h-8 w-8 items-center justify-center rounded-[10px] text-[14px] font-medium text-[var(--creed-text-secondary)] lg:mx-0 lg:h-auto lg:w-auto lg:justify-start lg:gap-3 lg:px-2 lg:py-2",
              active && "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)]"
            )}
          >
            <Icon size={14} className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
            <span className="hidden lg:inline">{label}</span>
          </div>
        ))}
      </nav>

      <div className="my-4 h-px bg-[var(--creed-border)] lg:my-6" />
      <div className="hidden text-[13px] font-medium text-[var(--creed-text-tertiary)] lg:block">Sections</div>

      <div className="creed-scrollbar mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto lg:mt-4 lg:pr-1">
        {sections.map((s) => {
          const isActive = s.id === activeSectionId;
          const pending = pendingCountBySection.get(s.id) ?? 0;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              aria-label={s.name}
              className={cn(
                "mx-auto flex h-8 w-8 items-center justify-center rounded-[10px] text-left text-[14px] font-medium text-[var(--creed-text-secondary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] lg:mx-0 lg:h-auto lg:w-full lg:justify-start lg:gap-3 lg:px-2 lg:py-2",
                isActive && "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)] hover:bg-[var(--creed-surface-raised)]"
              )}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px] lg:h-1.5 lg:w-1.5 lg:rounded-[2px]"
                style={{ backgroundColor: accentColorMap[s.accent] }}
              />
              <span className="hidden truncate lg:inline">{s.name}</span>
              {pending > 0 ? (
                <span className="ml-auto hidden h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-[#2563EB] px-1.5 text-[10px] font-medium leading-none tabular-nums text-white lg:inline-flex">
                  {pending}
                </span>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          className="mx-auto flex h-8 w-8 items-center justify-center rounded-[10px] text-left text-[14px] text-[var(--creed-text-tertiary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] lg:mx-0 lg:h-auto lg:w-full lg:justify-start lg:gap-2 lg:px-2 lg:py-2"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
          <span className="hidden lg:inline">Add section</span>
        </button>
      </div>

      <div className="mt-auto">
        <div className="my-4 h-px bg-[var(--creed-border)] lg:my-6" />
        <div className="flex items-center justify-center gap-2.5 rounded-[10px] px-1 py-1 lg:justify-start lg:px-[7px]">
          <Avatar className="h-6 w-6 overflow-hidden rounded-[8px] bg-[#2563EB]">
            <AvatarFallback className="bg-[#2563EB] text-xs font-medium text-white">S</AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 flex-1 truncate text-sm font-medium text-[var(--creed-text-primary)] lg:inline">Steve</span>
        </div>
      </div>
    </aside>
  );
}

// ----- header lock button (mirrors file-screen HeaderLockButton) -----------

function LockButton({ locked, onToggle }: { locked: boolean; onToggle: () => void }) {
  const lockCtl = useAnimatedIconControls(80);
  const openCtl = useAnimatedIconControls(80);
  const ctl = locked ? lockCtl : openCtl;
  return (
    <Button
      variant="outline"
      size="sm"
      aria-pressed={locked}
      style={{ borderRadius: 13, height: 32, minHeight: 32 }}
      className="border-[var(--creed-border)] bg-[var(--creed-surface)] px-2.5 text-[12px] md:px-3.5 md:text-sm"
      onMouseEnter={ctl.start}
      onMouseLeave={ctl.settle}
      onClick={onToggle}
    >
      {locked ? (
        <LockIcon ref={lockCtl.iconRef} size={14} className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
      ) : (
        <LockOpenIcon ref={openCtl.iconRef} size={14} className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
      )}
      <span className="hidden md:inline">{locked ? "Locked" : "Unlocked"}</span>
    </Button>
  );
}

// ----- section card (mirrors file-screen SectionCard header + body) --------

function SectionCard({
  section,
  quality,
  pendingProposals,
  diffBaseBySection,
  globalLocked,
  onAccept,
  onReject,
}: {
  section: CreedSection;
  quality?: CreedQualityReport["sections"][number];
  pendingProposals: Proposal[];
  diffBaseBySection: Record<string, string>;
  globalLocked: boolean;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const accent = accentColorMap[section.accent];
  return (
    <section className="group relative">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="inline-block h-9 w-[3px] rounded-full" style={{ backgroundColor: accent }} />
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="text-[15px] font-medium leading-none md:text-[16px]" style={{ color: accent }}>
                {section.name}
              </span>
              <SectionQualityPopover quality={quality} color={accent} sectionName={section.name} />
              {globalLocked ? (
                <Lock className="h-3.5 w-3.5 text-[var(--creed-text-tertiary)]" />
              ) : null}
            </div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-[var(--creed-text-secondary)] transition-colors duration-150 hover:text-[var(--creed-text-primary)] data-[state=open]:text-[var(--creed-text-primary)]"
            >
              <Ellipsis className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-[var(--creed-border)] bg-[var(--creed-surface)]">
            <AnimatedMenuIconItem icon={SquarePenIcon} className="text-sm" onSelect={() => {}}>Rename</AnimatedMenuIconItem>
            <AnimatedMenuIconItem icon={CopyIcon} className="text-sm" onSelect={() => {}}>Duplicate</AnimatedMenuIconItem>
            <AnimatedMenuIconItem icon={ArchiveIcon} className="text-sm" onSelect={() => {}}>Archive</AnimatedMenuIconItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        className="ProseMirror"
        style={
          {
            "--section-accent-bar": accent,
            "--section-accent-tint": accentTintMap[section.accent],
          } as React.CSSProperties
        }
        dangerouslySetInnerHTML={{ __html: section.content }}
      />

      <AnimatePresence initial={false}>
        {pendingProposals.map((p) => (
          <motion.div
            key={p.id}
            layout
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 16 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <InlineProposalDiff
              proposal={p}
              existingContent={diffBaseBySection[p.sectionId] ?? ""}
              agentName={p.agentName}
              onAccept={() => onAccept(p.id)}
              onReject={() => onReject(p.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </section>
  );
}

// ----- activity drawer -----------------------------------------------------

function ActivityDrawer({ activity, onClose }: { activity: DemoActivity[]; onClose: () => void }) {
  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 288, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      style={{ maxWidth: "min(86%, 288px)" }}
      className="absolute inset-y-0 right-0 z-40 h-full overflow-hidden border-l border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[-18px_0_50px_rgba(28,28,26,0.12)] lg:static lg:z-auto lg:shadow-none"
    >
      <div className="flex h-full w-[288px] flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">Activity</div>
            <div className="mt-1 text-[12px] text-[var(--creed-text-tertiary)]">Audit trail for governed collaboration.</div>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Close activity" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="creed-scrollbar mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {activity.map((entry) => (
              <motion.div
                key={entry.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-3"
              >
                <div className="flex items-center gap-2.5">
                  {entry.actorType === "agent" ? (
                    <AgentIconStack agents={[entry.actor]} variant="inline" itemClassName="h-4 w-4 shrink-0" />
                  ) : (
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: accentColorMap[entry.accent] }} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--creed-text-primary)]">{entry.sectionName}</span>
                  <span className={cn("rounded-[6px] px-2 py-0.5 text-[10px] font-medium", STATUS_CLASS[entry.status])}>{STATUS_LABEL[entry.status]}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 pl-[26px] text-[12px] text-[var(--creed-text-secondary)]">
                  <span className="truncate">{entry.actor}</span>
                  <span className="text-[var(--creed-text-tertiary)]">&middot;</span>
                  <span className="font-mono text-[11px] font-medium tabular-nums" style={{ color: "var(--creed-success)" }}>+{entry.added}</span>
                  <span className="font-mono text-[11px] font-medium tabular-nums" style={{ color: "var(--creed-danger)" }}>&minus;{entry.removed}</span>
                  <span className="ml-auto text-[var(--creed-text-tertiary)]">{entry.timeLabel}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
}

// ----- main ----------------------------------------------------------------

export function CreedAppDemo() {
  const [sections, setSections] = useState<CreedSection[]>(INITIAL_SECTIONS);
  const [proposals, setProposals] = useState<Proposal[]>(INITIAL_PROPOSALS);
  const [quality, setQuality] = useState<CreedQualityReport>(INITIAL_QUALITY);
  const [activity, setActivity] = useState<DemoActivity[]>(INITIAL_ACTIVITY);
  const [activeSectionId, setActiveSectionId] = useState("identity");
  const [activityOpen, setActivityOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qualityLoading, setQualityLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const activityIcon = useAnimatedIconControls(120);
  const savingTimer = useRef<number | null>(null);
  const qualityTimer = useRef<number | null>(null);

  const diffBaseBySection = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of proposals) map[p.sectionId] = PROPOSAL_APPLY[p.id]?.base ?? "";
    return map;
  }, [proposals]);

  const pendingCountBySection = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of proposals) map.set(p.sectionId, (map.get(p.sectionId) ?? 0) + 1);
    return map;
  }, [proposals]);

  const flashSaving = useCallback(() => {
    if (savingTimer.current) window.clearTimeout(savingTimer.current);
    setSaving(true);
    savingTimer.current = window.setTimeout(() => setSaving(false), 850);
  }, []);

  const jumpToSection = useCallback((id: string) => {
    setActiveSectionId(id);
    const el = sectionRefs.current.get(id);
    const scroller = scrollRef.current;
    if (el && scroller) scroller.scrollTo({ top: Math.max(0, el.offsetTop - 16), behavior: "smooth" });
  }, []);

  const acceptProposal = useCallback(
    (id: string) => {
      const p = proposals.find((x) => x.id === id);
      const cfg = PROPOSAL_APPLY[id];
      if (!p || !cfg) return;
      setSections((prev) => prev.map((s) => (s.id === p.sectionId ? { ...s, content: cfg.html, lastEditedBy: p.agentName, lastEditedType: "agent", lastEditedLabel: `Updated by ${p.agentName}, just now` } : s)));
      setQuality((prev) => {
        const nextSections = prev.sections.map((s) => (s.sectionId === p.sectionId ? { ...s, score: cfg.score, gap: null } : s));
        const overallScore = Math.round(nextSections.reduce((sum, s) => sum + s.score, 0) / nextSections.length);
        return { ...prev, overall: { ...prev.overall, score: overallScore }, sections: nextSections };
      });
      setProposals((prev) => prev.filter((x) => x.id !== id));
      setActivity((prev) => [
        { id: `act-${id}`, sectionName: p.sectionName, accent: p.accent, actor: p.agentName, actorType: "agent", status: "accepted", timeLabel: "just now", added: cfg.added, removed: 0 },
        ...prev,
      ]);
      flashSaving();
    },
    [proposals, flashSaving]
  );

  const rejectProposal = useCallback(
    (id: string) => {
      const p = proposals.find((x) => x.id === id);
      const cfg = PROPOSAL_APPLY[id];
      if (!p) return;
      setProposals((prev) => prev.filter((x) => x.id !== id));
      setActivity((prev) => [
        { id: `act-${id}`, sectionName: p.sectionName, accent: p.accent, actor: p.agentName, actorType: "agent", status: "rejected", timeLabel: "just now", added: cfg?.added ?? 0, removed: 0 },
        ...prev,
      ]);
    },
    [proposals]
  );

  const reviewProposals = useMemo(
    () =>
      proposals.map((p) => ({
        proposal: p,
        existingContent: diffBaseBySection[p.sectionId] ?? "",
        sectionName: p.sectionName,
      })),
    [proposals, diffBaseBySection]
  );

  const runQuality = useCallback(() => {
    if (qualityTimer.current) window.clearTimeout(qualityTimer.current);
    setQualityLoading(true);
    qualityTimer.current = window.setTimeout(() => setQualityLoading(false), 1100);
  }, []);

  useEffect(
    () => () => {
      if (savingTimer.current) window.clearTimeout(savingTimer.current);
      if (qualityTimer.current) window.clearTimeout(qualityTimer.current);
    },
    []
  );

  return (
    <div className="relative w-full">
      <div className="relative">
        <div className="mx-auto overflow-hidden rounded-[14px] border border-black/5 bg-[var(--creed-surface)] shadow-[0_18px_50px_-30px_rgba(0,0,0,0.32)] dark:border-white/10">
          <BrowserChrome />

          <div className="relative flex h-[540px] sm:h-[580px] lg:h-[620px]">
            <NavRail
              sections={sections}
              activeSectionId={activeSectionId}
              pendingCountBySection={pendingCountBySection}
              onSelect={jumpToSection}
            />

            <div ref={scrollRef} className="creed-scrollbar relative min-w-0 flex-1 overflow-y-auto bg-[var(--creed-surface)]">
              {/* sticky header (mirrors file-screen) */}
              <div className="sticky top-0 z-20 mb-7 bg-[color:var(--creed-surface)]/95 pb-4 pt-3 backdrop-blur-sm">
                <div className="mx-auto flex max-w-[700px] flex-col gap-4 px-4 md:flex-row md:items-start md:justify-between md:px-7">
                  <div>
                    <div className="whitespace-nowrap text-[18px] font-medium tracking-[-0.02em] text-[var(--creed-text-primary)] md:text-[20px]">Steve / Creed</div>
                    <div className="mt-2 flex items-center gap-2 text-sm text-[var(--creed-text-secondary)]">
                      <ClockIcon size={14} className="h-3.5 w-3.5 shrink-0" />
                      {saving ? "Saving…" : "Saved just now"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start">
                    {/* Refresh is redundant on mobile where space is tight. */}
                    <span className="hidden sm:inline-flex">
                      <QualityRefreshButton title="Re-run analysis" loading={qualityLoading} onClick={runQuality} />
                    </span>
                    <OverallQualityPopover report={quality} loading={qualityLoading}>
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--creed-text-primary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] data-[state=open]:bg-[var(--creed-surface-raised)]"
                        aria-label="Show Creed quality"
                      >
                        <QualityRing score={quality.overall.score} color="#2563EB" loading={qualityLoading} />
                      </button>
                    </OverallQualityPopover>

                    <div className="flex items-center" title="Connect GitHub and choose a repo in Settings first.">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled
                        style={{ borderTopLeftRadius: 13, borderBottomLeftRadius: 13, borderTopRightRadius: 0, borderBottomRightRadius: 0, height: 32, minHeight: 32 }}
                        className="border-r-0 border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[12px] text-[var(--creed-text-tertiary)] md:px-3.5 md:text-sm"
                      >
                        <CloudUploadIcon size={14} className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
                        Push
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        disabled
                        aria-label="Version control options"
                        style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderTopRightRadius: 13, borderBottomRightRadius: 13, height: 32, width: 32, minHeight: 32, minWidth: 32 }}
                        className="border-[var(--creed-border)] bg-[var(--creed-surface)] text-[var(--creed-text-tertiary)]"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      style={{ borderRadius: 13, height: 32, minHeight: 32 }}
                      className={cn(
                        "border-[var(--creed-border)] bg-[var(--creed-surface)] px-2.5 text-[12px] md:px-3.5 md:text-sm",
                        activityOpen && "bg-[var(--creed-surface-raised)]"
                      )}
                      onMouseEnter={activityIcon.start}
                      onMouseLeave={activityIcon.settle}
                      onClick={() => setActivityOpen((v) => !v)}
                    >
                      <HistoryIcon ref={activityIcon.iconRef} size={14} className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none" />
                      <span className="hidden md:inline">Activity</span>
                    </Button>

                    <LockButton locked={locked} onToggle={() => setLocked((v) => !v)} />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          style={{ borderRadius: 13, height: 32, width: 32, minHeight: 32, minWidth: 32 }}
                          className="border-[var(--creed-border)] bg-[var(--creed-surface)] data-[state=open]:bg-[var(--creed-surface-raised)]"
                        >
                          <Ellipsis className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="border-[var(--creed-border)] bg-[var(--creed-surface)]">
                        <AnimatedMenuIconItem icon={FolderUpIcon} className="text-sm" onSelect={() => {}}>Import</AnimatedMenuIconItem>
                        <AnimatedMenuIconItem icon={CopyIcon} className="text-sm" onSelect={() => {}}>Copy</AnimatedMenuIconItem>
                        <AnimatedMenuIconItem icon={DownloadIcon} className="text-sm" onSelect={() => {}}>Download</AnimatedMenuIconItem>
                        <DropdownMenuSeparator />
                        <AnimatedMenuIconItem icon={ArchiveIcon} className="text-sm" onSelect={() => {}}>Archive</AnimatedMenuIconItem>
                        <AnimatedMenuIconItem
                          icon={DeleteIcon}
                          className="mt-1 bg-[#DC2626] text-sm text-white hover:bg-[#B91C1C] hover:text-white focus:bg-[#B91C1C] focus:text-white data-[highlighted]:bg-[#B91C1C] data-[highlighted]:text-white"
                          onSelect={() => {}}
                        >
                          Delete
                        </AnimatedMenuIconItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {reviewProposals.length > 0 ? (
                  <div className="mx-auto mt-5 flex max-w-[700px] justify-start px-4 md:px-7">
                    <ReviewPill
                      proposals={reviewProposals}
                      onAcceptAll={() => proposals.forEach((p) => acceptProposal(p.id))}
                      onRejectAll={() => proposals.forEach((p) => rejectProposal(p.id))}
                      onAcceptOne={acceptProposal}
                      onRejectOne={rejectProposal}
                      onJumpToProposal={(p) => jumpToSection(p.sectionId)}
                    />
                  </div>
                ) : null}
              </div>

              <div className="mx-auto max-w-[700px] space-y-9 px-4 pb-10 md:px-7">
                {sections.map((s) => (
                  <div
                    key={s.id}
                    ref={(node) => {
                      if (node) sectionRefs.current.set(s.id, node);
                      else sectionRefs.current.delete(s.id);
                    }}
                  >
                    <SectionCard
                      section={s}
                      quality={quality.sections.find((q) => q.sectionId === s.id)}
                      pendingProposals={proposals.filter((p) => p.sectionId === s.id)}
                      diffBaseBySection={diffBaseBySection}
                      globalLocked={locked}
                      onAccept={acceptProposal}
                      onReject={rejectProposal}
                    />
                  </div>
                ))}
              </div>
            </div>

            <AnimatePresence>
              {activityOpen ? (
                <>
                  <motion.button
                    type="button"
                    aria-label="Close activity"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setActivityOpen(false)}
                    className="absolute inset-0 z-30 bg-black/10 lg:hidden"
                  />
                  <ActivityDrawer activity={activity} onClose={() => setActivityOpen(false)} />
                </>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
