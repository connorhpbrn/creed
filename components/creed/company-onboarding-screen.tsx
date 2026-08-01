"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, ChevronDown, LoaderCircle, Mail, User, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SendIcon } from "@/components/ui/send";
import { ArrowRightIcon } from "@/components/ui/arrow-right";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { CreedWordmark, IntegrationGlyph } from "@/components/creed/brand";
import { ComposePromptCard } from "@/components/creed/compose-prompt-card";
import { AgentIconStack } from "@/components/creed/agent-icon-stack";
import { DiffBadge, computeDiffParts, summarizeDiff } from "@/components/creed/inline-proposal-diff";
import { RichTextEditor } from "@/components/creed/rich-text-editor";
import { accentColorMap, type AccentKey, type AgentIconKind } from "@/lib/creed-data";
import { splitPreservingLigatures } from "@/lib/landing-text";
import { buildCompanyOnboardingSections, type CompanyOnboardingState } from "@/lib/onboarding/compile-company";
import { buildCompanyComposePrompt } from "@/lib/creed-prompts";
import { cn } from "@/lib/utils";

// Company onboarding: a stepped flow cloned from the personal onboarding and
// themed for the Company tier (amber accent, red constellation dots, an amber
// Creed hub, and a constellation mixing the team's agents with employees). Like
// the personal flow it alternates a question with an explainer slide that
// teaches one company value, using cards that mirror the real app chrome
// (sections, attribution, proposals, permissions). It carries the same "build
// my Creed with your assistant" compose flow (copy prompt, paste back,
// preview), framed for a shared company file, plus an invite step at the end.

const AMBER = "#F59E0B";
const RED = accentColorMap.boundaries;

// Step indices. Each question is followed by an explainer, mirroring the
// personal flow's question / explainer rhythm, then the compose + invite steps.
const WELCOME = 0;
const Q_NAME = 1;
const EXP_SECTIONS = 2;
const Q_DOES = 3;
const EXP_ATTRIBUTION = 4;
const Q_TEAM = 5;
const EXP_PROPOSAL = 6;
const Q_PROJECTS = 7;
const EXP_PERMISSIONS = 8;
const Q_GUARD = 9;
const EXP_CONTROL = 10;
const PROMPT = 11;
const PASTE = 12;
const PREVIEW = 13;
const INVITE = 14;
const TOTAL_STEPS = 15;

type PreviewSection = { id: string; name: string; accent: AccentKey; content: string };
type InviteRow = { id: string; email: string };

const INVITE_BUTTON =
  "rounded-xl bg-[var(--creed-accent)] px-6 text-white hover:bg-[var(--creed-accent-hover)] hover:text-white";

export function CompanyOnboardingScreen({
  creedId,
  previewMode = false,
}: {
  creedId: string;
  previewMode?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [answers, setAnswers] = useState<CompanyOnboardingState>({
    companyName: "",
    whatItDoes: "",
    whoFor: "",
    people: "",
    projects: "",
    agentsGetWrong: "",
    neverChange: "",
  });
  const [inviteEmail, setInviteEmail] = useState("");
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const inviteId = useRef(1);
  const inviteIcon = useAnimatedIconControls();
  const [preview, setPreview] = useState<PreviewSection[] | null>(null);

  function set(key: keyof CompanyOnboardingState, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  // Exit onboarding without finishing: switch back to the personal Creed and go
  // to the file. Just navigating to /file would bounce back here (the app gate
  // redirects an un-set-up company owner to onboarding), so we flip the active
  // Creed to personal first. The company stays in "Set up" in the switcher.
  async function exitToPersonal() {
    setBusy(true);
    try {
      const res = await fetch("/api/app/creeds");
      const data = (await res.json().catch(() => ({}))) as { creeds?: Array<{ id: string; type: string }> };
      const personal = (data.creeds ?? []).find((c) => c.type === "personal");
      if (personal) {
        await fetch("/api/app/creeds/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creedId: personal.id }),
        });
        router.push("/file");
        router.refresh();
        return;
      }
      router.push("/home");
    } catch {
      router.push("/home");
    }
  }

  const seedSections = useMemo(
    () =>
      buildCompanyOnboardingSections(answers).map((s) => ({
        id: s.id,
        name: s.name,
        accent: s.accent,
        content: s.content,
      })),
    [answers]
  );

  async function ensureSeeded(): Promise<boolean> {
    if (seeded) return true;
    if (previewMode) {
      setSeeded(true);
      return true;
    }
    const res = await fetch("/api/app/company/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creedId, action: "seed", answers }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? "Could not save your answers.");
      return false;
    }
    setSeeded(true);
    return true;
  }

  async function handleCopyPrompt() {
    await navigator.clipboard.writeText(
      buildCompanyComposePrompt(buildCompanyOnboardingSections(answers), answers.companyName)
    );
    setPromptCopied(true);
    window.setTimeout(() => setPromptCopied(false), 1600);
  }

  async function handleContinue() {
    if (step === Q_GUARD) {
      setStep(EXP_CONTROL);
      return;
    }

    // Final explainer before the build step: persist the deterministic seed so
    // the compose endpoint has sections to map onto and the prompt can use the
    // latest answers.
    if (step === EXP_CONTROL) {
      setBusy(true);
      const ok = await ensureSeeded();
      setBusy(false);
      if (!ok) return;
      setStep(PROMPT);
      return;
    }

    // Paste step: compose the company Creed from the pasted markdown. Required
    // (no skip) so every company starts from a real, composed Creed - Continue
    // is disabled until something is pasted.
    if (step === PASTE) {
      const markdown = pasted.trim();
      if (!markdown) {
        setPasteError("Paste the markdown your assistant gave you.");
        return;
      }
      setBusy(true);
      setPasteError(null);
      if (previewMode) {
        setPreview(seedSections);
        setStep(PREVIEW);
        setBusy(false);
        return;
      }
      try {
        const res = await fetch("/api/app/company/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creedId, action: "compose", markdown }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          matched?: number;
          sections?: PreviewSection[];
          error?: string;
        };
        if (!res.ok) {
          setPasteError(typeof data.error === "string" ? data.error : "Could not save that. Try again.");
          return;
        }
        if (!data.ok || !data.matched || !data.sections) {
          setPasteError(
            "That doesn't look like your Creed. Paste the whole markdown your assistant gave you."
          );
          return;
        }
        setPreview(data.sections);
        setStep(PREVIEW);
      } catch {
        setPasteError("Could not save that. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step < INVITE) {
      setStep((s) => s + 1);
      return;
    }
    void finish(true);
  }

  async function finish(withInvites: boolean) {
    setBusy(true);
    try {
      void withInvites;
      const res = await fetch("/api/app/company/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creedId, action: "complete" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Could not finish setup.");
        setBusy(false);
        return;
      }
      toast.success("Your company Creed is ready.");
      router.push("/file");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  async function sendInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;

    setBusy(true);
    try {
      if (previewMode) {
        setInvites((rows) => [
          ...rows.filter((invite) => invite.email !== email),
          { id: `preview-invite-${inviteId.current++}`, email },
        ]);
        setInviteEmail("");
        return;
      }

      const res = await fetch("/api/app/company/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creedId, email, role: "member" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        inviteId?: string;
        error?: string;
      };
      if (!res.ok || !data.inviteId) {
        toast.error(data.error ?? "Invite failed.");
        return;
      }
      setInvites((rows) => [
        ...rows.filter((invite) => invite.id !== data.inviteId && invite.email !== email),
        { id: data.inviteId!, email },
      ]);
      setInviteEmail("");
      toast.success("Invite sent.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite(invite: InviteRow) {
    setInvites((rows) => rows.filter((row) => row.id !== invite.id));
    if (previewMode || invite.id.startsWith("preview-invite-")) return;

    const res = await fetch(`/api/app/company/invites/${invite.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setInvites((rows) => [...rows, invite]);
      toast.error("Could not revoke invite.");
    }
  }

  const previewSections = preview ?? seedSections;
  const canContinue =
    !busy &&
    !(step === Q_NAME && !answers.companyName.trim()) &&
    !(step === PASTE && !pasted.trim());

  // Enter-to-continue, mirroring the personal onboarding. Bind once and read the
  // latest handler/guard via refs so the listener never goes stale. Elements
  // marked data-disable-continue (the textareas, paste box, invite fields) let
  // Enter type a newline instead of advancing. INVITE finishes via the button
  // only, so Enter never fires an accidental "Finish setup".
  const continueRef = useRef(handleContinue);
  continueRef.current = handleContinue;
  const canContinueRef = useRef(canContinue);
  canContinueRef.current = canContinue;
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
        return;
      }
      if (stepRef.current === INVITE || !canContinueRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-disable-continue='true']")) return;
      event.preventDefault();
      void continueRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-dvh bg-[var(--creed-surface)] md:h-screen md:overflow-hidden">
      <motion.div
        className="h-[2px]"
        animate={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%`, backgroundColor: AMBER }}
        transition={{ duration: 1.2, ease: [0.32, 0.06, 0.18, 1] }}
      />

      <div className="flex min-h-[calc(100dvh-2px)] flex-col px-6 py-5 md:h-[calc(100vh-2px)] md:px-10 md:py-6">
        <div className="flex items-center justify-between">
          <Link href="/home" aria-label="Creed home" className="-ml-2 inline-flex items-center rounded-sm px-2 py-1.5 transition-opacity duration-200 hover:opacity-60">
            <CreedWordmark className="ml-0" />
          </Link>
          <div className="text-[12px] text-[var(--creed-text-tertiary)]">{`${step + 1} of ${TOTAL_STEPS}`}</div>
        </div>

        <div className="flex min-h-0 flex-1 items-start justify-center py-8 md:items-center md:py-4">
          <div className="w-full max-w-[1080px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className={cn("mx-auto w-full", step === PREVIEW ? "max-w-5xl" : "max-w-3xl")}>
                  {step === WELCOME ? (
                    <div className="text-center">
                      <AnimatedBlock index={0}>
                        <AnimatedHeadline text={"Your company's shared Creed."} className="t-section justify-center text-[var(--creed-text-primary)]" />
                      </AnimatedBlock>
                      <AnimatedBlock index={1}>
                        <p className="t-lede mx-auto mt-6 max-w-xl text-[var(--creed-text-tertiary)]">
                          One file your whole company and every AI agent they use read before acting.
                        </p>
                      </AnimatedBlock>
                      <AnimatedBlock index={2}>
                        <CompanyConstellation />
                      </AnimatedBlock>
                    </div>
                  ) : null}

                  {step === Q_NAME ? (
                    <QuestionStep title="What's the company called?" subtitle="The name your company and their agents see at the top of the shared Creed.">
                      <Input
                        value={answers.companyName}
                        onChange={(e) => set("companyName", e.target.value)}
                        placeholder="e.g. Bad Company"
                        className="h-12 rounded-xl border-[var(--creed-border)] px-4 text-[15px]"
                      />
                    </QuestionStep>
                  ) : null}

                  {step === EXP_SECTIONS ? (
                    <ExplainerStep
                      title="One file, for people and agents."
                      lede="Everything you share becomes one short, shared file. A handful of sections, each earning its place, that your company and every connected AI read first."
                    >
                      <SectionStripsCard />
                    </ExplainerStep>
                  ) : null}

                  {step === Q_DOES ? (
                    <QuestionStep title="What does the company do?" subtitle="What you build and who it's for, in a sentence or two.">
                      <QTextarea value={answers.whatItDoes} onChange={(v) => set("whatItDoes", v)} placeholder="e.g. We build the Bad Engine, real-time simulation for game studios shipping AAA titles." />
                    </QuestionStep>
                  ) : null}

                  {step === EXP_ATTRIBUTION ? (
                    <ExplainerStep
                      title="See who changed what."
                      lede="Every edit and proposal is attributed to a teammate or their agent, so you always know who shaped the shared file, and when."
                    >
                      <AttributionCard />
                    </ExplainerStep>
                  ) : null}

                  {step === Q_TEAM ? (
                    <QuestionStep title="Who's in the company?" subtitle="Names are enough for now. You can flesh out each person later.">
                      <QTextarea value={answers.people} onChange={(v) => set("people", v)} placeholder="e.g. Connor, Fergus, Sascha, Upendra" />
                    </QuestionStep>
                  ) : null}

                  {step === EXP_PROPOSAL ? (
                    <ExplainerStep
                      title="It stays sharp on its own."
                      lede="As your company's agents learn something durable, they propose a small edit to the right section. An owner or admin approves it, and the file stays current."
                    >
                      <ProposalCard />
                    </ExplainerStep>
                  ) : null}

                  {step === Q_PROJECTS ? (
                    <QuestionStep title="What should it know about?" subtitle="The projects and products in flight.">
                      <QTextarea value={answers.projects} onChange={(v) => set("projects", v)} placeholder="e.g. Bad Engine, Creed, the Q3 launch" />
                    </QuestionStep>
                  ) : null}

                  {step === EXP_PERMISSIONS ? (
                    <ExplainerStep
                      title="You control who sees what."
                      lede="Owners and admins set each member's access per section: hidden, read-only, propose, or edit. The shared file stays protected."
                    >
                      <PermissionsCard />
                    </ExplainerStep>
                  ) : null}

                  {step === Q_GUARD ? (
                    <QuestionStep title="What's off-limits?" subtitle="What agents should never change or assume without asking first.">
                      <QTextarea value={answers.neverChange} onChange={(v) => set("neverChange", v)} placeholder="e.g. Anything about finance, fundraising, or legal." />
                    </QuestionStep>
                  ) : null}

                  {step === EXP_CONTROL ? (
                    <ExplainerStep
                      title="Start shared, stay controlled."
                      lede="Your first company Creed is a starting point. Teammates and agents can suggest updates, but owners keep the final say."
                    >
                      <ControlFlowCard />
                    </ExplainerStep>
                  ) : null}

                  {step === PROMPT ? (
                    <div className="text-center">
                      <AnimatedBlock index={0}>
                        <AnimatedHeadline text="Build it with your assistant." className="t-section justify-center text-[var(--creed-text-primary)]" />
                      </AnimatedBlock>
                      <AnimatedBlock index={1}>
                        <p className="t-lede mx-auto mt-6 max-w-2xl text-[var(--creed-text-tertiary)]">
                          Copy this prompt and paste it into ChatGPT, Claude, or any AI you use. It turns
                          everything you just shared into your full company Creed.
                        </p>
                      </AnimatedBlock>
                      <AnimatedBlock index={2}>
                        <ComposePromptCard copied={promptCopied} onCopy={() => void handleCopyPrompt()} />
                      </AnimatedBlock>
                    </div>
                  ) : null}

                  {step === PASTE ? (
                    <QuestionStep title="Paste your company Creed." subtitle="Paste the markdown your assistant gave you. We'll turn it into your company Creed.">
                      <Textarea
                        value={pasted}
                        data-disable-continue="true"
                        onChange={(e) => {
                          setPasted(e.target.value);
                          if (pasteError) setPasteError(null);
                        }}
                        className={cn(
                          "min-h-[220px] max-h-[44vh] resize-none overflow-y-auto rounded-xl px-4 py-4 font-mono text-[14px] leading-7",
                          pasteError
                            ? "border-[#DC2626] focus-visible:border-[#DC2626] focus-visible:ring-[#DC2626]/15"
                            : "border-[var(--creed-border)]"
                        )}
                        placeholder={"## Company\n\nPaste the full markdown your assistant produced here."}
                      />
                      {pasteError ? <p className="mt-3 text-[13px] text-[#DC2626]">{pasteError}</p> : null}
                    </QuestionStep>
                  ) : null}

                  {step === PREVIEW ? (
                    <div className="text-center">
                      <AnimatedBlock index={0}>
                        <AnimatedHeadline text="Your company Creed." className="t-section justify-center text-[var(--creed-text-primary)]" />
                      </AnimatedBlock>
                      <AnimatedBlock index={1}>
                        <p className="t-lede mx-auto mt-6 max-w-2xl text-[var(--creed-text-tertiary)]">
                          Take a look, then invite your company.
                        </p>
                      </AnimatedBlock>
                      <AnimatedBlock index={2}>
                        <motion.div
                          initial={{ opacity: 0, y: 18, scale: 0.985, filter: "blur(10px)" }}
                          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                          className="mx-auto mt-10 max-w-[920px] overflow-hidden rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] text-left"
                        >
                          <div className="md:h-[440px] md:overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            <div className="mx-auto max-w-[920px] space-y-9 px-6 py-8 md:px-10">
                              {previewSections.map((section) => (
                                <section key={section.id}>
                                  <div className="mb-4 flex items-center gap-3">
                                    <span className="inline-block h-9 w-[3px] rounded-full" style={{ backgroundColor: accentColorMap[section.accent] }} />
                                    <span className="text-[15px] font-medium leading-none md:text-[16px]" style={{ color: accentColorMap[section.accent] }}>
                                      {section.name}
                                    </span>
                                  </div>
                                  <RichTextEditor sectionId={section.id} content={section.content} readOnly accentColor={accentColorMap[section.accent]} onChange={() => {}} />
                                </section>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      </AnimatedBlock>
                    </div>
                  ) : null}

                  {step === INVITE ? (
                    <div>
                      <AnimatedHeadline text="Invite your company." className="t-section text-[var(--creed-text-primary)]" />
                      <p className="t-lede mt-4 max-w-2xl text-[var(--creed-text-tertiary)]">
                        Add teammates by email, or do it later in Settings.
                      </p>
                      <div className="mt-9 max-w-2xl">
                        <div className="flex items-center gap-3">
                          <Input
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && inviteEmail.trim() && !busy) void sendInvite();
                            }}
                            placeholder="teammate@company.com"
                            className="h-11 flex-1 rounded-md border-[var(--creed-border)] px-3 text-[14px]"
                          />
                          <Button
                            className={`${INVITE_BUTTON} h-11`}
                            onClick={sendInvite}
                            disabled={busy || !inviteEmail.trim()}
                            onMouseEnter={inviteIcon.start}
                            onMouseLeave={inviteIcon.settle}
                          >
                            {busy ? (
                              <>
                                Inviting
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              </>
                            ) : (
                              <>
                                Invite
                                <SendIcon
                                  ref={inviteIcon.iconRef}
                                  size={16}
                                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center leading-none"
                                />
                              </>
                            )}
                          </Button>
                        </div>

                        <AnimatePresence initial={false}>
                          {invites.length > 0 ? (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                              className="mt-5 overflow-hidden"
                            >
                              <div className="flex flex-col divide-y divide-[var(--creed-border)] rounded-lg border border-[var(--creed-border)] px-4">
                                {invites.map((invite) => (
                                  <div key={invite.id} className="flex items-center justify-between gap-4 py-4">
                                    <div className="flex min-w-0 items-center gap-3">
                                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-dashed border-[var(--creed-border-strong)] text-[var(--creed-text-tertiary)]">
                                        <Mail className="h-4 w-4" />
                                      </span>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="truncate text-[14px] font-medium text-[var(--creed-text-primary)]">
                                            {invite.email}
                                          </span>
                                          <span className="inline-flex items-center rounded-[6px] bg-[#F5F3FF] px-1.5 py-0.5 text-[12px] font-medium text-[#6D28D9] dark:bg-[#2E1065]/50 dark:text-[#A78BFA]">
                                            Pending
                                          </span>
                                        </div>
                                        <div className="truncate text-[12px] text-[var(--creed-text-tertiary)]">
                                          Invited as member
                                        </div>
                                      </div>
                                    </div>
                                    <Button
                                      className="rounded-md bg-[#DC2626] px-3 text-white hover:bg-[#B91C1C] hover:text-white"
                                      onClick={() => void revokeInvite(invite)}
                                    >
                                      Revoke
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    </div>
                  ) : null}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3">
          <div>
            {busy ? null : (
              <button
                type="button"
                onClick={() => (step > 0 ? setStep((s) => s - 1) : void exitToPersonal())}
                className="inline-flex items-center gap-2 text-sm text-[var(--creed-text-secondary)] transition-colors duration-150 hover:text-[var(--creed-text-primary)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step === INVITE ? (
              <button
                type="button"
                onClick={() => void finish(false)}
                disabled={busy}
                className="text-[13px] text-[var(--creed-text-tertiary)] transition-colors hover:text-[var(--creed-text-secondary)]"
              >
                Skip
              </button>
            ) : null}
            {step !== INVITE ? (
              <span className="hidden text-[12px] text-[var(--creed-text-tertiary)] md:inline">↵ to continue</span>
            ) : null}
            <Button
              style={{ borderRadius: "0.875rem" }}
              className="bg-[var(--creed-text-primary)] px-5 text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)] disabled:bg-[var(--creed-border-strong)] disabled:text-[var(--creed-text-tertiary)]"
              onClick={handleContinue}
              disabled={!canContinue}
            >
              {busy ? (step === PASTE ? "Composing" : "Saving") : step === INVITE ? "Finish setup" : "Continue"}
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRightIcon className="h-4 w-4" size={16} />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionStep({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div>
      <AnimatedHeadline text={title} className="t-section text-[var(--creed-text-primary)]" />
      <p className="t-lede mt-4 max-w-2xl text-[var(--creed-text-tertiary)]">{subtitle}</p>
      <div className="mt-9">
        <AnimatedBlock index={0}>{children}</AnimatedBlock>
      </div>
    </div>
  );
}

function ExplainerStep({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  return (
    <div className="text-center">
      <AnimatedBlock index={0}>
        <AnimatedHeadline text={title} className="t-section justify-center text-[var(--creed-text-primary)]" />
      </AnimatedBlock>
      <AnimatedBlock index={1}>
        <p className="t-lede mx-auto mt-6 max-w-xl text-[var(--creed-text-tertiary)]">{lede}</p>
      </AnimatedBlock>
      <AnimatedBlock index={2}>{children}</AnimatedBlock>
    </div>
  );
}

function QTextarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-disable-continue="true"
      placeholder={placeholder}
      className="min-h-[180px] rounded-xl border-[var(--creed-border)] px-4 py-4 text-[15px] leading-7"
    />
  );
}

// ──────────────────────────────────────────────────────────────────
// Explainer: sections. The default company sections assembling into one file,
// mirroring the real file layout - an accent bar, the section name in its hue,
// and skeleton body lines. Matches the personal onboarding's sections card.
// ──────────────────────────────────────────────────────────────────

const STRIP_ROWS: { name: string; accent: AccentKey }[] = [
  { name: "Company", accent: "identity" },
  { name: "Ethos", accent: "operating-principles" },
  { name: "People", accent: "rose" },
  { name: "Projects", accent: "projects" },
  { name: "Operating Rules", accent: "boundaries" },
];

function SectionStripsCard() {
  return (
    <div className="mx-auto mt-10 max-w-[360px] rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5 text-left">
      {STRIP_ROWS.map((row, index) => (
        <motion.div
          key={row.name}
          className="flex items-start gap-3 py-2.5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="mt-0.5 h-9 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: accentColorMap[row.accent] }} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium" style={{ color: accentColorMap[row.accent] }}>
              {row.name}
            </div>
            <div className="mt-2 h-[6px] w-full rounded-full bg-[var(--creed-surface-raised)]" />
            <div className="mt-1.5 h-[6px] w-3/5 rounded-full bg-[var(--creed-surface-raised)]" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Explainer: attribution. A compact activity feed mirroring the real app's
// ActivityRow chrome - agent icon or a coloured section dot, the section name
// with a status pill, and the actor + time beneath. Shows that every change is
// attributed to a person or their agent.
// ──────────────────────────────────────────────────────────────────

type AttributionEntry = {
  section: string;
  actor: string;
  when: string;
  status: "Proposed" | "Direct" | "Accepted";
  agent: string;
};

const ATTRIBUTION_ENTRIES: AttributionEntry[] = [
  { section: "Projects", actor: "Fergus's Claude Code", when: "just now", status: "Proposed", agent: "Claude" },
  { section: "People", actor: "Sascha's Cursor", when: "4m ago", status: "Direct", agent: "Cursor" },
  { section: "Ethos", actor: "Connor's ChatGPT", when: "1h ago", status: "Accepted", agent: "ChatGPT" },
];

// The exact activity-pill tokens from the app (getProposalStatusStyles): blue
// for a pending proposal, amber for a direct edit, green for an accepted one.
const ATTRIBUTION_STATUS_STYLES: Record<AttributionEntry["status"], string> = {
  Proposed: "bg-[#EFF6FF] text-[var(--creed-accent-hover)] dark:bg-[#1e3a8a]/25 dark:text-[#93c5fd]",
  Direct: "bg-[#FFF6E8] text-[#C26A00] dark:bg-[#451a03]/40 dark:text-[#fbbf24]",
  Accepted: "bg-[#F0FDF4] text-[#15803D] dark:bg-[#052e1a]/50 dark:text-[#4ade80]",
};

function AttributionCard() {
  return (
    <motion.div
      className="mx-auto mt-10 max-w-[520px] overflow-hidden rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] text-left shadow-[0_8px_24px_rgba(28,28,26,0.04)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
    >
      {ATTRIBUTION_ENTRIES.map((entry, index) => (
        <motion.div
          key={entry.section}
          className={cn("flex items-start gap-3 px-4 py-3", index > 0 && "border-t border-[var(--creed-border)]")}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.25 + index * 0.12, ease: [0.22, 1, 0.36, 1] }}
        >
          <AgentIconStack agents={[entry.agent]} variant="inline" className="mt-0.5 shrink-0" itemClassName="h-5 w-5" maxVisible={1} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium text-[var(--creed-text-primary)]">{entry.section}</span>
              <span className={cn("rounded-[6px] px-2 py-0.5 text-[10px] font-medium", ATTRIBUTION_STATUS_STYLES[entry.status])}>
                {entry.status}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[12px] text-[var(--creed-text-secondary)]">
              <span className="truncate">{entry.actor}</span>
              <span className="text-[var(--creed-text-tertiary)]">·</span>
              <span className="text-[var(--creed-text-tertiary)]">{entry.when}</span>
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Explainer: proposals. Mirrors the real InlineProposalDiff chrome (agent
// attribution row, word-level diff, +N/−N badges, blue Accept) so the teaching
// card matches what an owner actually approves in the editor. Same component
// shape as the personal onboarding's ProposalCard.
// ──────────────────────────────────────────────────────────────────

const PROPOSAL_EXISTING = "Bad Engine, Creed.";
const PROPOSAL_PROPOSED = "Bad Engine, Creed, the Q3 launch.";

function ProposalCard() {
  const parts = useMemo(() => computeDiffParts(PROPOSAL_EXISTING, PROPOSAL_PROPOSED), []);
  const stats = useMemo(() => summarizeDiff(parts), [parts]);

  return (
    <motion.div
      className="mx-auto mt-10 max-w-[640px] rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] text-left shadow-[0_8px_24px_rgba(28,28,26,0.04)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap text-sm text-[var(--creed-text-secondary)]">
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)]" />
          <AgentIconStack agents={["Claude"]} variant="inline" itemClassName="h-5 w-5" maxVisible={1} />
          <span className="font-medium text-[var(--creed-text-primary)]">Fergus&apos;s Claude</span>
          <span className="text-[var(--creed-text-tertiary)]">proposed an update</span>
          <span className="text-[var(--creed-text-tertiary)]">·</span>
          <span className="inline-flex items-center gap-1">
            <DiffBadge tone="added" count={stats.added} size="md" />
            <DiffBadge tone="removed" count={stats.removed} size="md" />
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium text-[var(--creed-text-secondary)]">
            <X className="h-3.5 w-3.5" />
            Reject
          </span>
          <span className="inline-flex h-7 items-center gap-1 rounded-md bg-[var(--creed-accent)] px-2.5 text-sm font-medium text-white">
            <Check className="h-3.5 w-3.5" />
            Accept
          </span>
        </div>
      </div>
      <div className="border-t border-[var(--creed-border)]" />
      <div className="creed-diff-block px-4 py-3">
        {parts.map((part, index) => {
          if (part.added) {
            return (
              <span key={index} className="creed-diff-add">
                {part.value}
              </span>
            );
          }
          if (part.removed) {
            return (
              <span key={index} className="creed-diff-remove">
                {part.value}
              </span>
            );
          }
          return <span key={index}>{part.value}</span>;
        })}
      </div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Explainer: permissions. Section rows each with a dropdown-style access pill,
// mirroring the real per-member section permission control (the SelectMenu
// trigger) so it reads as the actual settings surface.
// ──────────────────────────────────────────────────────────────────

const PERM_ROWS: { name: string; accent: AccentKey; level: string }[] = [
  { name: "Company", accent: "identity", level: "Read-only" },
  { name: "Ethos", accent: "operating-principles", level: "Propose" },
  { name: "Finance", accent: "boundaries", level: "Hidden" },
  { name: "Projects", accent: "projects", level: "Direct edit" },
];

// A static replica of the SelectMenu trigger (components/ui/select-menu.tsx) so
// the explainer reads as the real permission control without being interactive.
function SelectPill({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 shrink-0 items-center justify-between gap-2 rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[13px] text-[var(--creed-text-primary)]",
        className
      )}
    >
      <span className="truncate">{label}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)]" strokeWidth={2} />
    </span>
  );
}

function PermissionsCard() {
  return (
    <motion.div
      className="mx-auto mt-10 w-full max-w-[440px] rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 pt-4 pb-2.5 text-left shadow-[0_8px_24px_rgba(28,28,26,0.04)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
    >
      <SelectPill label="Sascha (sascha@badcompany.com)" className="w-full" />
      <div className="mt-3 flex flex-col divide-y divide-[var(--creed-border)]">
        {PERM_ROWS.map((row, index) => (
          <motion.div
            key={row.name}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center justify-between gap-3 py-2"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: accentColorMap[row.accent] }}
              />
              <span className="truncate text-[13px] text-[var(--creed-text-primary)]">{row.name}</span>
            </span>
            <SelectPill label={row.level} className="min-w-[128px]" />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Explainer: controlled evolution. A mini Activity sidebar showing people and
// agents shaping the shared file, with review status and attribution visible.
// ──────────────────────────────────────────────────────────────────

const CONTROL_ACTIVITY_ITEMS = [
  {
    section: "Operating Rules",
    actor: "Connor Hepburn",
    status: "Direct",
    when: "now",
    before: "Agents should ask before changing finance or legal.",
    after: "Agents should ask before changing finance, legal, fundraising, or public positioning.",
    avatar: "C",
    avatarClassName: "bg-[#E0F2FE] text-[#0369A1] dark:bg-[#0C4A6E]/45 dark:text-[#7DD3FC]",
    agent: null,
  },
  {
    section: "Projects",
    actor: "Fergus's Claude Code",
    status: "Proposed",
    when: "2m ago",
    before: "Creed Company is the current priority.",
    after: "Creed Company is the current priority, with onboarding polish and section permissions next.",
    avatar: "F",
    avatarClassName: "bg-[#F3E8FF] text-[#7E22CE] dark:bg-[#581C87]/45 dark:text-[#D8B4FE]",
    agent: { name: "Claude Code", icon: "claudecode" },
  },
  {
    section: "People",
    actor: "Sascha Mills",
    status: "Accepted",
    when: "8m ago",
    before: "Sascha helps with customer workflow.",
    after: "Sascha owns customer workflow and onboarding clarity.",
    avatar: "S",
    avatarClassName: "bg-[#FFE4E6] text-[#BE123C] dark:bg-[#881337]/45 dark:text-[#FDA4AF]",
    agent: null,
  },
] as const;

const CONTROL_STATUS_STYLES: Record<(typeof CONTROL_ACTIVITY_ITEMS)[number]["status"], string> = {
  Direct: "bg-[#FFF6E8] text-[#C26A00] dark:bg-[#451a03]/40 dark:text-[#fbbf24]",
  Proposed: "bg-[#EFF6FF] text-[var(--creed-accent-hover)] dark:bg-[#1e3a8a]/25 dark:text-[#93c5fd]",
  Accepted: "bg-[#F0FDF4] text-[#15803D] dark:bg-[#052e1a]/50 dark:text-[#4ade80]",
};

function ControlFlowCard() {
  const openIndex = 1;
  return (
    <motion.div
      className="mx-auto mt-8 w-full max-w-[460px] rounded-[18px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4 text-left shadow-[0_8px_24px_rgba(28,28,26,0.04)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[14px] font-medium text-[var(--creed-text-primary)]">Activity</div>
          <div className="mt-1 text-[12px] text-[var(--creed-text-tertiary)]">Everyone can see what changed.</div>
        </div>
      </div>
      <div className="space-y-2">
        {CONTROL_ACTIVITY_ITEMS.map((item, index) => (
          <ControlActivityRow key={`${item.section}-${item.actor}`} item={item} open={index === openIndex} index={index} />
        ))}
      </div>
    </motion.div>
  );
}

function ControlActivityRow({
  item,
  open,
  index,
}: {
  item: (typeof CONTROL_ACTIVITY_ITEMS)[number];
  open: boolean;
  index: number;
}) {
  const parts = useMemo(() => computeDiffParts(item.before, item.after), [item.after, item.before]);
  const stats = useMemo(() => summarizeDiff(parts), [parts]);

  return (
    <motion.div
      className="rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.22 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-start gap-3">
        {item.agent ? (
          <AgentIconStack
            agents={[item.agent]}
            variant="inline"
            className="ml-0.5 mt-[2px] shrink-0"
            itemClassName="h-5 w-5"
            maxVisible={1}
          />
        ) : (
          <div
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] border border-[var(--creed-border)] text-[10px] font-medium",
              item.avatarClassName
            )}
          >
            {item.avatar}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[13px] font-medium text-[var(--creed-text-primary)]">{item.section}</div>
            <span className={cn("rounded-[6px] px-2 py-0.5 text-[10px] font-medium", CONTROL_STATUS_STYLES[item.status])}>
              {item.status}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-[var(--creed-text-tertiary)]",
                open ? "rotate-0" : "-rotate-90",
              )}
            />
          </div>
          <div className="mt-1 flex items-center gap-2 text-[12px] text-[var(--creed-text-secondary)]">
            <span className="truncate">{item.actor}</span>
            <span className="inline-flex items-center gap-1">
              <span className="text-[var(--creed-text-tertiary)]">·</span>
              <DiffBadge tone="added" count={stats.added} />
              <DiffBadge tone="removed" count={stats.removed} />
            </span>
          </div>
        </div>
        <div className="text-[12px] text-[var(--creed-text-tertiary)]">{item.when}</div>
      </div>

      {open ? (
        <div className="mt-3 overflow-hidden">
          <div className="-mx-3 border-t border-[var(--creed-border)]" />
          <div className="creed-diff-block -mx-3 max-h-32 overflow-y-auto px-4 py-3">
            {parts.map((part, partIndex) => {
              if (part.added) {
                return (
                  <span key={partIndex} className="creed-diff-add">
                    {part.value}
                  </span>
                );
              }
              if (part.removed) {
                return (
                  <span key={partIndex} className="creed-diff-remove">
                    {part.value}
                  </span>
                );
              }
              return <span key={partIndex}>{part.value}</span>;
            })}
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}

type ConstellationNode =
  | { kind: "agent"; icon: AgentIconKind; x: number; y: number }
  | { kind: "employee"; x: number; y: number };

const COMPANY_NODES: ConstellationNode[] = [
  { kind: "agent", icon: "chatgpt", x: 50, y: 9 },
  { kind: "agent", icon: "claude", x: 79, y: 17 },
  { kind: "agent", icon: "codex", x: 91, y: 45 },
  { kind: "employee", x: 83, y: 76 },
  { kind: "employee", x: 58, y: 92 },
  { kind: "agent", icon: "claudecode", x: 39, y: 90 },
  { kind: "employee", x: 13, y: 74 },
  { kind: "agent", icon: "cursor", x: 8, y: 43 },
  { kind: "employee", x: 24, y: 16 },
];

function CompanyConstellation() {
  return (
    <div className="relative mx-auto mt-10 aspect-square w-full max-w-[400px]">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {COMPANY_NODES.map((node, index) => (
          <motion.line
            key={`line-${index}`}
            x1={node.x}
            y1={node.y}
            x2={50}
            y2={50}
            stroke="var(--creed-border-strong)"
            strokeWidth={0.4}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{
              pathLength: { duration: 0.85, delay: 0.2 + index * 0.05, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 0.3, delay: 0.2 + index * 0.05 },
            }}
          />
        ))}
        {COMPANY_NODES.map((node, index) => (
          <motion.circle
            key={`pulse-${index}`}
            r={1.15}
            fill={RED}
            initial={{ cx: node.x, cy: node.y, opacity: 0 }}
            animate={{ cx: [node.x, (node.x + 50) / 2, 50], cy: [node.y, (node.y + 50) / 2, 50], opacity: [0, 0.9, 0] }}
            transition={{ duration: 1.9, delay: 1 + index * 0.12, repeat: Infinity, repeatDelay: 0.5, ease: "easeInOut" }}
          />
        ))}
      </svg>

      {COMPANY_NODES.map((node, index) => (
        <div key={`chip-${index}`} className="absolute z-10" style={{ left: `${node.x}%`, top: `${node.y}%`, transform: "translate(-50%, -50%)" }}>
          <motion.div
            className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--creed-border)] bg-[var(--creed-surface)]"
            initial={{ opacity: 0, scale: 0.55 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.35 + index * 0.05, ease: [0.22, 1, 0.36, 1] }}
          >
            {node.kind === "agent" ? (
              <IntegrationGlyph kind={node.icon} framed={false} className="h-7 w-7" assetClassName="h-7 w-7" />
            ) : (
              <User className="h-6 w-6 text-white" strokeWidth={1.8} />
            )}
          </motion.div>
        </div>
      ))}

      <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
        <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}>
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: AMBER }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/brand/logo.svg" alt="Creed" className="h-8 w-auto select-none" style={{ filter: "brightness(0) invert(1)" }} draggable={false} />
            <motion.span
              className="absolute inset-0 rounded-full border"
              style={{ borderColor: AMBER }}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: [0, 0.2, 0], scale: [0.92, 1.32, 1.42] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: [0.22, 1, 0.36, 1], delay: 0.9 }}
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function AnimatedHeadline({ text, className }: { text: string; className?: string }) {
  const lines = useMemo(() => text.split("\n"), [text]);
  return (
    <motion.h1
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.042 } } }}
      className={cn("flex flex-wrap", className)}
    >
      {lines.map((line, lineIndex) => {
        const words = line.split(" ");
        return (
          <span key={`${line}-${lineIndex}`} className="basis-full">
            {words.map((word, wordIndex) => (
              <span key={`${word}-${lineIndex}-${wordIndex}`} className="inline-block whitespace-nowrap align-baseline">
                {splitPreservingLigatures(word).map((glyph, glyphIndex) => (
                  <motion.span
                    key={`${glyph}-${lineIndex}-${wordIndex}-${glyphIndex}`}
                    variants={{ hidden: { opacity: 0, filter: "blur(10px)", y: 10 }, visible: { opacity: 1, filter: "blur(0px)", y: 0 } }}
                    transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
                    className="inline-block whitespace-pre"
                  >
                    {glyph}
                  </motion.span>
                ))}
                {wordIndex < words.length - 1 ? (
                  <motion.span
                    variants={{ hidden: { opacity: 0, filter: "blur(10px)", y: 10 }, visible: { opacity: 1, filter: "blur(0px)", y: 0 } }}
                    transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
                    className="inline-block whitespace-pre"
                  >
                    {" "}
                  </motion.span>
                ) : null}
              </span>
            ))}
          </span>
        );
      })}
    </motion.h1>
  );
}

function AnimatedBlock({ children, index }: { children: ReactNode; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ delay: index * 0.045, duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
