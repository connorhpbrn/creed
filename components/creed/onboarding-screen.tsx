"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import DOMPurify from "isomorphic-dompurify";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Gift, LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/arrow-right";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CreedWordmark } from "@/components/creed/brand";
import { SearchableSelect } from "@/components/creed/searchable-select";
import { loadSettingsAiModels, loadSettingsAiSettings } from "@/components/creed/settings-preload";
import {
  AI_MODEL_CATALOG,
  AI_MODEL_QUALITY_META,
  DEFAULT_AI_MODEL_ID,
  formatModelCost,
  type AiModelCatalogItem,
} from "@/lib/ai/model-catalog";
import { useCreed } from "@/components/creed/creed-provider";
import {
  accentColorMap,
  type CreedSection,
  type OnboardingState,
} from "@/lib/creed-data";
import { splitPreservingLigatures } from "@/lib/landing-text";
import {
  CREED_TYPE_OPTIONS,
  applyOnboardingRefinement,
  buildOnboardingPreviewSections,
  compileOnboardingDraft,
  getCreedTypeDefinition,
  type OnboardingPreviewDraft,
  type OnboardingRefinement,
} from "@/lib/onboarding/compile";
import { cn } from "@/lib/utils";

// 8-step flow indexed 0–7: vibe / identity / direction / tools /
// preferences / daily context / api key / preview. Each step picks an
// accent for the top progress bar so the colour subtly tracks where
// the user is in the flow.
const TOTAL_STEPS = 8;

const stepAccentMap = [
  accentColorMap.identity, // 0 vibe
  accentColorMap.identity, // 1 identity
  accentColorMap.projects, // 2 direction (goals + work)
  accentColorMap.tools, // 3 tools
  accentColorMap.preferences, // 4 preferences + constraints
  accentColorMap.workflows, // 5 daily context
  "#2563EB", // 6 api key
  accentColorMap.identity, // 7 preview
];

// Vibe accent colours: blue / green / orange / purple — matched to the
// 4 onboarding personas in CREED_TYPE_OPTIONS order.
const typeThemes: Record<OnboardingState["creedType"], { accent: string; tint: string }> = {
  personal: { accent: "#2563EB", tint: "#DBEAFE" }, // blue
  builder: { accent: "#059669", tint: "#D1FAE5" }, // green
  creative: { accent: "#EA580C", tint: "#FFEDD5" }, // orange
  custom: { accent: "#7C3AED", tint: "#EDE9FE" }, // purple
};

const defaultStepTitle = "Pick the closest vibe.";
const defaultStepSubtitle = "It only changes the question wording and examples.";

function bullets(items: string[]) {
  return `<ul class="creed-list creed-list-bullet">${items.map((text) => `<li>${text}</li>`).join("")}</ul>`;
}

function makeStarterSection(
  partial: Pick<CreedSection, "id" | "name" | "accent" | "content"> & {
    template?: CreedSection["template"];
    agentWritable?: boolean;
  }
): CreedSection {
  return {
    id: partial.id,
    kind: "rich-text",
    template: partial.template ?? "freeform",
    name: partial.name,
    accent: partial.accent,
    content: partial.content,
    // Pivot: every starter section is agent-writable so AI can keep the
    // profile accurate, polished, concise, and current.
    agentWritable: partial.agentWritable ?? true,
    lastEditedBy: "You",
    lastEditedType: "user",
    lastEditedLabel: "just now",
  };
}

// Used when the user skips onboarding — fills the file with the five core
// sections so they have something to edit immediately. Optional sections
// (Beliefs, Constraints, People, Health, Context) are added later via the
// section composer or by an agent's proposal.
const blankTemplateSections: CreedSection[] = [
  makeStarterSection({
    id: "identity",
    name: "Identity",
    accent: "identity",
    template: "identity",
    content:
      "<p>Use this section to give every AI a stable picture of who you are. Add the role, traits, and defaults that should follow you across every conversation.</p>",
  }),
  makeStarterSection({
    id: "goals",
    name: "Goals",
    accent: "projects",
    template: "focus",
    content:
      "<p>Note what you're working toward right now. Mix near-term outcomes with longer-horizon ambitions so AI can pull on the right thread.</p>",
  }),
  makeStarterSection({
    id: "work",
    name: "Work",
    accent: "tools",
    template: "freeform",
    content:
      "<p>What you do, the tools you reach for, and how you like to work. Add the surfaces AI should know you live in.</p>",
  }),
  makeStarterSection({
    id: "preferences",
    name: "Preferences",
    accent: "preferences",
    template: "principles",
    content: bullets([
      "Lead with the answer, then the supporting detail.",
      "Keep replies tight unless depth genuinely helps.",
      "Skip filler, hedging, and over-praise.",
    ]),
  }),
  makeStarterSection({
    id: "routines",
    name: "Routines",
    accent: "workflows",
    template: "principles",
    content: bullets([
      "Habits and rhythms an AI should respect when planning, scheduling, or following up.",
    ]),
  }),
];

const PREVIEW_ALLOWED_TAGS = [
  "blockquote",
  "br",
  "code",
  "em",
  "h2",
  "h3",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "ul",
];

function sanitizePreviewHtml(value: string) {
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: PREVIEW_ALLOWED_TAGS,
    ALLOWED_ATTR: ["class", "data-tag"],
    KEEP_CONTENT: true,
    USE_PROFILES: { html: true },
  });
}

export function OnboardingScreen() {
  const router = useRouter();
  const { state, updateOnboarding, resetOnboarding, claimOnboardingPreview } = useCreed();
  const [step, setStep] = useState(0);
  const [groupOther, setGroupOther] = useState<string | null>(null);
  const [groupOtherValue, setGroupOtherValue] = useState("");
  const [refinedDraft, setRefinedDraft] = useState<OnboardingPreviewDraft | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [selectedModelId, setSelectedModelId] = useState(DEFAULT_AI_MODEL_ID);
  const [aiModels, setAiModels] = useState<AiModelCatalogItem[]>(AI_MODEL_CATALOG);
  const [savedKeyLastFour, setSavedKeyLastFour] = useState<string | null>(null);
  const [apiKeyReady, setApiKeyReady] = useState(false);
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeyInvalid, setApiKeyInvalid] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const creedTypeDefinition = getCreedTypeDefinition(state.onboarding.creedType);
  const typeTheme = typeThemes[state.onboarding.creedType];
  const currentAccent =
    step === 0 || step === 1 || step === TOTAL_STEPS - 1 ? typeTheme.accent : stepAccentMap[step];
  const currentToolGroups = creedTypeDefinition.toolsGroups;
  const deterministicDraft = useMemo(
    () => compileOnboardingDraft(state.onboarding),
    [state.onboarding]
  );
  const previewDraft = refinedDraft ?? deterministicDraft;
  const previewSections = useMemo(
    () => buildOnboardingPreviewSections(previewDraft),
    [previewDraft]
  );

  useEffect(() => {
    if (state.sections.length > 0) {
      router.replace("/file");
    }
  }, [router, state.sections.length]);

  useEffect(() => {
    let cancelled = false;

    async function loadAiSettings() {
      try {
        const [settings, models] = await Promise.all([
          loadSettingsAiSettings(),
          loadSettingsAiModels(),
        ]);

        if (!cancelled) {
          setSelectedModelId(settings?.selectedModelId ?? DEFAULT_AI_MODEL_ID);
          setSavedKeyLastFour(settings?.keyLastFour ?? null);
          setApiKeyReady(Boolean(settings?.keyLastFour));
          if (models.length) {
            setAiModels(models);
          }
        }
      } catch {
        return;
      }
    }

    void loadAiSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  function toggleCommunicationStyle(
    option: "Direct" | "Collaborative" | "Thorough" | "Concise"
  ) {
    const current = state.onboarding.communicationStyle;
    const next = current.includes(option)
      ? current.filter((item) => item !== option)
      : [...current, option];

    updateOnboarding({
      communicationStyle: next,
    });
  }

  function updateStack(group: string, value: string) {
    const current = state.onboarding.stackSelections[group] ?? [];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];

    updateOnboarding({
      stackSelections: {
        ...state.onboarding.stackSelections,
        [group]: next,
      },
    });
  }

  function addGroupOther() {
    const next = groupOtherValue.trim();

    if (!groupOther || !next) {
      return;
    }

    const current = state.onboarding.stackSelections[groupOther] ?? [];
    if (current.some((item) => item.toLowerCase() === next.toLowerCase())) {
      setGroupOtherValue("");
      setGroupOther(null);
      return;
    }

    updateOnboarding({
      stackSelections: {
        ...state.onboarding.stackSelections,
        [groupOther]: [...current, next],
      },
    });
    setGroupOtherValue("");
    setGroupOther(null);
  }

  const handleContinue = useCallback(async () => {
    // Step 6 (API key + Generate) is the synthesizer step.
    if (step === 6) {
      if (!apiKeyReady) {
        setAiNotice("Save a valid OpenRouter API key to generate your Creed.");
        return;
      }

      setIsGenerating(true);
      setRefinedDraft(null);
      setAiNotice(null);

      try {
        const response = await fetch("/api/onboarding/synthesize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            onboarding: state.onboarding,
            draft: deterministicDraft,
          }),
        });
        const payload = (await response.json()) as {
          refinement?: OnboardingRefinement | null;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Could not generate Creed.");
        }

        if (payload.refinement && Object.keys(payload.refinement).length > 0) {
          setRefinedDraft(applyOnboardingRefinement(deterministicDraft, payload.refinement));
        }
        setStep(7);
      } catch (error) {
        setAiNotice(error instanceof Error ? error.message : "Could not generate Creed.");
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    setStep((current) => Math.min(current + 1, TOTAL_STEPS - 1));
  }, [apiKeyReady, deterministicDraft, state.onboarding, step]);

  async function handleSaveApiKey() {
    const trimmedKey = apiKeyDraft.trim();
    if (!trimmedKey && !savedKeyLastFour) {
      setApiKeyInvalid(true);
      return;
    }

    try {
      setApiKeySaving(true);
      setApiKeyInvalid(false);
      setAiNotice(null);
      const response = await fetch("/api/app/ai/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiKey: trimmedKey || undefined,
          modelId: selectedModelId,
        }),
      });
      const payload = (await response.json()) as {
        settings?: { keyLastFour?: string; selectedModelId?: string };
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Could not save API key.");
      }

      setSavedKeyLastFour(payload.settings?.keyLastFour ?? savedKeyLastFour);
      setSelectedModelId(payload.settings?.selectedModelId ?? selectedModelId);
      setApiKeyDraft("");
      setApiKeyReady(true);
      setApiKeyInvalid(false);
    } catch {
      setApiKeyReady(false);
      setApiKeyInvalid(true);
    } finally {
      setApiKeySaving(false);
    }
  }

  function handleRestart() {
    resetOnboarding();
    setRefinedDraft(null);
    setGroupOther(null);
    setGroupOtherValue("");
    setIsGenerating(false);
    setApiKeyReady(Boolean(savedKeyLastFour));
    setAiNotice(null);
    setStep(0);
  }

  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      if (step >= TOTAL_STEPS - 1 || isGenerating) {
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
  }, [isGenerating, step, handleContinue]);

  async function handleClaim() {
    await claimOnboardingPreview(previewSections);
    router.push("/file");
  }

  async function handleSkipOnboarding() {
    await claimOnboardingPreview(blankTemplateSections);
    router.push("/file");
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
          <CreedWordmark />
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
                <StepFrame
                  wide={step === 3 || step === TOTAL_STEPS - 1}
                  narrow={step === 0}
                >
                  {/* Step 0 — vibe picker */}
                  {step === 0 ? (
                    <OnboardingStep title={defaultStepTitle} subtitle={defaultStepSubtitle}>
                      <div className="grid gap-3 md:grid-cols-2">
                        {CREED_TYPE_OPTIONS.map((type, index) => {
                          const definition = getCreedTypeDefinition(type);
                          const theme = typeThemes[type];
                          const active = state.onboarding.creedType === type;

                          return (
                            <AnimatedBlock key={type} index={index}>
                              <button
                                type="button"
                                onClick={() => {
                                  setGroupOther(null);
                                  setGroupOtherValue("");
                                  setRefinedDraft(null);
                                  updateOnboarding({
                                    creedType: type,
                                    stackSelections: {},
                                  });
                                }}
                                className={cn(
                                  "h-full w-full rounded-[20px] border bg-[var(--creed-surface)] px-4 py-4 text-left transition-[border-color,background-color,box-shadow,transform] duration-150 focus:outline-none",
                                  active
                                    ? "text-[var(--creed-text-primary)]"
                                    : "border-[var(--creed-border)] bg-[var(--creed-surface)] hover:border-[var(--creed-border-strong)] hover:bg-[var(--creed-surface-raised)]"
                                )}
                                style={
                                  active
                                    ? {
                                        borderColor: theme.accent,
                                        background: `linear-gradient(135deg, ${theme.accent}1A 0%, ${theme.accent}26 100%)`,
                                        boxShadow: `0 0 0 1px ${theme.accent} inset`,
                                      }
                                    : undefined
                                }
                              >
                                <div
                                  className="text-[15px] font-medium text-[var(--creed-text-primary)]"
                                  style={active ? { color: theme.accent } : undefined}
                                >
                                  {definition.label}
                                </div>
                                <div
                                  className="mt-2 text-[13px] leading-6 text-[var(--creed-text-secondary)]"
                                  style={active ? { color: theme.accent } : undefined}
                                >
                                  {definition.description}
                                </div>
                              </button>
                            </AnimatedBlock>
                          );
                        })}
                      </div>
                    </OnboardingStep>
                  ) : null}

                  {/* Step 1 — Identity */}
                  {step === 1 ? (
                    <OnboardingStep
                      title={creedTypeDefinition.startTitle}
                      subtitle={creedTypeDefinition.startSubtitle}
                    >
                      <AnimatedBlock index={0}>
                        <FieldLabel>{creedTypeDefinition.roleLabel}</FieldLabel>
                        <Input
                          value={state.onboarding.role}
                          onChange={(event) => updateOnboarding({ role: event.target.value })}
                          className="h-13 rounded-2xl border-[var(--creed-border)] px-4 text-[17px]"
                          placeholder={creedTypeDefinition.rolePlaceholder}
                        />
                      </AnimatedBlock>
                      <AnimatedBlock index={1}>
                        <FieldLabel>{creedTypeDefinition.alwaysKnowLabel}</FieldLabel>
                        <Textarea
                          value={state.onboarding.workingWithYou}
                          onChange={(event) =>
                            updateOnboarding({ workingWithYou: event.target.value })
                          }
                          className="min-h-28 rounded-2xl border-[var(--creed-border)] px-4 py-4 text-[15px] leading-7"
                          placeholder={creedTypeDefinition.alwaysKnowPlaceholder}
                        />
                      </AnimatedBlock>
                    </OnboardingStep>
                  ) : null}

                  {/* Step 2 — Direction (Goals + Work) */}
                  {step === 2 ? (
                    <OnboardingStep
                      title="Where you're headed."
                      subtitle="Goals AI should pull on, and the kind of work you do."
                    >
                      <AnimatedBlock index={0}>
                        <FieldLabel>{creedTypeDefinition.goalsLabel}</FieldLabel>
                        <Textarea
                          value={state.onboarding.currentProject}
                          onChange={(event) =>
                            updateOnboarding({ currentProject: event.target.value })
                          }
                          className="min-h-32 rounded-2xl border-[var(--creed-border)] px-4 py-4 text-[15px] leading-7"
                          placeholder={creedTypeDefinition.goalsPlaceholder}
                        />
                      </AnimatedBlock>
                      <AnimatedBlock index={1}>
                        <FieldLabel>{creedTypeDefinition.workLabel}</FieldLabel>
                        <Textarea
                          value={state.onboarding.work}
                          onChange={(event) =>
                            updateOnboarding({ work: event.target.value })
                          }
                          className="min-h-28 rounded-2xl border-[var(--creed-border)] px-4 py-4 text-[15px] leading-7"
                          placeholder={creedTypeDefinition.workPlaceholder}
                        />
                      </AnimatedBlock>
                    </OnboardingStep>
                  ) : null}

                  {/* Step 3 — Tools */}
                  {step === 3 ? (
                    <OnboardingStep
                      title={creedTypeDefinition.toolsTitle}
                      subtitle={creedTypeDefinition.toolsSubtitle}
                    >
                      <AnimatedBlock index={0}>
                        <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                          {Object.entries(currentToolGroups).map(([group, items], index) => (
                            <div key={group}>
                              <FieldLabel>{group}</FieldLabel>
                              {(() => {
                                const predefinedItems = items as readonly string[];
                                const renderedItems = [
                                  ...predefinedItems,
                                  ...(state.onboarding.stackSelections[group] ?? []).filter(
                                    (item) => !predefinedItems.includes(item)
                                  ),
                                ];

                                return (
                                  <div className="flex flex-wrap gap-2">
                                    <AnimatePresence initial={false} mode="popLayout">
                                      {renderedItems.map((item) => (
                                        <motion.div
                                          key={item}
                                          layout="position"
                                          initial={{ opacity: 0, scale: 0.92 }}
                                          animate={{ opacity: 1, scale: 1 }}
                                          exit={{ opacity: 0, scale: 0.92 }}
                                          transition={{
                                            layout: {
                                              type: "spring",
                                              stiffness: 420,
                                              damping: 34,
                                              mass: 0.7,
                                            },
                                            opacity: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
                                            scale: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
                                          }}
                                        >
                                          <PillButton
                                            active={state.onboarding.stackSelections[group]?.includes(
                                              item
                                            )}
                                            accent={accentColorMap.tools}
                                            small
                                            onClick={() => updateStack(group, item)}
                                          >
                                            {item}
                                          </PillButton>
                                        </motion.div>
                                      ))}
                                    </AnimatePresence>
                                    <motion.button
                                      type="button"
                                      layout="position"
                                      transition={{
                                        layout: {
                                          type: "spring",
                                          stiffness: 420,
                                          damping: 34,
                                          mass: 0.7,
                                        },
                                      }}
                                      className="rounded-xl border border-dashed border-[var(--creed-border-strong)] px-3 py-1.5 text-[13px] text-[var(--creed-text-secondary)] transition-colors duration-150 hover:border-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)] focus:outline-none"
                                      onClick={() => {
                                        setGroupOther(group);
                                        setGroupOtherValue("");
                                      }}
                                    >
                                      Other
                                    </motion.button>
                                  </div>
                                );
                              })()}
                              <AnimatePresence initial={false}>
                                {groupOther === group ? (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{
                                      height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
                                      opacity: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
                                    }}
                                    className="overflow-hidden"
                                  >
                                    <div className="mt-3 rounded-2xl p-1">
                                      <Input
                                        data-disable-continue="true"
                                        value={groupOtherValue}
                                        className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)]"
                                        placeholder={`e.g. Add another ${group.toLowerCase()} tool`}
                                        onChange={(event) => setGroupOtherValue(event.target.value)}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter" && !event.shiftKey) {
                                            event.preventDefault();
                                            addGroupOther();
                                          }
                                        }}
                                      />
                                    </div>
                                  </motion.div>
                                ) : null}
                              </AnimatePresence>
                              {/* Preserve `index` for the React reconciler */}
                              <span hidden>{index}</span>
                            </div>
                          ))}
                        </div>
                      </AnimatedBlock>
                    </OnboardingStep>
                  ) : null}

                  {/* Step 4 — Preferences + Constraints */}
                  {step === 4 ? (
                    <OnboardingStep
                      title={creedTypeDefinition.defaultsTitle}
                      subtitle={creedTypeDefinition.defaultsSubtitle}
                    >
                      <AnimatedBlock index={0}>
                        <FieldLabel>How do you want AI to act?</FieldLabel>
                        <div className="flex flex-wrap gap-2.5">
                          {["Direct", "Collaborative", "Thorough", "Concise"].map((option) => (
                            <PillButton
                              key={option}
                              active={state.onboarding.communicationStyle.includes(
                                option as "Direct" | "Collaborative" | "Thorough" | "Concise"
                              )}
                              accent={typeTheme.accent}
                              onClick={() =>
                                toggleCommunicationStyle(
                                  option as "Direct" | "Collaborative" | "Thorough" | "Concise"
                                )
                              }
                            >
                              {option}
                            </PillButton>
                          ))}
                        </div>
                      </AnimatedBlock>
                      <AnimatedBlock index={1}>
                        <FieldLabel>What annoys you about AI replies?</FieldLabel>
                        <Textarea
                          value={state.onboarding.annoyances}
                          onChange={(event) => updateOnboarding({ annoyances: event.target.value })}
                          className="min-h-24 rounded-2xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 py-4 text-[15px] leading-7"
                          placeholder="e.g. Long preambles, generic advice, over-praise, unnecessary disclaimers."
                        />
                      </AnimatedBlock>
                      <AnimatedBlock index={2}>
                        <FieldLabel>Anything you never want AI to do? <span className="ml-2 text-[var(--creed-text-tertiary)]">Optional</span></FieldLabel>
                        <Textarea
                          value={state.onboarding.constraints}
                          onChange={(event) => updateOnboarding({ constraints: event.target.value })}
                          className="min-h-24 rounded-2xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 py-4 text-[15px] leading-7"
                          placeholder="e.g. Don't make assumptions about my work without checking. Don't surface political takes unprompted."
                        />
                      </AnimatedBlock>
                    </OnboardingStep>
                  ) : null}

                  {/* Step 5 — Daily Context (single optional textarea) */}
                  {step === 5 ? (
                    <OnboardingStep
                      title="Your daily context."
                      subtitle="Routines, people, health notes, beliefs."
                    >
                      <AnimatedBlock index={0}>
                        <Textarea
                          value={state.onboarding.context}
                          onChange={(event) => updateOnboarding({ context: event.target.value })}
                          className="min-h-[280px] rounded-2xl border-[var(--creed-border)] px-4 py-4 text-[15px] leading-7"
                          placeholder={
                            "e.g. Wake at 7, deep work mornings, no meetings before 11. Live in Berlin, three timezones from most collaborators. Maya is my co-founder. Vegetarian, migraine-prone when low on sleep. Long-term thinking over quick wins."
                          }
                        />
                      </AnimatedBlock>
                    </OnboardingStep>
                  ) : null}

                  {/* Step 6 — API key + generate */}
                  {step === 6 ? (
                    isGenerating ? (
                      <GeneratingState />
                    ) : (
                      <OnboardingStep
                        title="Connect your API key."
                        subtitle="Used to polish your initial profile and power AI features."
                      >
                        <AnimatedBlock index={0}>
                          <FieldLabel>OpenRouter API key</FieldLabel>
                          <Input
                            data-disable-continue="true"
                            type="password"
                            value={apiKeyDraft}
                            onChange={(event) => {
                              setApiKeyDraft(event.target.value);
                              setApiKeyReady(false);
                              setApiKeyInvalid(false);
                              setAiNotice(null);
                            }}
                            className="h-13 rounded-2xl border-[var(--creed-border)] px-4 text-[15px]"
                            placeholder={
                              savedKeyLastFour
                                ? `Saved key ending in ${savedKeyLastFour}`
                                : "sk-or-..."
                            }
                          />
                        </AnimatedBlock>
                        <AnimatedBlock index={1}>
                          <FieldLabel>Model</FieldLabel>
                          <ModelSelect
                            value={selectedModelId}
                            onChange={(modelId) => {
                              setSelectedModelId(modelId);
                              setApiKeyReady(false);
                              setApiKeyInvalid(false);
                            }}
                            models={aiModels}
                          />
                        </AnimatedBlock>
                        <AnimatedBlock index={2}>
                          <Button
                            type="button"
                            style={{ borderRadius: "0.875rem" }}
                            className={cn(
                              "px-4 transition-colors",
                              apiKeyInvalid
                                ? "bg-[#DC2626] text-white hover:bg-[#B91C1C]"
                                : apiKeyReady
                                  ? "bg-[var(--creed-surface-raised)] text-[var(--creed-text-tertiary)] cursor-default"
                                  : "bg-[var(--creed-text-primary)] text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]"
                            )}
                            onClick={() => {
                              if (apiKeyReady && !apiKeyInvalid) return;
                              void handleSaveApiKey();
                            }}
                            disabled={apiKeySaving || apiKeyReady}
                          >
                            {apiKeySaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                            {apiKeyInvalid ? "Invalid" : apiKeyReady ? "Saved" : "Save API key"}
                          </Button>
                          {aiNotice ? (
                            <p className="mt-3 text-[13px] text-[#B91C1C]">{aiNotice}</p>
                          ) : null}
                        </AnimatedBlock>
                      </OnboardingStep>
                    )
                  ) : null}

                  {/* Step 7 — Preview + Claim */}
                  {step === TOTAL_STEPS - 1 ? (
                    <div className="text-center">
                      <AnimatedBlock index={0}>
                        <AnimatedHeadline
                          text="Your profile is ready."
                          className="t-section justify-center text-[var(--creed-text-primary)]"
                        />
                      </AnimatedBlock>
                      <AnimatedBlock index={1}>
                        <p className="t-lede mx-auto mt-6 max-w-2xl text-[var(--creed-text-tertiary)]">
                          Connect your first agent and it will pick up this profile automatically.
                        </p>
                      </AnimatedBlock>

                      <AnimatedBlock index={2}>
                        <motion.div
                          initial={{ opacity: 0, y: 18, scale: 0.985, filter: "blur(10px)" }}
                          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                          className="mx-auto mt-10 max-w-[920px]"
                        >
                          <CreedPreview sections={previewSections} />
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
            {step === 0 && !isGenerating ? (
              <button
                type="button"
                onClick={() => void handleSkipOnboarding()}
                className="inline-flex items-center gap-2 text-sm text-[var(--creed-text-secondary)] transition-colors duration-150 hover:text-[var(--creed-text-primary)]"
              >
                Skip
              </button>
            ) : step === 6 ? (
              <button
                type="button"
                onClick={() => setStep((current) => current - 1)}
                className="inline-flex items-center gap-2 text-sm text-[var(--creed-text-secondary)] transition-colors duration-150 hover:text-[var(--creed-text-primary)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            ) : step === TOTAL_STEPS - 1 ? (
              <button
                type="button"
                onClick={handleRestart}
                className="inline-flex items-center gap-2 text-sm text-[var(--creed-text-secondary)] transition-colors duration-150 hover:text-[var(--creed-text-primary)]"
              >
                <RotateCcw className="h-4 w-4" />
                Restart
              </button>
            ) : step > 0 && !isGenerating ? (
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
                disabled={isGenerating || (step === 6 && !apiKeyReady)}
              >
                {step === 6 ? (isGenerating ? "Generating" : "Generate") : "Continue"}
                {step === 6 ? (
                  isGenerating ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRightIcon className="h-4 w-4" size={16} />
                  )
                ) : (
                  <ArrowRightIcon className="h-4 w-4" size={16} />
                )}
              </Button>
            </div>
          ) : (
            <Button
              style={{ borderRadius: "0.875rem" }}
              className="bg-[var(--creed-text-primary)] px-5 text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]"
              onClick={() => void handleClaim()}
            >
              Claim
              <Gift className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepFrame({
  children,
  wide = false,
  narrow = false,
}: {
  children: ReactNode;
  wide?: boolean;
  narrow?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full",
        narrow ? "max-w-2xl" : wide ? "max-w-5xl" : "max-w-3xl"
      )}
    >
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

function ModelSelect({
  value,
  onChange,
  models,
}: {
  value: string;
  onChange: (value: string) => void;
  models: AiModelCatalogItem[];
}) {
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      placeholder="Choose a model"
      searchPlaceholder="Search models..."
      triggerClassName="h-13 rounded-2xl px-4 text-[15px]"
      options={models.map((model) => ({
        key: model.id,
        value: model.id,
        label: model.name,
        description: `${model.provider} · ${AI_MODEL_QUALITY_META[model.quality].label} · ${formatModelCost(model)}`,
        search: `${model.name} ${model.provider} ${model.id} ${AI_MODEL_QUALITY_META[model.quality].label}`,
      }))}
      renderOption={(option) => {
        const model = models.find((item) => item.id === option.value) ?? models[0];
        const quality = AI_MODEL_QUALITY_META[model.quality];

        return (
          <div className="flex min-w-0 items-center gap-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: quality.color }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium text-[var(--creed-text-primary)]">
                {model.name}
              </div>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--creed-text-secondary)]">
                <span>{model.provider}</span>
                <span>·</span>
                <span>{quality.label}</span>
                <span>·</span>
                <span>{formatModelCost(model)}</span>
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}

// Loading screen shown while the AI synthesizer is running. Intentionally
// chrome-free: no card, no border, no background swap. A small ring of
// "thinking" lines cycles through with a smooth crossfade so the user
// has something to read while OpenRouter does its thing.
const GENERATING_LINES = [
  "Reading what you wrote.",
  "Inferring the parts you didn't say.",
  "Tightening every sentence.",
  "Trimming anything generic.",
  "Sorting out the routines from the rituals.",
  "Putting the contradictions on a sticky note.",
  "Choosing your defaults.",
  "Polishing the rough edges.",
  "Making it sound like you.",
  "Checking nothing reads like a horoscope.",
  "Arranging it in the right order.",
  "Almost there.",
];

function GeneratingState() {
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLineIndex((current) => (current + 1) % GENERATING_LINES.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="t-section text-[var(--creed-text-primary)]">
        Building your profile.
      </h1>

      <div className="relative h-7 w-full max-w-md">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={lineIndex}
            initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 text-[15px] leading-7 text-[var(--creed-text-tertiary)]"
          >
            {GENERATING_LINES[lineIndex]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
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
  // while glyphs inside still animate individually — same blur-in motion as
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
                    transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
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
                    transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
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

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 text-[13px] font-medium text-[var(--creed-text-secondary)]">
      {children}
    </div>
  );
}

function PillButton({
  active,
  accent,
  small = false,
  onClick,
  children,
}: {
  active?: boolean;
  accent: string;
  small?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={cn(
        "border bg-[var(--creed-surface)] font-medium outline-none transition-colors focus:outline-none focus-visible:outline-none",
        small ? "rounded-lg px-3 py-1.5 text-[13px]" : "rounded-xl px-4 py-2 text-[14px]",
        active
          ? ""
          : "border-[var(--creed-border)] text-[var(--creed-text-secondary)] hover:border-[var(--creed-border-strong)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
      )}
      style={
        active
          ? {
              borderColor: accent,
              color: accent,
              background: `linear-gradient(135deg, ${accent}1A 0%, ${accent}26 100%)`,
              boxShadow: `0 0 0 1px ${accent} inset`,
            }
          : undefined
      }
    >
      {children}
    </motion.button>
  );
}

function CreedPreview({ sections }: { sections: CreedSection[] }) {
  return (
    <div className="overflow-hidden rounded-[14px] bg-[var(--creed-surface)] text-left shadow-[0_30px_90px_rgba(17,17,13,0.08)]">
      <div className="creed-scrollbar md:h-[520px] md:overflow-y-auto">
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

                <div
                  className="text-[15px] leading-8 text-[var(--creed-text-secondary)] [&_h2]:mb-3 [&_h2]:font-heading [&_h2]:text-[1.32rem] [&_h2]:font-medium [&_h2]:tracking-[-0.03em] [&_h2]:text-[var(--creed-text-primary)] [&_h3]:mb-2 [&_h3]:font-heading [&_h3]:text-[1.08rem] [&_h3]:tracking-[-0.02em] [&_h3]:text-[var(--creed-text-primary)] [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:font-sans [&_ul]:text-[14px] [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_ol]:font-sans [&_ol]:text-[14px] [&_li]:text-[var(--creed-text-primary)] [&_blockquote]:rounded-r-[14px] [&_blockquote]:bg-[var(--creed-surface-raised)] [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:font-sans [&_blockquote]:text-[14px]"
                  dangerouslySetInnerHTML={{ __html: sanitizePreviewHtml(section.content) }}
                />
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
