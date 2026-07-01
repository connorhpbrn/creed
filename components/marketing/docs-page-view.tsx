"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { AnimatedPageTitle, AnimatedSectionHeading } from "@/components/marketing/animated-page-title";
import { IntegrationGlyph } from "@/components/creed/brand";
import { MarketingFooter, MarketingHeroBanner } from "@/components/marketing/site-chrome";
import { useOpenSections } from "@/components/marketing/use-open-sections";
import { AnimatedIconButton } from "@/components/creed/animated-icon-action";
import { AnimatedCheckmark } from "@/components/ui/animated-checkmark";
import { CopyIcon } from "@/components/ui/copy";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type DocsSection = {
  id: string;
  label: string;
  group: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

type SectionGuide = {
  title: string;
  belongs: string[];
  avoid: string[];
};

type ExampleGroup = {
  title: string;
  good: string[];
  bad: string[];
};

type AgentGlyph =
  | "claude"
  | "chatgpt"
  | "grok"
  | "whirl"
  | "openclaw"
  | "hermes"
  | "claudecode"
  | "codex"
  | "opencode"
  | "cursor"
  | "custom";

type AgentCard = {
  name: string;
  glyph: AgentGlyph;
  blurb: string;
};

type LoopStep = {
  step: string;
  title: string;
  body: string;
};

type AnatomyEntry = {
  name: string;
  color: string;
  blurb: string;
};

type QualityPractice = {
  name: string;
  test: string;
};

type ToolGroup = {
  title: string;
  tools: { name: string; description: string }[];
};

type ReferenceItem = {
  kind: string;
  name: string;
  description: string;
};

type HttpEndpoint = {
  method: string;
  path: string;
  summary: string;
  detail: string;
};

const sections: DocsSection[] = [
  {
    id: "overview",
    label: "Overview",
    group: "Start here",
    title: "What Creed is",
    paragraphs: [
      "Creed is your personal context profile. One file that captures who you are: values, goals, work, preferences, constraints, people, health, routines. Any AI you talk to knows you instantly instead of starting from zero every conversation.",
      "It is not a journal, scratchpad, or chat log. The value comes from keeping the profile concise, current, and specific enough that every section actually changes how AI replies to you.",
      "It works the same whether you write code all day or never touch a terminal. The structure is identical for everyone; only the examples shift to match how you work.",
    ],
  },
  {
    id: "how-it-works",
    label: "How it works",
    group: "Start here",
    title: "How Creed works",
    paragraphs: [
      "Creed runs on a simple loop: you write yourself down once, connected agents read that file before they answer you, and they propose small updates as they learn. You approve the good ones and the profile sharpens over time.",
    ],
  },
  {
    id: "anatomy",
    label: "What goes in a Creed",
    group: "Start here",
    title: "What goes in a Creed",
    paragraphs: [
      "A Creed has ten sections: five always-on core sections everyone fills in, and five optional ones that appear only once you use them. The whole thing is plain Markdown, sized to read end to end in under a minute.",
      "Aim for specific over complete. A short profile that changes how AI replies beats a long one that reads like a resume.",
    ],
  },
  {
    id: "connect-mcp",
    label: "Connecting over MCP",
    group: "Connect your agents",
    title: "Connecting over MCP",
    paragraphs: [
      "Creed MCP uses OAuth, so there is nothing to copy. You add the Creed server URL to your agent as a custom MCP connector; the agent opens a browser, you click Allow on the Creed consent screen while signed in to creed.md, and it stays connected. The exact URL is on your Connections page (https://creed.md/mcp on the hosted app).",
      "After connecting, the agent reads Creed once to confirm access, then reads it before meaningful work and proposes narrow updates as it learns. You should not need a second setup prompt.",
    ],
    bullets: [
      "Connect from the Connections page: copy the server URL, or use the per-agent command or one-click button.",
      "The first time the agent calls Creed it runs the OAuth flow and opens a browser. Approve while signed in to creed.md. Tokens refresh automatically after that.",
      "Verify by listing the MCP tools and calling read_creed once. Do not claim connected unless read_creed succeeds.",
      "Update sections with the flat creed_* tools. The server applies the edit directly or as a proposal based on each section's permission; get_write_policy reports what's allowed.",
      "If anything is unclear during setup, read https://creed.md/docs once and follow it.",
    ],
  },
  {
    id: "troubleshooting",
    label: "Troubleshooting",
    group: "Connect your agents",
    title: "Troubleshooting the connection",
    paragraphs: [
      "Almost every connection issue is the OAuth step. These cover the common ones.",
    ],
    bullets: [
      "No browser popup: re-run the agent's connect or auth action (/mcp in Claude Code, codex mcp login creed, opencode mcp auth creed). It opens your default browser.",
      "Stuck on sign-in: authorize while signed in to creed.md in that browser. Signed out, the consent screen signs you in first, then returns to Allow.",
      "401 or 'unauthorized' from the MCP endpoint: the client isn't authorized yet or the token expired. Reconnect or re-run the auth step to get a fresh token.",
      "An old connection stopped working: Creed moved from static tokens to OAuth. Remove the old server entry, re-add it by URL, and authorize again.",
      "Registration fails on connect: make sure the client supports OAuth-based remote MCP (Claude, Cursor, Codex, OpenCode, ChatGPT connectors all do).",
      "You must have an active, set-up Creed to authorize. Finish onboarding first if the consent screen asks you to.",
    ],
  },
  {
    id: "agents-chatbots",
    label: "Chatbots",
    group: "Agent guides",
    title: "Chatbots",
    paragraphs: [
      "Connect Creed to the assistants you chat with. Each one reads your profile before it answers and can propose updates you approve.",
    ],
  },
  {
    id: "agents-assistants",
    label: "Assistant agents",
    group: "Agent guides",
    title: "Assistant agents",
    paragraphs: [
      "Long-running assistants can keep your profile current on their own. Point them at Creed and let them review it on a cadence you trust.",
    ],
  },
  {
    id: "agents-coding",
    label: "Coding agents",
    group: "Agent guides",
    title: "Coding agents",
    paragraphs: [
      "Coding agents read Creed before they plan or write, so they match your stack, your conventions, and how you like to work.",
    ],
  },
  {
    id: "agents-custom",
    label: "Custom agents",
    group: "Agent guides",
    title: "Custom agents",
    paragraphs: [
      "Anything that speaks MCP connects from the server URL over OAuth. Clients that can't speak MCP use the HTTP API instead.",
    ],
  },
  {
    id: "how-agents-should-use-creed",
    label: "How AI uses Creed",
    group: "How agents use Creed",
    title: "How AI should use Creed",
    paragraphs: [
      "Connected agents read Creed before answering you, let it shape how they reply, and propose narrow updates as they learn new things about you. You approve the good ones and the profile sharpens over time.",
    ],
    bullets: [
      "Read the visible profile before answering, planning, recommending, or scheduling anything.",
      "Anchor tone, defaults, and assumptions to what the profile already says about you.",
      "Respect constraints and routines without being asked to repeat them.",
      "When something new is learned about the user, propose a small focused update to the right section.",
      "Keep the profile concise. Propose tightening or pruning when a section is stale or bloated.",
      "Never use Creed as a session log, mood tracker, or place for things only true today.",
    ],
  },
  {
    id: "when-to-propose",
    label: "When to propose",
    group: "How agents use Creed",
    title: "When to propose",
    paragraphs: [
      "Propose an update when you learn something durable about the user, something that would change how a future AI should reply to them, not just a one-time mood or task. The test is: would this make every next AI conversation better?",
      "Most bad proposals are not wrong, they are noisy. If something does not change how a future AI should treat the user, it should not be in the profile.",
    ],
  },
  {
    id: "how-each-section-works",
    label: "How each section works",
    group: "How agents use Creed",
    title: "How each section works",
    paragraphs: [
      "Each section captures a different kind of context about the user. Good agents aim updates at the section that best matches what they learned instead of dumping everything into one bucket.",
    ],
  },
  {
    id: "good-and-bad-proposal-examples",
    label: "Good vs bad examples",
    group: "How agents use Creed",
    title: "Good and bad proposal examples",
    paragraphs: [
      "Examples are often more useful than abstract rules. These are the kinds of updates Creed should accept and the kinds it should keep out.",
    ],
  },
  {
    id: "maintaining",
    label: "Keeping it current",
    group: "How agents use Creed",
    title: "Keeping your profile current",
    paragraphs: [
      "When you finish helping the user with something real, ask: did I learn something durable about them? Did anything in the profile look stale or wrong? Only then decide whether to propose an update.",
    ],
  },
  {
    id: "per-section-permissions",
    label: "Per-section permissions",
    group: "Keep it sharp",
    title: "Per-section permissions",
    paragraphs: [
      "Each section sets its own agent permission, so you can keep part of your profile reference-only and let agents maintain the rest. The mechanics differ per section, but the standard stays the same: only durable, profile-worthy context belongs in the file.",
    ],
    bullets: [
      "Propose is the default reviewed path. Agents suggest updates and you decide what enters the section.",
      "Direct lets a trusted agent edit that section immediately, with the same restraint it would bring to a proposal.",
      "Read-only keeps a section visible to agents for context but blocks edits and proposals.",
      "Hidden removes a section from the agent's view entirely, so it never reaches a connected tool.",
      "Permissions are per-section and enforced on the server. The bar for what belongs does not move.",
    ],
  },
  {
    id: "quality",
    label: "Quality scoring",
    group: "Keep it sharp",
    title: "How Creed measures quality",
    paragraphs: [
      "Creed can score how good your profile is, section by section, and surface where to sharpen it. Quality analysis runs on a monthly AI allowance included with your plan, with prepaid top-ups when you need more, or on your own OpenRouter key at cost.",
      "It judges how context is written, never what it is about. A section on work and a section on LEGO are held to the same bar. The only question is whether it helps the next AI know you better.",
    ],
  },
  {
    id: "mcp-tools",
    label: "MCP tools",
    group: "Reference",
    title: "MCP tools, prompts, and resources",
    paragraphs: [
      "Once connected, an agent has a focused set of tools for reading and improving your Creed. The flat creed_ tools are the recommended path: each one applies your change directly when that section allows direct edits, or files it as a proposal when approval is on. You never pick the mode; the server does, and every call reports what happened.",
    ],
  },
  {
    id: "http-api",
    label: "HTTP API",
    group: "Reference",
    title: "HTTP API",
    paragraphs: [
      "MCP is the supported way to connect, and it handles authorization for you. For clients that can't speak MCP, the same capabilities are available over a small HTTP API. Each request sends a bearer token in the Authorization header.",
    ],
  },
  {
    id: "data-and-privacy",
    label: "Your data and privacy",
    group: "Reference",
    title: "Your data and privacy",
    paragraphs: [
      "Creed is built so the file stays yours: portable, encrypted, and only ever visible to you.",
    ],
    bullets: [
      "One file, plain Markdown. It stays portable, and you can push or pull it to your own GitHub repo from Settings.",
      "Your call on AI spend. AI features run on a monthly allowance of prepaid credits, or on your own OpenRouter key. Your context is only ever sent to the model to run the feature you asked for.",
      "Secrets are encrypted. API keys and connection tokens are stored with AES-256-GCM, never in plain text.",
      "You only ever see your own data. Every table is row-level secured per user.",
      "Hidden sections never leave the app. Set a section to hidden and it is dropped from the agent payload entirely.",
      "Deletion means deletion. Removing your file or your account wipes the data.",
    ],
  },
];

const loopSteps: LoopStep[] = [
  {
    step: "1",
    title: "Write it once",
    body: "Onboarding turns a few answers into a first draft. You shape it into a profile you would be happy to read out loud.",
  },
  {
    step: "2",
    title: "Agents read it",
    body: "Every connected agent reads your Creed before it answers, so it starts knowing your role, goals, and preferences instead of guessing.",
  },
  {
    step: "3",
    title: "Agents propose",
    body: "As an agent learns something durable about you, it proposes a small, focused update to the right section.",
  },
  {
    step: "4",
    title: "You approve",
    body: "You accept the good proposals and skip the rest. The profile sharpens over time without you maintaining it by hand.",
  },
];

const anatomyCore: AnatomyEntry[] = [
  { name: "Identity", color: "#7C3AED", blurb: "Role, defining traits, values, and the defaults that follow you everywhere." },
  { name: "Goals", color: "#EA580C", blurb: "Live priorities, near-term outcomes and longer-horizon aims." },
  { name: "Work", color: "#0284C7", blurb: "What you do, the tools you reach for, and how you like to work." },
  { name: "Preferences", color: "#0E7490", blurb: "Reply-style defaults with concrete do and avoid signals." },
  { name: "Routines", color: "#4F46E5", blurb: "Daily, weekly, and seasonal rhythms AI should respect." },
];

const anatomyOptional: AnatomyEntry[] = [
  { name: "Beliefs", color: "#059669", blurb: "Stable values and worldview that change how AI reasons or recommends." },
  { name: "Constraints", color: "#DC2626", blurb: "Hard noes, sensitive topics, and actions that need explicit permission." },
  { name: "People", color: "#E11D48", blurb: "Named relationships AI should remember and treat consistently." },
  { name: "Health", color: "#65A30D", blurb: "Conditions, accessibility needs, and dietary patterns to accommodate." },
  { name: "Context", color: "#6B7280", blurb: "Durable catch-all: location, life stage, environment, background facts." },
];

const exampleCreed = `## Identity
Product designer turned solo founder. I value clarity over cleverness
and ship small, polished things. Default to plain language; I dislike jargon.

## Goals
- Launch the v1 private beta by the end of Q3.
- Reach 1,000 weekly active users before raising.

## Preferences
- Lead with the answer, then the reasoning. Skip "great question" preambles.
- Push back when I'm wrong instead of agreeing politely.

## Routines
- Deep-work mornings, 8 to 12, no calls. Schedule meetings after lunch.
- Sleep 11pm to 7am. Don't suggest tasks past 10pm.`;

const perClientIntro =
  "Every MCP client connects from the same server URL. These are the per-client steps; each one ends with a browser approval.";

const perClientSteps: string[] = [
  "Claude Code: run claude mcp add -t http creed https://creed.md/mcp, then /mcp to authorize in the browser.",
  "Codex: run codex mcp add creed --url https://creed.md/mcp, then codex mcp login creed to authorize.",
  "Cursor: use the one-click Add MCP button on the Connections page, then authorize in the browser.",
  "OpenCode: add Creed to opencode.json as a remote server (type remote, the server URL), then run opencode mcp auth creed to authorize.",
  "ChatGPT and other MCP chatbots: add a custom connector with the server URL and approve in the browser.",
  "Any other MCP client: add the server URL as a custom or remote MCP server and approve when prompted. Non-MCP clients can fall back to the HTTP read API.",
];

const proposeWhen: string[] = [
  "Propose new identity facts, values, or defaults that should follow the user across every AI.",
  "Propose preference changes when the user clearly signals a new style they want by default.",
  "Propose Goals updates when a near-term outcome shifts or completes. Keep them concrete and current.",
  "Propose Routines, People, or Health updates when AI should account for them in future replies.",
  "Propose tightening or removing a section when it has gone stale, vague, or contradicted itself.",
];

const proposeNot: string[] = [
  "Do not propose session summaries, mood updates, or diary-style entries.",
  "Do not propose generic personality praise (curious, driven, thoughtful) without a concrete anchor.",
  "Do not propose one-off task instructions or things only true for the next hour.",
  "Do not ask the user what to add. Either propose something durable or do nothing.",
];

const afterWorkBullets: string[] = [
  "Ask whether you learned something durable enough to help every future AI conversation.",
  "Check whether any section now reads as stale, vague, duplicated, or contradicted.",
  "Prefer one sharp refinement or prune over several loose additions.",
  "If yes, propose it proactively without asking what to propose.",
  "If no, do nothing and leave Creed unchanged.",
  "If you spot a problem in the profile itself, propose the fix and flag it clearly.",
];

const recurringIntro: string[] = [
  "The best Creed setups also revisit the file on a cadence. A small recurring review compares the profile with what's actually true now, sharpens what belongs, and prunes what's gone stale.",
  "Recurring maintenance should improve quality, not volume. The goal is to keep the profile concise and current.",
];

const recurringBullets: string[] = [
  "Run a recurring check when an agent has enough autonomy to review the profile without micromanagement.",
  "Look for goals that shipped, routines that changed, or context that no longer fits.",
  "Tighten generic phrasing into concrete defaults grounded in real examples.",
  "Prefer pruning and merging over constant appending.",
  "If nothing has changed, do nothing.",
];

const qualityPractices: QualityPractice[] = [
  { name: "Specific", test: "Names real things: tools, people, numbers, dates, defaults. Not language anyone could have written." },
  { name: "Anchored", test: "Claims carry an example, a rule, or a consequence, so AI knows how to act, not just what is true." },
  { name: "Steering", test: "It would actually change how AI replies. The most important test." },
  { name: "Current", test: "Nothing stale, abandoned, or self-contradicting." },
  { name: "Tight", test: "No padding or repetition. Every line earns its place." },
];

const overallRules: string[] = [
  "The five core sections are the backbone. A flawless core alone tops out around 90.",
  "Every well-written optional or custom section lifts the score toward 100, with diminishing returns.",
  "A weak optional section never drags the total down. Trying new context is never punished.",
  "If a core section is nearly empty, the whole file is capped at 70.",
];

const toolGroups: ToolGroup[] = [
  {
    title: "Read and inspect",
    tools: [
      { name: "read_creed", description: "Read the full profile plus the private agent contract." },
      { name: "list_sections", description: "List sections with their ids, names, and accents." },
      { name: "creed_get_section", description: "Fetch one section by id or name, with its content and metadata." },
      { name: "creed_search", description: "Find where a fact lives without reading the whole profile." },
      { name: "creed_get_recent_activity", description: "See recent changes so agents avoid duplicate proposals." },
      { name: "creed_get_quality_report", description: "Read the latest quality report to target the weakest sections." },
      { name: "get_write_policy", description: "Check the current write mode and what edits are allowed." },
    ],
  },
  {
    title: "Edit content",
    tools: [
      { name: "creed_update_section", description: "Replace a section's body. Params: sectionId, contentMarkdown." },
      { name: "creed_append_to_section", description: "Add to a section without rewriting it. Params: sectionId, contentMarkdown." },
    ],
  },
  {
    title: "Manage sections",
    tools: [
      { name: "creed_create_section", description: "Add a new section. Params: name, contentMarkdown, optional accent." },
      { name: "creed_delete_section", description: "Remove a section. Params: sectionId." },
      { name: "creed_rename_section", description: "Rename a section. Params: sectionId, name." },
      { name: "creed_recolor_section", description: "Change a section's accent. Params: sectionId, accent." },
      { name: "creed_reorder_section", description: "Move a section. Params: sectionId, then afterSectionId or position." },
    ],
  },
];

const referenceItems: ReferenceItem[] = [
  {
    kind: "Prompt",
    name: "introduce-me",
    description: "Read my Creed and introduce me the way a sharp collaborator would.",
  },
  {
    kind: "Prompt",
    name: "tighten-my-creed",
    description: "Review my Creed and propose tightening or pruning where it has drifted.",
  },
  {
    kind: "Resource",
    name: "creed://profile",
    description: "Your current profile, exposed as a readable MCP resource.",
  },
];

const httpEndpoints: HttpEndpoint[] = [
  {
    method: "GET",
    path: "/api/creed",
    summary: "Read the profile.",
    detail: "Returns the visible Markdown plus the hidden agent contract as plain text. Up to 120 requests per minute.",
  },
  {
    method: "POST",
    path: "/api/creed/proposals",
    summary: "Submit a proposal.",
    detail: "JSON body with the target section, draft, and reason. Works in every mode. Up to 60 per minute.",
  },
  {
    method: "POST",
    path: "/api/creed/write",
    summary: "Apply a direct edit.",
    detail: "JSON body with an operation and its payload. Succeeds only for sections set to direct edit. Up to 60 per minute.",
  },
];

const sectionGuides: SectionGuide[] = [
  {
    title: "Identity",
    belongs: [
      "Concrete role, defining traits, values, and defaults that make the user distinct.",
      "Anchors AI should hang every reply on: voice, taste, what they care about.",
    ],
    avoid: [
      "Bio-style life history.",
      "Generic personality words without a real example behind them.",
    ],
  },
  {
    title: "Beliefs",
    belongs: [
      "Stable values or worldview that should change how AI reasons or recommends.",
      "Convictions that explain why the user prefers certain trade-offs.",
    ],
    avoid: [
      "Platitudes or motivational quotes.",
      "Things the user has not actually committed to.",
    ],
  },
  {
    title: "Goals",
    belongs: [
      "Live priorities: near-term outcomes and longer-horizon aims.",
      "Concrete targets with stale-by hints when timing matters.",
    ],
    avoid: [
      "Vague intentions like 'grow' or 'be better'.",
      "Goals that shipped or were abandoned without being updated.",
    ],
  },
  {
    title: "Work",
    belongs: [
      "What the user does, the tools and stack they use, and how they like to work.",
      "Real surfaces, methods, collaborators, and craft details AI should know.",
    ],
    avoid: [
      "Exhaustive resume-style history.",
      "One-off project notes that belong in Goals or Context.",
    ],
  },
  {
    title: "Preferences",
    belongs: [
      "Specific reply-style defaults: length, tone, formatting, follow-up behavior.",
      "Concrete do/avoid rules AI should apply by default.",
    ],
    avoid: [
      "Generic 'be helpful' or 'be honest' filler.",
      "Momentary tone requests from one chat.",
    ],
  },
  {
    title: "Constraints",
    belongs: [
      "Hard noes, sensitive topics, and actions that need explicit permission.",
      "Lines AI should not cross even if the user seems to ask in the moment.",
    ],
    avoid: [
      "Temporary dislikes.",
      "Vague fears that do not give AI a concrete rule.",
    ],
  },
  {
    title: "People",
    belongs: [
      "Named relationships: who they are, why they matter, what AI should remember.",
      "Family, partners, collaborators, and pets that come up in conversation.",
    ],
    avoid: [
      "Casual mentions of strangers.",
      "Sensitive details the user has not explicitly chosen to share.",
    ],
  },
  {
    title: "Health",
    belongs: [
      "Conditions, sensitivities, dietary patterns, and accessibility needs, paired with how AI should accommodate them.",
      "Durable physical or mental health context that should shape suggestions.",
    ],
    avoid: [
      "One-off symptoms or short-term illnesses.",
      "Diagnoses without any guidance for how AI should respond.",
    ],
  },
  {
    title: "Routines",
    belongs: [
      "Daily, weekly, and seasonal rhythms AI should respect when planning or scheduling.",
      "Working hours, sleep windows, deep-work blocks, recurring commitments.",
    ],
    avoid: [
      "Today's todo list.",
      "Routines the user has clearly stopped following.",
    ],
  },
  {
    title: "Context",
    belongs: [
      "Durable catch-all details that don't fit elsewhere: location, life stage, environment.",
      "Background facts AI should know but that aren't preferences, goals, or constraints.",
    ],
    avoid: [
      "Mood updates or session recap.",
      "Long open-question lists that belong in your own notes.",
    ],
  },
];

const exampleGroups: ExampleGroup[] = [
  {
    title: "Goals",
    good: [
      "Ship Creed v1 to public launch by end of June; current focus is onboarding polish.",
      "Move to Lisbon in Q4. Researching neighborhoods and visa paths now.",
    ],
    bad: [
      "Be more productive this year.",
      "Worked on the landing page for three hours today.",
    ],
  },
  {
    title: "Preferences",
    good: [
      "Default to concise replies. No preamble, no recap of what I just said.",
      "Push back when I'm wrong instead of agreeing politely.",
    ],
    bad: [
      "Be helpful and friendly.",
      "Use a professional tone unless I say otherwise today.",
    ],
  },
  {
    title: "Routines",
    good: [
      "Deep-work mornings 8 to 12, no calls. Schedule meetings after lunch.",
      "Sleep window 11pm–7am, don't suggest tasks past 10pm.",
    ],
    bad: [
      "Tries to be productive every day.",
      "Started a new gym schedule this week, will see how it goes.",
    ],
  },
  {
    title: "Health",
    good: [
      "Lactose intolerant. Suggest dairy-free alternatives in any recipe.",
      "ADHD. Break long plans into short steps and surface one next action at a time.",
    ],
    bad: [
      "Generally healthy.",
      "Had a headache this afternoon.",
    ],
  },
  {
    title: "People",
    good: [
      "Maya: partner, designer, prefers we make travel decisions together.",
      "Jonas: co-founder, handles ops, default to him for legal and finance questions.",
    ],
    bad: [
      "Met someone interesting at a conference last week.",
      "Friend group is great.",
    ],
  },
];

const agentCardsBySection: Record<string, AgentCard[]> = {
  "agents-chatbots": [
    {
      name: "Claude",
      glyph: "claude",
      blurb:
        "Add Creed as a connector in Claude. It reads your profile before replying and proposes refinements as it learns about you.",
    },
    {
      name: "ChatGPT",
      glyph: "chatgpt",
      blurb:
        "Add Creed as a connector. ChatGPT picks up your context at the start of a chat and can suggest updates you approve in Creed.",
    },
    {
      name: "Grok",
      glyph: "grok",
      blurb:
        "Connect Creed in Grok so it starts every chat with your context and suggests refinements as it learns.",
    },
    {
      name: "Whirl",
      glyph: "whirl",
      blurb:
        "Connect Creed in Whirl so it answers with your context from the first message and proposes updates over time.",
    },
  ],
  "agents-assistants": [
    {
      name: "OpenClaw",
      glyph: "openclaw",
      blurb:
        "Set up a recurring background task that re-reads your profile, compares it against recent conversations, and proposes only durable refinements.",
    },
    {
      name: "Hermes",
      glyph: "hermes",
      blurb:
        "Keep Creed in a stable bootstrap path and use scheduled scripts to revisit durable context on a cadence you trust.",
    },
  ],
  "agents-coding": [
    {
      name: "Claude Code",
      glyph: "claudecode",
      blurb:
        "Connect with one claude mcp add command, then /mcp to authorize. Pair it with a recurring reminder to revisit the profile after meaningful work.",
    },
    {
      name: "Codex",
      glyph: "codex",
      blurb:
        "Add Creed with codex mcp add, then codex mcp login. Schedule a periodic review that proposes tightening when goals or preferences shift.",
    },
    {
      name: "OpenCode",
      glyph: "opencode",
      blurb:
        "Add Creed as a remote server in opencode.json, then opencode mcp auth creed. Reference it from your bootstrap instructions to keep it current.",
    },
    {
      name: "Cursor",
      glyph: "cursor",
      blurb:
        "Use the one-click Add MCP button on Connections, then authorize. Creed shapes Cursor's answers around how you actually work.",
    },
  ],
  "agents-custom": [
    {
      name: "Custom agent",
      glyph: "custom",
      blurb:
        "Build recurring profile review into your own workflow with cron, queues, or whatever your stack already uses.",
    },
  ],
};

const navItems = sections.map(({ id, label }) => ({ id, label }));

const navGroups = (() => {
  const order: string[] = [];
  const map = new Map<string, { id: string; label: string }[]>();
  for (const section of sections) {
    if (!map.has(section.group)) {
      map.set(section.group, []);
      order.push(section.group);
    }
    map.get(section.group)!.push({ id: section.id, label: section.label });
  }
  return order.map((group) => ({ group, items: map.get(group)! }));
})();

const sectionGroupById = new Map(sections.map((section) => [section.id, section.group]));

function MonoCode({ children }: { children: ReactNode }) {
  return (
    <code
      className="rounded-[6px] bg-[var(--creed-surface-raised)] px-1.5 py-0.5 text-[13px] text-[var(--creed-text-primary)]"
      style={{ fontFamily: "var(--font-mono), monospace" }}
    >
      {children}
    </code>
  );
}

function FileBlock({ label, children }: { label: string; children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-6 overflow-hidden rounded-[16px] border border-[var(--creed-border)] bg-[var(--creed-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--creed-border)] py-2 pl-4 pr-2">
        <span className="text-[0.8rem] font-medium text-[var(--creed-text-secondary)]">
          {label}
        </span>
        <AnimatedIconButton
          icon={CopyIcon}
          iconSize={14}
          iconClassName="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none"
          showIcon={!copied}
          variant="ghost"
          size="sm"
          className="text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
          onClick={() => {
            void navigator.clipboard?.writeText(children).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            });
          }}
        >
          {copied ? (
            <>
              <AnimatedCheckmark className="h-3.5 w-3.5" size={14} />
              Copied
            </>
          ) : (
            "Copy"
          )}
        </AnimatedIconButton>
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-[13px] leading-7 text-[var(--creed-text-secondary)]">
        <code style={{ fontFamily: "var(--font-mono), monospace" }}>{children}</code>
      </pre>
    </div>
  );
}

export function DocsPageView() {
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState(navItems[0]?.id ?? "overview");
  // One group open at a time so the long docs nav stays compact.
  const { isOpen, toggle } = useOpenSections(navGroups.map((group) => group.group), 1);

  const activeGroup = sectionGroupById.get(activeSection);

  // While a click-driven smooth scroll is in flight, the scrollspy is locked so
  // the highlight jumps straight to the clicked item instead of ticking through
  // every section the scroll passes on the way.
  const lockedRef = useRef(false);
  const unlockTimerRef = useRef<number | null>(null);

  const sectionIds = useMemo(() => navItems.map((section) => section.id), []);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const sectionElements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (!sectionElements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Ignore the scrollspy while a click-driven scroll is animating, so the
        // clicked item stays highlighted instead of ticking through neighbors.
        if (lockedRef.current) return;
        // Pick the topmost section intersecting the detection band, not the one
        // with the highest ratio. Sections vary wildly in height (e.g. "How
        // each section works" is very tall), and a ratio-based pick lets a
        // short neighbor win even when the tall section is the one at the top.
        const topmost = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

        if (topmost?.target?.id) {
          setActiveSection(topmost.target.id);
        }
      },
      {
        rootMargin: "-96px 0px -65% 0px",
        threshold: 0,
      }
    );

    sectionElements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [sectionIds]);

  function scrollToSection(sectionId: string) {
    const target = document.getElementById(sectionId);
    if (!target) return;

    // Highlight the clicked item immediately and lock the scrollspy so the blue
    // marker lands on it directly, then unlock once the smooth scroll settles.
    setActiveSection(sectionId);
    lockedRef.current = true;
    if (unlockTimerRef.current) window.clearTimeout(unlockTimerRef.current);

    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${sectionId}`);

    const unlock = () => {
      lockedRef.current = false;
      window.removeEventListener("scrollend", unlock);
      if (unlockTimerRef.current) {
        window.clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
    };
    // `scrollend` fires when the smooth scroll finishes (Chromium/Firefox); the
    // timeout is a fallback for browsers that don't support it.
    window.addEventListener("scrollend", unlock, { once: true });
    unlockTimerRef.current = window.setTimeout(unlock, 1200);
  }

  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <MarketingHeroBanner configured scrolled={scrolled} />

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-8 md:px-10 md:pb-24 md:pt-10">
        <div className="border-b border-[var(--creed-border)] pb-8">
          <AnimatedPageTitle
            text="Docs"
            className="t-section text-[var(--creed-text-primary)]"
          />
          <p className="mt-5 max-w-5xl text-[17px] leading-8 text-[var(--creed-text-secondary)] md:text-[18px]">
            What Creed is, what goes in it, how to connect your agents, how they read and improve it, and the full tool and API reference.
          </p>
        </div>

        {/* Below the desktop sidebar breakpoint, the same collapsible dropdown
            nav as desktop (one group open at a time, click to scroll), but
            without the scrollspy highlight: a sidebar that isn't on screen
            while you scroll has nothing to highlight, so the links stay plain. */}
        <div className="mt-8 block lg:hidden">
          <div className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--creed-text-primary)]">On this page</div>
          <nav className="mt-5 space-y-1">
            {navGroups.map((group) => {
              const open = isOpen(group.group);
              return (
                <div key={group.group}>
                  <button
                    type="button"
                    onClick={() => toggle(group.group)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-2 py-1.5 text-[15px] font-medium text-[var(--creed-text-primary)] transition-opacity hover:opacity-70"
                  >
                    <span>{group.group}</span>
                    <ChevronDown
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 transition-transform duration-200",
                        open ? "" : "-rotate-90"
                      )}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {open ? (
                      <motion.div
                        key="items"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="mb-3 mt-1 space-y-3">
                          {group.items.map((section) => (
                            <a
                              key={section.id}
                              href={`#${section.id}`}
                              onClick={(event) => {
                                event.preventDefault();
                                scrollToSection(section.id);
                              }}
                              className="block text-[14px] leading-6 text-[var(--creed-text-secondary)] transition-colors hover:text-[var(--creed-text-primary)]"
                            >
                              {section.label}
                            </a>
                          ))}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>
        </div>

        <div className="mt-10 grid gap-14 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-20">
          <aside className="hidden lg:block">
            <div className="sticky top-8 pb-10">
              <div className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--creed-text-primary)]">
                On this page
              </div>
              <nav className="mt-5 space-y-1">
                {navGroups.map((group) => {
                  const open = isOpen(group.group);
                  const isActiveGroup = group.group === activeGroup;
                  return (
                    <div key={group.group}>
                      <button
                        type="button"
                        onClick={() => toggle(group.group)}
                        aria-expanded={open}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 py-1.5 text-[15px] font-medium transition-opacity hover:opacity-70",
                          isActiveGroup ? "text-[#2563EB]" : "text-[var(--creed-text-primary)]"
                        )}
                      >
                        <span>{group.group}</span>
                        <ChevronDown
                          className={cn(
                            "h-[18px] w-[18px] shrink-0 transition-transform duration-200",
                            open ? "" : "-rotate-90"
                          )}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {open ? (
                          <motion.div
                            key="items"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="mb-3 mt-1 space-y-3">
                              {group.items.map((section) => (
                                <a
                                  key={section.id}
                                  href={`#${section.id}`}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    scrollToSection(section.id);
                                  }}
                                  className={cn(
                                    "block text-[14px] leading-6 transition-colors",
                                    activeSection === section.id
                                      ? "font-medium text-[#2563EB]"
                                      : "text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
                                  )}
                                >
                                  {section.label}
                                </a>
                              ))}
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </nav>
            </div>
          </aside>

          <div className="min-w-0">
            {sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                className={cn(
                  "scroll-mt-28 py-8 md:py-10",
                  index === sections.length - 1 ? "" : "border-b border-[var(--creed-border)]"
                )}
              >
                <AnimatedSectionHeading text={section.title} className="t-step" />

                {section.paragraphs ? (
                  <div className="mt-5 space-y-4 text-[15px] leading-8 text-[var(--creed-text-secondary)] md:text-[16px]">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                ) : null}

                {section.bullets ? (
                  <ul className="creed-bullets mt-5 space-y-3 text-[15px] leading-8 text-[var(--creed-text-secondary)] [--creed-bullet:#2563EB] md:text-[16px]">
                    {section.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}

                {section.id === "how-it-works" ? (
                  <>
                    <div className="mt-8 grid gap-4 md:grid-cols-2">
                      {loopSteps.map((loopStep) => (
                        <div key={loopStep.step} className="rounded-[20px] bg-[var(--creed-surface)] p-5">
                          <div className="flex items-center gap-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#2563EB] text-[13px] font-medium text-[var(--creed-surface)]">
                              {loopStep.step}
                            </span>
                            <div className="text-[16px] font-medium text-[var(--creed-text-primary)]">
                              {loopStep.title}
                            </div>
                          </div>
                          <p className="mt-3 text-[15px] leading-7 text-[var(--creed-text-secondary)] md:text-[16px]">
                            {loopStep.body}
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-6 text-[15px] leading-8 text-[var(--creed-text-secondary)] md:text-[16px]">
                      You stay in control of every change. Trusted agents can be granted direct-edit access per
                      section; everything else stays a proposal you approve.
                    </p>
                  </>
                ) : null}

                {section.id === "anatomy" ? (
                  <>
                    <div className="mt-8 grid gap-8 md:grid-cols-2">
                      <div>
                        <div className="text-[12px] font-medium tracking-[0.02em] text-[#2563EB]">
                          Always on
                        </div>
                        <div className="mt-4 space-y-4">
                          {anatomyCore.map((entry) => (
                            <div key={entry.name} className="flex items-start gap-3">
                              <span
                                aria-hidden
                                className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-[3px]"
                                style={{ backgroundColor: entry.color }}
                              />
                              <div>
                                <div className="text-[15px] font-medium text-[var(--creed-text-primary)] md:text-[16px]">
                                  {entry.name}
                                </div>
                                <p className="mt-0.5 text-[14px] leading-7 text-[var(--creed-text-secondary)] md:text-[15px]">
                                  {entry.blurb}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[12px] font-medium tracking-[0.02em] text-[var(--creed-text-tertiary)]">
                          Optional, appears once used
                        </div>
                        <div className="mt-4 space-y-4">
                          {anatomyOptional.map((entry) => (
                            <div key={entry.name} className="flex items-start gap-3">
                              <span
                                aria-hidden
                                className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-[3px]"
                                style={{ backgroundColor: entry.color }}
                              />
                              <div>
                                <div className="text-[15px] font-medium text-[var(--creed-text-primary)] md:text-[16px]">
                                  {entry.name}
                                </div>
                                <p className="mt-0.5 text-[14px] leading-7 text-[var(--creed-text-secondary)] md:text-[15px]">
                                  {entry.blurb}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <FileBlock label="creed.md">{exampleCreed}</FileBlock>
                  </>
                ) : null}

                {section.id === "connect-mcp" ? (
                  <div className="mt-8 border-t border-[var(--creed-border)] pt-6">
                    <h3 className="text-[18px] font-medium text-[var(--creed-text-primary)]">
                      Per-client steps
                    </h3>
                    <p className="mt-3 text-[15px] leading-8 text-[var(--creed-text-secondary)] md:text-[16px]">
                      {perClientIntro}
                    </p>
                    <ul className="creed-bullets mt-4 space-y-3 text-[15px] leading-8 text-[var(--creed-text-secondary)] [--creed-bullet:#2563EB] md:text-[16px]">
                      {perClientSteps.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {section.id.startsWith("agents-") && agentCardsBySection[section.id] ? (
                  <div className="mt-8 grid gap-4 md:grid-cols-2">
                    {agentCardsBySection[section.id].map((card) => (
                      <div key={card.name} className="rounded-[20px] bg-[var(--creed-surface)] p-5">
                        <div className="flex items-center gap-3">
                          <IntegrationGlyph
                            kind={card.glyph}
                            framed={false}
                            className="h-7 w-7 shrink-0"
                            assetClassName="h-7 w-7"
                          />
                          <div className="text-[16px] font-medium text-[var(--creed-text-primary)]">
                            {card.name}
                          </div>
                        </div>
                        <p className="mt-3 text-[15px] leading-7 text-[var(--creed-text-secondary)] md:text-[16px]">
                          {card.blurb}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {section.id === "how-agents-should-use-creed" ? (
                  <p className="mt-6 text-[15px] leading-8 text-[var(--creed-text-secondary)] md:text-[16px]">
                    Set this up from{" "}
                    <Link href="/connections" className="font-medium text-[#2563EB] hover:text-[#1D4ED8]">
                      Connections
                    </Link>
                    , then review proposed updates from the{" "}
                    <Link href="/file" className="font-medium text-[#2563EB] hover:text-[#1D4ED8]">
                      file view
                    </Link>
                    .
                  </p>
                ) : null}

                {section.id === "when-to-propose" ? (
                  <div className="mt-8 grid gap-6 md:grid-cols-2">
                    <div>
                      <div className="text-[12px] font-medium tracking-[0.02em] text-[#2563EB]">
                        Propose
                      </div>
                      <ul className="creed-bullets mt-3 space-y-2 text-[15px] leading-7 text-[var(--creed-text-secondary)] [--creed-bullet:#2563EB] md:text-[16px]">
                        {proposeWhen.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-[12px] font-medium tracking-[0.02em] text-[var(--creed-text-tertiary)]">
                        Don&apos;t propose
                      </div>
                      <ul className="creed-bullets mt-3 space-y-2 text-[15px] leading-7 text-[var(--creed-text-secondary)] [--creed-bullet:var(--creed-text-tertiary)] md:text-[16px]">
                        {proposeNot.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}

                {section.id === "how-each-section-works" ? (
                  <div className="mt-8 space-y-8">
                    {sectionGuides.map((guide) => (
                      <div key={guide.title} className="border-t border-[var(--creed-border)] pt-6 first:border-t-0 first:pt-0">
                        <h3 className="text-[18px] font-medium text-[var(--creed-text-primary)]">
                          {guide.title}
                        </h3>
                        <div className="mt-4 grid gap-6 md:grid-cols-2">
                          <div>
                            <div className="text-[12px] font-medium tracking-[0.02em] text-[#2563EB]">
                              What belongs
                            </div>
                            <ul className="creed-bullets mt-3 space-y-2 text-[15px] leading-7 text-[var(--creed-text-secondary)] [--creed-bullet:#2563EB] md:text-[16px]">
                              {guide.belongs.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <div className="text-[12px] font-medium tracking-[0.02em] text-[var(--creed-text-tertiary)]">
                              What to avoid
                            </div>
                            <ul className="creed-bullets mt-3 space-y-2 text-[15px] leading-7 text-[var(--creed-text-secondary)] [--creed-bullet:var(--creed-text-tertiary)] md:text-[16px]">
                              {guide.avoid.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {section.id === "good-and-bad-proposal-examples" ? (
                  <div className="mt-8 space-y-8">
                    {exampleGroups.map((group) => (
                      <div key={group.title} className="border-t border-[var(--creed-border)] pt-6 first:border-t-0 first:pt-0">
                        <h3 className="text-[18px] font-medium text-[var(--creed-text-primary)]">
                          {group.title}
                        </h3>
                        <div className="mt-4 grid gap-6 md:grid-cols-2">
                          <div>
                            <div className="text-[12px] font-medium tracking-[0.02em] text-[var(--creed-success)]">
                              Good
                            </div>
                            <ul className="mt-3 space-y-2 text-[15px] leading-7 text-[var(--creed-text-secondary)] md:text-[16px]">
                              {group.good.map((item) => (
                                <li key={item} className="flex items-start gap-2">
                                  <span
                                    aria-hidden
                                    className="mt-[3px] shrink-0 font-mono text-[14px] font-medium leading-6 text-[var(--creed-success)]"
                                  >
                                    +
                                  </span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <div className="text-[12px] font-medium tracking-[0.02em] text-[var(--creed-danger)]">
                              Bad
                            </div>
                            <ul className="mt-3 space-y-2 text-[15px] leading-7 text-[var(--creed-text-secondary)] md:text-[16px]">
                              {group.bad.map((item) => (
                                <li key={item} className="flex items-start gap-2">
                                  <span
                                    aria-hidden
                                    className="mt-[3px] shrink-0 font-mono text-[14px] font-medium leading-6 text-[var(--creed-danger)]"
                                  >
                                    −
                                  </span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {section.id === "maintaining" ? (
                  <>
                    <ul className="creed-bullets mt-5 space-y-3 text-[15px] leading-8 text-[var(--creed-text-secondary)] [--creed-bullet:#2563EB] md:text-[16px]">
                      {afterWorkBullets.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <div className="mt-8 border-t border-[var(--creed-border)] pt-6">
                      <h3 className="text-[18px] font-medium text-[var(--creed-text-primary)]">
                        On a recurring cadence
                      </h3>
                      <div className="mt-3 space-y-4 text-[15px] leading-8 text-[var(--creed-text-secondary)] md:text-[16px]">
                        {recurringIntro.map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                      </div>
                      <ul className="creed-bullets mt-4 space-y-3 text-[15px] leading-8 text-[var(--creed-text-secondary)] [--creed-bullet:#2563EB] md:text-[16px]">
                        {recurringBullets.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : null}

                {section.id === "quality" ? (
                  <>
                    <div className="mt-8 space-y-4">
                      <div className="text-[12px] font-medium tracking-[0.02em] text-[#2563EB]">
                        The five tests
                      </div>
                      {qualityPractices.map((practice) => (
                        <div
                          key={practice.name}
                          className="grid gap-1 border-t border-[var(--creed-border)] pt-4 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,140px)_minmax(0,1fr)] md:gap-6"
                        >
                          <div className="text-[15px] font-medium text-[var(--creed-text-primary)] md:text-[16px]">
                            {practice.name}
                          </div>
                          <p className="text-[15px] leading-7 text-[var(--creed-text-secondary)] md:text-[16px]">
                            {practice.test}
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-8 text-[15px] leading-8 text-[var(--creed-text-secondary)] md:text-[16px]">
                      The overall score is computed from the sections, not asked of the model, so the headline never
                      drifts from what it summarizes.
                    </p>
                    <ul className="creed-bullets mt-4 space-y-3 text-[15px] leading-8 text-[var(--creed-text-secondary)] [--creed-bullet:#2563EB] md:text-[16px]">
                      {overallRules.map((rule) => (
                        <li key={rule}>{rule}</li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {section.id === "mcp-tools" ? (
                  <>
                    <div className="mt-8 space-y-8">
                      {toolGroups.map((group) => (
                        <div key={group.title} className="border-t border-[var(--creed-border)] pt-6 first:border-t-0 first:pt-0">
                          <h3 className="text-[18px] font-medium text-[var(--creed-text-primary)]">
                            {group.title}
                          </h3>
                          <div className="mt-4 space-y-3">
                            {group.tools.map((tool) => (
                              <div
                                key={tool.name}
                                className="grid gap-1 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:gap-6"
                              >
                                <div>
                                  <MonoCode>{tool.name}</MonoCode>
                                </div>
                                <p className="text-[15px] leading-7 text-[var(--creed-text-secondary)] md:text-[16px]">
                                  {tool.description}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-8 text-[15px] leading-8 text-[var(--creed-text-secondary)] md:text-[16px]">
                      Two lower-level tools sit underneath these: <MonoCode>propose_creed_update</MonoCode> submits a
                      proposal in any mode, and <MonoCode>direct_edit_creed</MonoCode> applies a change immediately
                      where a section allows it (it stays hidden until at least one section is set to direct edit). The
                      flat tools above are built on them and are easier to call correctly.
                    </p>

                    <div className="mt-8 border-t border-[var(--creed-border)] pt-6">
                      <h3 className="text-[18px] font-medium text-[var(--creed-text-primary)]">
                        Prompts and resources
                      </h3>
                      <div className="mt-4 space-y-3">
                        {referenceItems.map((item) => (
                          <div
                            key={item.name}
                            className="grid gap-1 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:gap-6"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-medium tracking-[0.02em] text-[var(--creed-text-tertiary)]">
                                {item.kind}
                              </span>
                              <MonoCode>{item.name}</MonoCode>
                            </div>
                            <p className="text-[15px] leading-7 text-[var(--creed-text-secondary)] md:text-[16px]">
                              {item.description}
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-6 text-[15px] leading-8 text-[var(--creed-text-secondary)] md:text-[16px]">
                        When a client connects, the server also sends an instructions field carrying the
                        read-before-work, propose-narrowly contract, so agents behave correctly without you pasting a
                        setup prompt.
                      </p>
                    </div>
                  </>
                ) : null}

                {section.id === "http-api" ? (
                  <div className="mt-8 space-y-4">
                    {httpEndpoints.map((endpoint) => (
                      <div
                        key={endpoint.path}
                        className="rounded-[16px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-5"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-[6px] bg-[var(--creed-surface-raised)] px-2 py-0.5 text-[12px] font-medium text-[#2563EB]">
                            {endpoint.method}
                          </span>
                          <span
                            className="text-[14px] text-[var(--creed-text-primary)]"
                            style={{ fontFamily: "var(--font-mono), monospace" }}
                          >
                            {endpoint.path}
                          </span>
                        </div>
                        <p className="mt-3 text-[15px] leading-7 text-[var(--creed-text-secondary)] md:text-[16px]">
                          <span className="text-[var(--creed-text-primary)]">{endpoint.summary}</span>{" "}
                          {endpoint.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {section.id === "data-and-privacy" ? (
                  <p className="mt-6 text-[15px] leading-8 text-[var(--creed-text-secondary)] md:text-[16px]">
                    Read the full{" "}
                    <Link href="/privacy" className="font-medium text-[#2563EB] hover:text-[#1D4ED8]">
                      privacy policy
                    </Link>{" "}
                    for the complete picture.
                  </p>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
