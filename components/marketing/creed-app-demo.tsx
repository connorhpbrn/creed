"use client";

// An interactive, miniature replica of the Creed `/file` editor for the
// landing page, framed in a realistic browser window and floating on the blue
// overview gradient. It runs on client-only mock state but is built from the
// ACTUAL app components (Button, ReviewPill, InlineProposalDiff, the quality
// rings + popovers, AgentIconStack, the animated icons) fed real Proposal /
// CreedSection / CreedQualityReport objects, so it matches the product down to
// the corner radii. Section bodies use the real read-only RichTextEditor. No
// backend, no provider, no network.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Ellipsis,
  Lock,
  PanelLeft,
  Plus,
  RotateCw,
  Shield,
  X,
} from "lucide-react";
import { AgentIconStack } from "@/components/creed/agent-icon-stack";
import {
  ACTIVITY_FILTERS,
  ACTIVITY_STATUS_LABELS,
  ActivityFilterPill,
  getActivityFilterTone,
  getActivityStatusStyles,
} from "@/components/creed/activity-ui";
import { CreedMark, CreedWordmark } from "@/components/creed/brand";
import { ReviewPill } from "@/components/creed/review-pill";
import { RichTextEditor } from "@/components/creed/rich-text-editor";
import { DiffBadge, InlineProposalDiff } from "@/components/creed/inline-proposal-diff";
import {
  OverallQualityPopover,
  QualityRing,
  SectionQualityPopover,
} from "@/components/creed/file-quality-ui";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { AnimatedMenuIconItem } from "@/components/creed/animated-icon-action";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
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
import { UploadIcon } from "@/components/ui/upload";
import { AnimatePresence, motion } from "framer-motion";
import {
  DEMO_PROFILES,
  type DemoActivity,
  type DemoActivityStatus,
} from "@/components/marketing/creed-app-demo-data";
import { accentColorMap, type CreedSection, type Proposal } from "@/lib/creed-data";
import type { CreedQualityReport } from "@/lib/ai/quality";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "File", Icon: FileTextIcon, active: true },
  { label: "Connections", Icon: ConnectIcon, active: false },
  { label: "Settings", Icon: SettingsIcon, active: false },
] as const;

const ignoreEditorChange = () => {};

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
        <ChromeIcon><DownloadIcon size={16} className="h-4 w-4" /></ChromeIcon>
        <ChromeIcon><UploadIcon size={16} className="h-4 w-4" /></ChromeIcon>
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
  profile,
  onNextProfile,
}: {
  sections: CreedSection[];
  activeSectionId: string;
  pendingCountBySection: Map<string, number>;
  onSelect: (id: string) => void;
  profile: (typeof DEMO_PROFILES)[number];
  onNextProfile: () => void;
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
              "mx-auto flex h-8 w-8 items-center justify-center rounded-sm text-[14px] font-medium text-[var(--creed-text-secondary)] lg:mx-0 lg:h-auto lg:w-auto lg:justify-start lg:gap-3 lg:px-2 lg:py-2",
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
                "mx-auto flex h-8 w-8 items-center justify-center rounded-sm text-left text-[14px] font-medium text-[var(--creed-text-secondary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] lg:mx-0 lg:h-auto lg:w-full lg:justify-start lg:gap-3 lg:px-2 lg:py-2",
                isActive && "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)] hover:bg-[var(--creed-surface-raised)]"
              )}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px] lg:h-1.5 lg:w-1.5 lg:rounded-[2px]"
                style={{ backgroundColor: accentColorMap[s.accent] }}
              />
              <span className="hidden truncate lg:inline">{s.name}</span>
              {pending > 0 ? (
                <span className="ml-auto hidden h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-[var(--creed-accent)] px-1.5 text-[10px] font-medium leading-none tabular-nums text-white lg:inline-flex">
                  {pending}
                </span>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          className="mx-auto flex h-8 w-8 items-center justify-center rounded-sm text-left text-[14px] text-[var(--creed-text-tertiary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)] lg:mx-0 lg:h-auto lg:w-full lg:justify-start lg:gap-2 lg:px-2 lg:py-2"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
          <span className="hidden lg:inline">Add section</span>
        </button>
      </div>

      <div className="mt-auto">
        <div className="my-4 h-px bg-[var(--creed-border)] lg:my-6" />
        <Button
          type="button"
          variant="ghost"
          onClick={onNextProfile}
          aria-label={`Switch profile. Current profile: ${profile.name}`}
          className="h-auto w-full min-w-0 justify-center rounded-sm border-0 bg-transparent px-1 py-1 transition-colors hover:bg-[var(--creed-surface-raised)] dark:hover:bg-[var(--creed-surface-raised)] lg:justify-between lg:pl-[7px] lg:pr-2.5 lg:py-1.5"
        >
          <span className="flex min-w-0 w-full items-center justify-center gap-2.5 lg:justify-start">
            <Avatar className="h-6 w-6 overflow-hidden rounded-[8px] border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] after:rounded-[8px]">
              <AvatarImage
                key={profile.image}
                src={profile.image}
                alt={profile.name}
                className="rounded-[8px] object-cover"
              />
            </Avatar>
            <span className="hidden min-w-0 flex-1 truncate text-left text-sm font-medium text-[var(--creed-text-primary)] lg:inline">
              {profile.name}
            </span>
          </span>
        </Button>
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
  sectionTagTargets,
  quality,
  pendingProposals,
  diffBaseBySection,
  globalLocked,
  qualityLoading,
  onRefreshQuality,
  onAccept,
  onReject,
}: {
  section: CreedSection;
  sectionTagTargets: Array<{ id: string; name: string; accent: string }>;
  quality?: CreedQualityReport["sections"][number];
  pendingProposals: Proposal[];
  diffBaseBySection: Record<string, string>;
  globalLocked: boolean;
  qualityLoading?: boolean;
  onRefreshQuality: () => void;
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
              <SectionQualityPopover
                quality={quality}
                color={accent}
                loading={qualityLoading}
                sectionName={section.name}
                actionAvailable
                onAction={onRefreshQuality}
              />
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

      <div className="pointer-events-none select-none">
        <RichTextEditor
          sectionId={section.id}
          content={section.content}
          readOnly
          accentColor={accent}
          sectionTagTargets={sectionTagTargets}
          onChange={ignoreEditorChange}
        />
      </div>

      <AnimatePresence initial={false}>
        {pendingProposals.map((p) => (
          <motion.div
            key={p.id}
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

function DemoActivityRow({ entry }: { entry: DemoActivity }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-3 transition-colors duration-150 hover:bg-[var(--creed-background)]"
    >
      <button type="button" className="group w-full text-left" onClick={() => setOpen((value) => !value)}>
        <div className="flex items-start gap-3">
          <AgentIconStack
            agents={[entry.actor]}
            variant="inline"
            className="ml-0.5 mt-[2px] shrink-0"
            itemClassName="h-4 w-4"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[13px] font-medium text-[var(--creed-text-primary)]">{entry.sectionName}</div>
              <span className={cn("rounded-[6px] px-2 py-0.5 text-[10px] font-medium", getActivityStatusStyles(entry.status))}>
                {ACTIVITY_STATUS_LABELS[entry.status]}
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-[var(--creed-text-tertiary)] transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-[var(--creed-text-secondary)]",
                  open ? "rotate-0" : "-rotate-90"
                )}
              />
            </div>
            <div className="mt-1 flex items-center gap-2 text-[12px] text-[var(--creed-text-secondary)]">
              <span className="truncate">{entry.actor}</span>
              <span className="inline-flex items-center gap-1">
                <span className="text-[var(--creed-text-tertiary)]">·</span>
                <DiffBadge tone="added" count={entry.added} />
                <DiffBadge tone="removed" count={entry.removed} />
              </span>
            </div>
          </div>
          <div className="shrink-0 text-[12px] text-[var(--creed-text-tertiary)]">
            {entry.timeLabel.replace(/ ago$/, "").replace("Yesterday", "1d")}
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0, marginTop: 0 }}
            animate={{ height: "auto", opacity: 1, marginTop: 12 }}
            exit={{ height: 0, opacity: 0, marginTop: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="-mx-3 border-t border-[var(--creed-border)]" />
            <div className="creed-diff-block -mx-3 px-4 py-2.5 leading-[1.6]">
              {entry.removed > 0 ? <span className="creed-diff-remove">Earlier wording and stale detail. </span> : null}
              <span className="creed-diff-add">Refined with specific, current context for {entry.sectionName}.</span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function ActivityDrawer({ activity, onClose }: { activity: DemoActivity[]; onClose: () => void }) {
  const [filter, setFilter] = useState<"all" | DemoActivityStatus>("all");
  const visibleActivity = filter === "all" ? activity : activity.filter((entry) => entry.status === filter);

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 356, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      style={{ maxWidth: "min(82vw, 356px)" }}
      className="absolute inset-y-0 right-0 z-[70] h-full overflow-hidden border-l border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-[-18px_0_50px_rgba(28,28,26,0.12)] lg:static lg:z-auto lg:shadow-none"
    >
      <div className="flex h-full w-full flex-col p-5 lg:w-[356px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">Activity</div>
            <div className="mt-1 text-[12px] text-[var(--creed-text-tertiary)]">Agent changes to this Creed.</div>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Close activity" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {ACTIVITY_FILTERS.map((item) => (
            <ActivityFilterPill
              key={item.value}
              active={filter === item.value}
              tone={getActivityFilterTone(item.value)}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </ActivityFilterPill>
          ))}
        </div>

        <div className="creed-scrollbar mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="mb-3 text-[12px] font-medium text-[var(--creed-text-tertiary)]">Recent</div>
          <AnimatePresence initial={false}>
            <div className="space-y-3">
              {visibleActivity.map((entry) => <DemoActivityRow key={entry.id} entry={entry} />)}
            </div>
          </AnimatePresence>
          {visibleActivity.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-[var(--creed-text-tertiary)]">No matching activity</div>
          ) : null}
        </div>
      </div>
    </motion.aside>
  );
}

// ----- main ----------------------------------------------------------------

export function CreedAppDemo() {
  const initialProfile = DEMO_PROFILES[0];
  const [sections, setSections] = useState<CreedSection[]>(initialProfile.sections);
  const [proposals, setProposals] = useState<Proposal[]>(initialProfile.proposals);
  const [quality, setQuality] = useState<CreedQualityReport>(initialProfile.quality);
  const [activity, setActivity] = useState<DemoActivity[]>(initialProfile.activity);
  const [activeSectionId, setActiveSectionId] = useState(
    initialProfile.sections[0]?.id ?? ""
  );
  const [activityOpen, setActivityOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [profileIndex, setProfileIndex] = useState(0);

  const profile = DEMO_PROFILES[profileIndex] ?? DEMO_PROFILES[0];

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickyHeaderRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const activityIcon = useAnimatedIconControls(120);
  const savingTimer = useRef<number | null>(null);
  const qualityTimer = useRef<number | null>(null);

  const diffBaseBySection = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of proposals) map[p.sectionId] = profile.proposalApply[p.id]?.base ?? "";
    return map;
  }, [profile.proposalApply, proposals]);

  const pendingCountBySection = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of proposals) map.set(p.sectionId, (map.get(p.sectionId) ?? 0) + 1);
    return map;
  }, [proposals]);

  const sectionTagTargets = useMemo(
    () =>
      sections.map((section) => ({
        id: section.id,
        name: section.name,
        accent: accentColorMap[section.accent],
      })),
    [sections]
  );

  const qualityBySection = useMemo(
    () => new Map(quality.sections.map((item) => [item.sectionId, item])),
    [quality.sections]
  );

  const proposalsBySection = useMemo(() => {
    const grouped = new Map<string, Proposal[]>();
    for (const proposal of proposals) {
      const current = grouped.get(proposal.sectionId);
      if (current) current.push(proposal);
      else grouped.set(proposal.sectionId, [proposal]);
    }
    return grouped;
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
    if (!el || !scroller) return;

    const scrollerTop = scroller.getBoundingClientRect().top;
    const sectionTop = el.getBoundingClientRect().top;
    const stickyHeaderHeight = stickyHeaderRef.current?.getBoundingClientRect().height ?? 96;
    const destination = scroller.scrollTop + sectionTop - scrollerTop - stickyHeaderHeight - 16;

    scroller.scrollTo({ top: Math.max(0, destination), behavior: "smooth" });
  }, []);

  const showNextProfile = useCallback(() => {
    const nextIndex = (profileIndex + 1) % DEMO_PROFILES.length;
    const nextProfile = DEMO_PROFILES[nextIndex] ?? DEMO_PROFILES[0];
    setProfileIndex(nextIndex);
    setSections(nextProfile.sections);
    setProposals(nextProfile.proposals);
    setQuality(nextProfile.quality);
    setActivity(nextProfile.activity);
    setActiveSectionId(nextProfile.sections[0]?.id ?? "");
    setActivityOpen(false);
    setLocked(false);
    setSaving(false);
    setQualityLoading(false);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [profileIndex]);

  const acceptProposal = useCallback(
    (id: string) => {
      const p = proposals.find((x) => x.id === id);
      const cfg = profile.proposalApply[id];
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
    [proposals, profile.proposalApply, flashSaving]
  );

  const rejectProposal = useCallback(
    (id: string) => {
      const p = proposals.find((x) => x.id === id);
      const cfg = profile.proposalApply[id];
      if (!p) return;
      setProposals((prev) => prev.filter((x) => x.id !== id));
      setActivity((prev) => [
        { id: `act-${id}`, sectionName: p.sectionName, accent: p.accent, actor: p.agentName, actorType: "agent", status: "rejected", timeLabel: "just now", added: cfg?.added ?? 0, removed: 0 },
        ...prev,
      ]);
    },
    [proposals, profile.proposalApply]
  );

  const reviewProposals = useMemo(
    () =>
      proposals.map((p) => ({
        proposal: p,
        existingContent: diffBaseBySection[p.sectionId] ?? "",
        sectionName: p.sectionName,
        canReview: true,
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
    <div className="relative w-full min-w-0 max-w-full touch-pan-y overflow-x-hidden overscroll-x-none">
      <div className="relative min-w-0 max-w-full overflow-x-hidden overscroll-x-none">
        <div className="mx-auto min-w-0 max-w-full touch-pan-y overflow-hidden overscroll-x-none rounded-lg border border-black/5 bg-[var(--creed-surface)] shadow-[0_18px_50px_-30px_rgba(0,0,0,0.32)] dark:border-white/10">
          <BrowserChrome />

          <div className="relative flex h-[540px] sm:h-[580px] lg:h-[620px]">
            <NavRail
              sections={sections}
              activeSectionId={activeSectionId}
              pendingCountBySection={pendingCountBySection}
              onSelect={jumpToSection}
              profile={profile}
              onNextProfile={showNextProfile}
            />

            <div
              ref={scrollRef}
              className="creed-scrollbar relative min-w-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-x-none bg-[var(--creed-surface)] [overflow-anchor:none]"
            >
              {/* sticky header (mirrors file-screen) */}
              <div
                ref={stickyHeaderRef}
                data-file-sticky-header
                className="sticky top-0 z-[60] mb-7 bg-[color:var(--creed-surface)]/95 pb-4 pt-3 backdrop-blur-sm [overflow-anchor:none]"
              >
                <div className="mx-auto flex max-w-[700px] flex-col gap-4 px-4 md:flex-row md:items-start md:justify-between md:px-7">
                  <div>
                    <div className="whitespace-nowrap text-[18px] font-medium tracking-[-0.02em] text-[var(--creed-text-primary)] md:text-[20px]">{profile.name} / Creed</div>
                    <div className="mt-2 flex items-center gap-2 text-sm text-[var(--creed-text-secondary)]">
                      <ClockIcon size={14} className="h-3.5 w-3.5 shrink-0" />
                      {saving ? "Saving…" : "Saved just now"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start">
                    <OverallQualityPopover
                      report={quality}
                      loading={qualityLoading}
                      actionAvailable
                      onAction={runQuality}
                    >
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--creed-text-primary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] data-[state=open]:bg-[var(--creed-surface-raised)]"
                        aria-label="Run Creed quality analysis"
                      >
                        <QualityRing
                          score={quality.overall.score}
                          color="#2563EB"
                          loading={qualityLoading}
                          actionable
                        />
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
                      aria-label="Activity"
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
                          className={cn(
                            "border-[var(--creed-border)] bg-[var(--creed-surface)] data-[state=open]:bg-[var(--creed-surface-raised)]",
                            activityOpen && "lg:mr-2"
                          )}
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
                  <div className="mx-auto mt-5 flex max-w-[700px] justify-start px-2 sm:px-4 md:px-7">
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
                      sectionTagTargets={sectionTagTargets}
                      quality={qualityBySection.get(s.id)}
                      pendingProposals={proposalsBySection.get(s.id) ?? []}
                      diffBaseBySection={diffBaseBySection}
                      globalLocked={locked}
                      qualityLoading={qualityLoading}
                      onRefreshQuality={runQuality}
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
