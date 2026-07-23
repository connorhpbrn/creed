"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, ChevronDown, Download, FileText, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/arrow-right";
import { Textarea } from "@/components/ui/textarea";
import { CreedWordmark, IntegrationGlyph } from "@/components/creed/brand";
import { useCreed } from "@/components/creed/creed-provider";
import { ComposePromptCard } from "@/components/creed/compose-prompt-card";
import { AgentIconStack } from "@/components/creed/agent-icon-stack";
import {
  DiffBadge,
  computeDiffParts,
  summarizeDiff,
} from "@/components/creed/inline-proposal-diff";
import { RichTextEditor } from "@/components/creed/rich-text-editor";
import { useStripeCheckout } from "@/components/marketing/use-stripe-checkout";
import {
  accentColorMap,
  type AgentIconKind,
  type CreedSection,
} from "@/lib/creed-data";
import { buildComposePrompt } from "@/lib/creed-prompts";
import { splitPreservingLigatures } from "@/lib/landing-text";
import {
  buildOnboardingPreviewSections,
  compileOnboardingDraft,
} from "@/lib/onboarding/compile";
import {
  isAlreadyComposedConflict,
  type OnboardingComposeResponse,
} from "@/lib/onboarding/compose-response";
import { cn } from "@/lib/utils";

// 10-step flow indexed 0-9: welcome / Q1 identity / explainer / Q2 goals /
// explainer / Q3 preferences / explainer / prompt / paste / preview. Three open
// questions feed a deterministic seed draft; three explainer slides woven
// through them teach what Creed is. The user copies a prompt into any
// assistant, which returns a markdown Creed they paste back. No MCP in
// onboarding - the agent connection is a paid feature set up later. Each step
// picks an accent for the top progress bar so the colour tracks where the user
// is in the flow.
const TOTAL_STEPS = 10;
const WELCOME_STEP = 0;
const Q1_STEP = 1;
const EXPLAINER_A_STEP = 2;
const Q2_STEP = 3;
const EXPLAINER_B_STEP = 4;
const Q3_STEP = 5;
const EXPLAINER_C_STEP = 6;
const PROMPT_STEP = 7;
const PASTE_STEP = 8;
const PREVIEW_STEP = 9;

const stepAccentMap = [
  accentColorMap.identity, // 0 welcome
  accentColorMap.identity, // 1 Q1 identity
  accentColorMap.tools, // 2 explainer: the file's shape
  accentColorMap.projects, // 3 Q2 goals
  accentColorMap.workflows, // 4 explainer: proposals
  accentColorMap.preferences, // 5 Q3 preferences
  accentColorMap.rose, // 6 explainer: ownership
  "#2563EB", // 7 prompt
  accentColorMap.identity, // 8 paste
  accentColorMap.identity, // 9 preview
];

export function OnboardingScreen({
  paid,
  initialStage,
}: {
  paid: boolean;
  initialStage?: "prompt" | "preview";
}) {
  const router = useRouter();
  const { state, updateOnboarding, claimOnboardingPreview } = useCreed();
  const { startCheckout, submitting: checkoutSubmitting } = useStripeCheckout();
  const [step, setStep] = useState(
    initialStage === "preview" ? PREVIEW_STEP : initialStage === "prompt" ? PROMPT_STEP : 0
  );
  const [claiming, setClaiming] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const currentAccent = stepAccentMap[step];
  const previewSections = useMemo(
    () => buildOnboardingPreviewSections(compileOnboardingDraft(state.onboarding)),
    [state.onboarding]
  );

  // The welcome headline greets the signed-in user by first name when we have a
  // clean one, falling back to a plain greeting otherwise.
  const welcomeHeadline = useMemo(() => {
    const first = (state.user.name || "").trim().split(/\s+/)[0];
    return first && first.length <= 24 ? `Welcome to Creed, ${first}.` : "Welcome to Creed.";
  }, [state.user.name]);

  // Paste-compose result: set from the /api/app/onboarding/compose response when
  // the user pastes the markdown their assistant produced. Falls back to provider
  // state so a resuming, already-composed user still sees their Creed.
  const [composedResult, setComposedResult] = useState<CreedSection[] | null>(null);
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteSubmitting, setPasteSubmitting] = useState(false);
  const composedSections = composedResult ?? state.sections;
  const composed =
    composedResult !== null ||
    state.sections.some((section) => section.lastEditedType === "agent");

  // A returning PAID user who already has a composed Creed skips onboarding and
  // goes straight to /file. We gate on `paid` so unpaid composed users (whom the
  // app layout sends here to pay) are NOT bounced - that would loop them
  // /file <-> /onboarding. They instead start on the preview (via initialStage)
  // with the "Get Creed" button. We only bounce at step 0, never mid-flow.
  useEffect(() => {
    if (paid && step === 0 && composed) {
      router.replace("/file");
    }
  }, [router, paid, step, composed]);

  const handleContinue = useCallback(async () => {
    if (step === EXPLAINER_C_STEP) {
      // The last screen before the prompt. Every earlier step advances
      // instantly; this Continue claims the deterministic seed draft (a quick
      // server persist) so the paste-compose endpoint has it to map the pasted
      // Creed onto, then moves to the prompt step. This is the one loading
      // moment in the questionnaire.
      if (claiming) return;
      setClaiming(true);
      try {
        await claimOnboardingPreview(previewSections);
        setStep(PROMPT_STEP);
      } finally {
        setClaiming(false);
      }
      return;
    }
    if (step === PROMPT_STEP) {
      // No gate: they copy the prompt here and paste the result on the next step.
      setStep(PASTE_STEP);
      return;
    }
    if (step === PASTE_STEP) {
      if (pasteSubmitting) return;
      const markdown = pasted.trim();
      if (!markdown) {
        setPasteError("Paste the markdown your assistant gave you.");
        return;
      }
      setPasteSubmitting(true);
      setPasteError(null);
      try {
        const res = await fetch("/api/app/onboarding/compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown }),
        });
        const data = (await res.json().catch(() => ({}))) as OnboardingComposeResponse & {
          ok?: boolean;
          matched?: number;
          sections?: CreedSection[];
        };
        // A re-paste after a successful compose is safe to resume. Other
        // conflicts, such as a missing seed, must remain visible to the user.
        if (isAlreadyComposedConflict(res.status, data)) {
          setStep(PREVIEW_STEP);
          return;
        }
        if (!res.ok) {
          setPasteError(
            typeof data.error === "string" ? data.error : "Could not save that. Try again."
          );
          return;
        }
        if (!data.ok || !data.matched || !data.sections) {
          setPasteError(
            "That doesn't look like your Creed. Paste the whole markdown your assistant gave you."
          );
          return;
        }
        setComposedResult(data.sections);
        setStep(PREVIEW_STEP);
      } catch {
        setPasteError("Could not save that. Check your connection and try again.");
      } finally {
        setPasteSubmitting(false);
      }
      return;
    }
    setStep((current) => Math.min(current + 1, TOTAL_STEPS - 1));
  }, [step, claiming, pasted, pasteSubmitting, previewSections, claimOnboardingPreview]);

  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      if (step >= TOTAL_STEPS - 1 || claiming) {
        return;
      }

      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      if (target.closest("[data-disable-continue='true']")) {
        return;
      }

      event.preventDefault();
      handleContinue();
    }

    window.addEventListener("keydown", onWindowKeyDown);

    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [claiming, step, handleContinue]);

  function handleFinish() {
    // The Creed is persisted server-side (the paste-compose endpoint wrote it),
    // so use a full navigation: /file reloads from server state and renders the
    // composed Creed rather than the provider's possibly-stale seed.
    window.location.href = "/file";
  }

  async function handleCopyPrompt() {
    await navigator.clipboard.writeText(buildComposePrompt(previewSections));
    setPromptCopied(true);
    window.setTimeout(() => setPromptCopied(false), 1600);
  }

  return (
    <div className="min-h-dvh bg-[var(--creed-surface)] md:h-screen md:overflow-hidden">
      <motion.div
        className="h-[2px]"
        animate={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%`, backgroundColor: currentAccent }}
        transition={{ duration: 1.45, ease: [0.32, 0.06, 0.18, 1] }}
      />

      <div className="flex min-h-[calc(100dvh-2px)] flex-col px-6 py-5 md:h-[calc(100vh-2px)] md:px-10 md:py-6">
        <div className="flex items-center justify-between">
          <Link
            href="/home"
            aria-label="Creed home"
            className="-ml-2 inline-flex items-center rounded-sm px-2 py-1.5 transition-opacity duration-200 hover:opacity-60"
          >
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
                <StepFrame wide={step >= PROMPT_STEP}>
                  {/* Step 0 - welcome */}
                  {step === WELCOME_STEP ? (
                    <div className="text-center">
                      <AnimatedBlock index={0}>
                        <AnimatedHeadline
                          text={welcomeHeadline}
                          className="t-section justify-center text-[var(--creed-text-primary)]"
                        />
                      </AnimatedBlock>
                      <AnimatedBlock index={1}>
                        <p className="t-lede mx-auto mt-6 text-[var(--creed-text-tertiary)]">
                          One file every AI reads before it answers, so you never re-explain yourself.
                        </p>
                      </AnimatedBlock>
                      <AnimatedBlock index={2}>
                        <WelcomeConstellation />
                      </AnimatedBlock>
                    </div>
                  ) : null}

                  {/* Step 1 - Q1: identity + work */}
                  {step === Q1_STEP ? (
                    <OnboardingStep
                      title="Who are you?"
                      subtitle="Your role, what you actually do all day, the tools you live in, and what stays true about you. Write it like you'd brief a sharp new collaborator."
                    >
                      <AnimatedBlock index={0}>
                        <Textarea
                          data-disable-continue="true"
                          value={state.onboarding.identity}
                          onChange={(event) => updateOnboarding({ identity: event.target.value })}
                          className="min-h-[220px] rounded-xl border-[var(--creed-border)] px-4 py-4 text-[15px] leading-7"
                          placeholder="e.g. Founder and engineer building Creed end to end. Strong product taste, allergic to bloated process. Live in Figma, Linear, and the terminal all day."
                        />
                      </AnimatedBlock>
                    </OnboardingStep>
                  ) : null}

                  {/* Step 2 - explainer: the file's shape */}
                  {step === EXPLAINER_A_STEP ? (
                    <div className="text-center">
                      <AnimatedBlock index={0}>
                        <AnimatedHeadline
                          text="Your context, one page."
                          className="t-section justify-center text-[var(--creed-text-primary)]"
                        />
                      </AnimatedBlock>
                      <AnimatedBlock index={1}>
                        <p className="t-lede mx-auto mt-6 max-w-xl text-[var(--creed-text-tertiary)]">
                          Everything you share becomes one short, structured file. A handful of
                          sections, each one earning its place.
                        </p>
                      </AnimatedBlock>
                      <AnimatedBlock index={2}>
                        <SectionStripsCard />
                      </AnimatedBlock>
                    </div>
                  ) : null}

                  {/* Step 3 - Q2: goals */}
                  {step === Q2_STEP ? (
                    <OnboardingStep
                      title="What are you working toward?"
                      subtitle="The goals, projects, or problems you want every AI to keep in view. Near-term and long-horizon both count."
                    >
                      <AnimatedBlock index={0}>
                        <Textarea
                          data-disable-continue="true"
                          value={state.onboarding.goals}
                          onChange={(event) => updateOnboarding({ goals: event.target.value })}
                          className="min-h-[200px] rounded-xl border-[var(--creed-border)] px-4 py-4 text-[15px] leading-7"
                          placeholder="e.g. Ship the Creed v2 onboarding this quarter. Hit $20k MRR before summer. Long term, make Creed the file every AI reads first."
                        />
                      </AnimatedBlock>
                    </OnboardingStep>
                  ) : null}

                  {/* Step 4 - explainer: proposals keep it current */}
                  {step === EXPLAINER_B_STEP ? (
                    <div className="text-center">
                      <AnimatedBlock index={0}>
                        <AnimatedHeadline
                          text="It stays sharp on its own."
                          className="t-section justify-center text-[var(--creed-text-primary)]"
                        />
                      </AnimatedBlock>
                      <AnimatedBlock index={1}>
                        <p className="t-lede mx-auto mt-6 max-w-xl text-[var(--creed-text-tertiary)]">
                          As your agents learn something durable about you, they propose a small edit
                          to the right section. You approve it, and the file stays current without the
                          upkeep.
                        </p>
                      </AnimatedBlock>
                      <AnimatedBlock index={2}>
                        <ProposalCard />
                      </AnimatedBlock>
                    </div>
                  ) : null}

                  {/* Step 5 - Q3: preferences */}
                  {step === Q3_STEP ? (
                    <OnboardingStep
                      title="How should AI treat you?"
                      subtitle="How replies should sound, what it should always do, and anything it should never do."
                    >
                      <AnimatedBlock index={0}>
                        <Textarea
                          data-disable-continue="true"
                          value={state.onboarding.preferences}
                          onChange={(event) =>
                            updateOnboarding({ preferences: event.target.value })
                          }
                          className="min-h-[200px] rounded-xl border-[var(--creed-border)] px-4 py-4 text-[15px] leading-7"
                          placeholder="e.g. Be direct, lead with the answer. No preambles, no over-praise. Never make assumptions about my work without checking first."
                        />
                      </AnimatedBlock>
                    </OnboardingStep>
                  ) : null}

                  {/* Step 6 - explainer: the file is yours */}
                  {step === EXPLAINER_C_STEP ? (
                    <div className="text-center">
                      <AnimatedBlock index={0}>
                        <AnimatedHeadline
                          text="It's yours to keep."
                          className="t-section justify-center text-[var(--creed-text-primary)]"
                        />
                      </AnimatedBlock>
                      <AnimatedBlock index={1}>
                        <p className="t-lede mx-auto mt-6 max-w-xl text-[var(--creed-text-tertiary)]">
                          Your Creed is plain markdown you own. Export it anytime, take it anywhere,
                          no lock-in.
                        </p>
                      </AnimatedBlock>
                      <AnimatedBlock index={2}>
                        <OwnershipCard />
                      </AnimatedBlock>
                    </div>
                  ) : null}

                  {/* Step 7 - Copy the compose prompt */}
                  {step === PROMPT_STEP ? (
                    <div className="text-center">
                      <AnimatedBlock index={0}>
                        <AnimatedHeadline
                          text="Build it with your assistant."
                          className="t-section justify-center text-[var(--creed-text-primary)]"
                        />
                      </AnimatedBlock>
                      <AnimatedBlock index={1}>
                        <p className="t-lede mx-auto mt-6 max-w-2xl text-[var(--creed-text-tertiary)]">
                          Copy this prompt and paste it into ChatGPT, Claude, or any AI you use. It
                          turns everything you just shared into your full Creed.
                        </p>
                      </AnimatedBlock>
                      <AnimatedBlock index={2}>
                        <ComposePromptCard copied={promptCopied} onCopy={() => void handleCopyPrompt()} />
                      </AnimatedBlock>
                    </div>
                  ) : null}

                  {/* Step 8 - Paste the markdown the assistant produced */}
                  {step === PASTE_STEP ? (
                    <OnboardingStep
                      title="Paste your Creed."
                      subtitle="Paste the markdown your assistant gave you - we'll turn it into your Creed."
                    >
                      <AnimatedBlock index={0}>
                        <Textarea
                          data-disable-continue="true"
                          value={pasted}
                          onChange={(event) => {
                            setPasted(event.target.value);
                            if (pasteError) setPasteError(null);
                          }}
                          className={cn(
                            "min-h-[220px] max-h-[44vh] resize-none overflow-y-auto rounded-xl px-4 py-4 font-mono text-[14px] leading-7",
                            pasteError
                              ? "border-[#DC2626] focus-visible:border-[#DC2626] focus-visible:ring-[#DC2626]/15"
                              : "border-[var(--creed-border)]"
                          )}
                          placeholder={"## Identity\n\nPaste the full markdown your assistant produced here."}
                        />
                        {pasteError ? (
                          <p className="mt-3 text-[13px] text-[#DC2626]">{pasteError}</p>
                        ) : null}
                      </AnimatedBlock>
                    </OnboardingStep>
                  ) : null}

                  {/* Step 9 - Preview the composed Creed before entering the app */}
                  {step === PREVIEW_STEP ? (
                    <div className="text-center">
                      <AnimatedBlock index={0}>
                        <AnimatedHeadline
                          text="Your Creed."
                          className="t-section justify-center text-[var(--creed-text-primary)]"
                        />
                      </AnimatedBlock>
                      <AnimatedBlock index={1}>
                        <p className="t-lede mx-auto mt-6 max-w-2xl text-[var(--creed-text-tertiary)]">
                          Take a look, then head in.
                        </p>
                      </AnimatedBlock>
                      <AnimatedBlock index={2}>
                        <motion.div
                          initial={{ opacity: 0, y: 18, scale: 0.985, filter: "blur(10px)" }}
                          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                          className="mx-auto mt-10 max-w-[920px]"
                        >
                          <CreedPreview sections={composedSections} />
                        </motion.div>
                      </AnimatedBlock>
                    </div>
                  ) : null}
                </StepFrame>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3">
          <div>
            {step === 0 && !claiming ? (
              <button
                type="button"
                onClick={() => router.push("/home")}
                className="inline-flex items-center gap-2 text-sm text-[var(--creed-text-secondary)] transition-colors duration-150 hover:text-[var(--creed-text-primary)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            ) : step > 0 && !claiming ? (
              <button
                type="button"
                onClick={() => setStep((current) => current - 1)}
                className="inline-flex items-center gap-2 text-sm text-[var(--creed-text-secondary)] transition-colors duration-150 hover:text-[var(--creed-text-primary)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            ) : null}
          </div>

          {step < TOTAL_STEPS - 1 ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-[12px] text-[var(--creed-text-tertiary)] md:inline">
                ↵ to continue
              </span>
              <Button
                style={{ borderRadius: "0.875rem" }}
                className="bg-[var(--creed-text-primary)] px-5 text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)] disabled:bg-[var(--creed-border-strong)] disabled:text-[var(--creed-text-tertiary)]"
                onClick={handleContinue}
                disabled={
                  claiming ||
                  pasteSubmitting ||
                  (step === PASTE_STEP && !pasted.trim())
                }
              >
                {claiming ? "Saving" : pasteSubmitting ? "Composing" : "Continue"}
                {claiming || pasteSubmitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRightIcon className="h-4 w-4" size={16} />
                )}
              </Button>
            </div>
          ) : paid ? (
            <Button
              style={{ borderRadius: "0.875rem" }}
              className="bg-[var(--creed-text-primary)] px-5 text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]"
              onClick={handleFinish}
            >
              Go to my Creed
              <ArrowRightIcon className="h-4 w-4" size={16} />
            </Button>
          ) : (
            // Subscription-first: a single low-friction monthly checkout. Yearly
            // and lifetime are chosen later on /pricing or in the billing dialog.
            <Button
              style={{ borderRadius: "0.875rem" }}
              className="bg-[var(--creed-text-primary)] px-5 text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)] disabled:bg-[var(--creed-border-strong)] disabled:text-[var(--creed-text-tertiary)]"
              onClick={() => void startCheckout({ plan: "personal", cadence: "monthly" })}
              disabled={checkoutSubmitting}
            >
              {checkoutSubmitting ? "Starting" : "Start for $12/mo"}
              {checkoutSubmitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightIcon className="h-4 w-4" size={16} />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepFrame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("mx-auto w-full", wide ? "max-w-5xl" : "max-w-3xl")}>
      {children}
    </div>
  );
}

function OnboardingStep({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div>
      <AnimatedHeadline
        text={title}
        className="t-section text-[var(--creed-text-primary)]"
      />
      <p className="t-lede mt-4 max-w-2xl text-[var(--creed-text-tertiary)]">
        {subtitle}
      </p>
      <div className="mt-9 space-y-6">{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Welcome constellation: the AI agents you already use, drawn in a rough
// circle and pulsing into the one file at the centre. Mounts fresh each time
// step 0 renders (AnimatePresence keys on step), so the draw-in replays on
// every visit. Lines and chips animate in; a dot travels each line inward.
// ──────────────────────────────────────────────────────────────────

const CONSTELLATION_NODES: { kind: AgentIconKind; x: number; y: number }[] = [
  { kind: "chatgpt", x: 50, y: 9 },
  { kind: "claude", x: 79, y: 17 },
  { kind: "codex", x: 91, y: 45 },
  { kind: "cursor", x: 83, y: 76 },
  { kind: "grok", x: 58, y: 92 },
  { kind: "claudecode", x: 39, y: 90 },
  { kind: "opencode", x: 13, y: 74 },
  { kind: "openclaw", x: 8, y: 43 },
  { kind: "hermes", x: 24, y: 16 },
];

// The central Creed hub uses Codex's blue (#0066FF) so the one file reads as
// another node in the constellation, just the one everything points at.
const CREED_BLUE = "#0066FF";

function WelcomeConstellation() {
  const accent = accentColorMap.identity;

  return (
    <div className="relative mx-auto mt-10 aspect-square w-full max-w-[400px]">
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-hidden="true"
      >
        {CONSTELLATION_NODES.map((node, index) => (
          <motion.line
            key={`line-${node.kind}`}
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
        {CONSTELLATION_NODES.map((node, index) => (
          <motion.circle
            key={`pulse-${node.kind}`}
            r={1.15}
            fill={accent}
            initial={{ cx: node.x, cy: node.y, opacity: 0 }}
            animate={{
              cx: [node.x, (node.x + 50) / 2, 50],
              cy: [node.y, (node.y + 50) / 2, 50],
              opacity: [0, 0.9, 0],
            }}
            transition={{
              duration: 1.9,
              delay: 1 + index * 0.12,
              repeat: Infinity,
              repeatDelay: 0.5,
              ease: "easeInOut",
            }}
          />
        ))}
      </svg>

      {CONSTELLATION_NODES.map((node, index) => (
        <div
          key={`chip-${node.kind}`}
          className="absolute z-10"
          style={{ left: `${node.x}%`, top: `${node.y}%`, transform: "translate(-50%, -50%)" }}
        >
          <motion.div
            className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--creed-border)] bg-[var(--creed-surface)]"
            initial={{ opacity: 0, scale: 0.55 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.35 + index * 0.05, ease: [0.22, 1, 0.36, 1] }}
          >
            <IntegrationGlyph
              kind={node.kind}
              framed={false}
              className="h-7 w-7"
              assetClassName="h-7 w-7"
            />
          </motion.div>
        </div>
      ))}

      <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="relative flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: CREED_BLUE }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/brand/logo.svg"
              alt="Creed"
              className="h-8 w-auto select-none"
              style={{ filter: "brightness(0) invert(1)" }}
              draggable={false}
            />
            <motion.span
              className="absolute inset-0 rounded-full border"
              style={{ borderColor: CREED_BLUE }}
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

// ──────────────────────────────────────────────────────────────────
// Explainer A: the five core sections assembling into one file.
// ──────────────────────────────────────────────────────────────────

// The five core sections, each given a distinct hue so the teaching visual
// spans the colour wheel (violet, orange, green, blue, rose) instead of leaning
// blue. These are illustrative accents for the explainer, not the section's
// fixed accent.
const STRIP_ROWS: { name: string; accent: keyof typeof accentColorMap }[] = [
  { name: "Identity", accent: "identity" },
  { name: "Goals", accent: "projects" },
  { name: "Work", accent: "operating-principles" },
  { name: "Preferences", accent: "stack" },
  { name: "Routines", accent: "rose" },
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
          <span
            className="mt-0.5 h-9 w-[3px] shrink-0 rounded-full"
            style={{ backgroundColor: accentColorMap[row.accent] }}
          />
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
// Explainer B: an agent proposal landing as a diff the user approves.
// Mirrors the real InlineProposalDiff chrome (agent attribution row, the
// blue Accept button, and the word-level diff body) so the teaching card
// matches what they will actually see in the editor.
// ──────────────────────────────────────────────────────────────────

const PROPOSAL_EXISTING = "Run a half-marathon at some point.";
const PROPOSAL_PROPOSED = "Run a half-marathon under 1h45 by spring.";

function ProposalCard() {
  const parts = useMemo(() => computeDiffParts(PROPOSAL_EXISTING, PROPOSAL_PROPOSED), []);
  const stats = useMemo(() => summarizeDiff(parts), [parts]);

  return (
    <motion.div
      className="mx-auto mt-10 max-w-[520px] rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] text-left shadow-[0_8px_24px_rgba(28,28,26,0.04)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-[var(--creed-text-secondary)]">
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)]" />
          <AgentIconStack agents={["Claude"]} variant="inline" itemClassName="h-5 w-5" maxVisible={1} />
          <span className="font-medium text-[var(--creed-text-primary)]">Claude</span>
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
// Explainer C: the Creed as a plain markdown file the user owns and can
// export anywhere. Headings tinted by section accent, body in mono, with a
// filename and export affordance so it reads as a real, portable file.
// ──────────────────────────────────────────────────────────────────

const OWNERSHIP_LINES: { heading: string; accent: keyof typeof accentColorMap; body: string }[] = [
  {
    heading: "## Identity",
    accent: "identity",
    body: "Founder and engineer. Direct, allergic to fluff.",
  },
  {
    heading: "## Goals",
    accent: "projects",
    body: "Ship Creed v2 this quarter. $20k MRR by summer.",
  },
  {
    heading: "## Preferences",
    accent: "stack",
    body: "Lead with the answer. No preambles, no over-praise.",
  },
  {
    heading: "## Constraints",
    accent: "boundaries",
    body: "Never assume scope. Ask before touching prod.",
  },
];

function OwnershipCard() {
  return (
    <motion.div
      className="mx-auto mt-10 max-w-[440px] overflow-hidden rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] text-left shadow-[0_8px_24px_rgba(28,28,26,0.04)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-between border-b border-[var(--creed-border)] px-4 py-2.5">
        <div className="flex items-center gap-2 text-[12px] text-[var(--creed-text-secondary)]">
          <FileText className="h-3.5 w-3.5 text-[var(--creed-text-tertiary)]" />
          <span className="font-mono">creed.md</span>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[var(--creed-text-secondary)]">
          <Download className="h-3.5 w-3.5 text-[var(--creed-text-tertiary)]" />
          <span className="font-mono">Export</span>
        </div>
      </div>
      <div className="px-4 py-4 font-mono text-[13px] leading-6">
        {OWNERSHIP_LINES.map((line, index) => (
          <motion.div
            key={line.heading}
            className={cn(index > 0 && "mt-4")}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.3 + index * 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <div style={{ color: accentColorMap[line.accent] }}>{line.heading}</div>
            <div className="text-[var(--creed-text-secondary)]">{line.body}</div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function AnimatedHeadline({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  // Split into lines, then per line into words, then per word into glyphs.
  // Word spans use `whitespace-nowrap` so they wrap as units (responsive),
  // while glyphs inside still animate individually - same blur-in motion as
  // the landing-hero headline.
  const lines = useMemo(() => text.split("\n"), [text]);

  return (
    <motion.h1
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: 0.042,
          },
        },
      }}
      className={cn("flex flex-wrap", className)}
    >
      {lines.map((line, lineIndex) => {
        const words = line.split(" ");
        return (
          <span key={`${line}-${lineIndex}`} className="basis-full">
            {words.map((word, wordIndex) => (
              <span
                key={`${word}-${lineIndex}-${wordIndex}`}
                className="inline-block whitespace-nowrap align-baseline"
              >
                {splitPreservingLigatures(word).map((glyph, glyphIndex) => (
                  <motion.span
                    key={`${glyph}-${lineIndex}-${wordIndex}-${glyphIndex}`}
                    variants={{
                      hidden: { opacity: 0, filter: "blur(10px)", y: 10 },
                      visible: { opacity: 1, filter: "blur(0px)", y: 0 },
                    }}
                    transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
                    className="inline-block whitespace-pre"
                  >
                    {glyph}
                  </motion.span>
                ))}
                {wordIndex < words.length - 1 ? (
                  <motion.span
                    variants={{
                      hidden: { opacity: 0, filter: "blur(10px)", y: 10 },
                      visible: { opacity: 1, filter: "blur(0px)", y: 0 },
                    }}
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

function AnimatedBlock({
  children,
  index,
}: {
  children: ReactNode;
  index: number;
}) {
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

function CreedPreview({ sections }: { sections: CreedSection[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--creed-border)] bg-[var(--creed-surface)] text-left">
      <div className="md:h-[520px] md:overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto max-w-[920px] px-6 py-8 md:px-10">
          <div className="space-y-10">
            {sections.map((section) => (
              <section key={section.id} className="group relative">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-block h-9 w-[3px] rounded-full"
                        style={{ backgroundColor: accentColorMap[section.accent] }}
                      />
                      <div className="flex min-w-0 flex-wrap items-center gap-3">
                        <span
                          className="text-[15px] font-medium leading-none md:text-[16px]"
                          style={{ color: accentColorMap[section.accent] }}
                        >
                          {section.name}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <RichTextEditor
                    sectionId={section.id}
                    content={section.content}
                    readOnly
                    accentColor={accentColorMap[section.accent]}
                    onChange={() => {}}
                  />
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
