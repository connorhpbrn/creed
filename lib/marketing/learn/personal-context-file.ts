import type { Article } from "./types";
import { accentColorMap } from "@/lib/creed-data";

export const personalContextFile: Article = {
  slug: "personal-context-file",
  title: "Personal context file",
  description:
    "One structured profile every AI reads before it answers. What goes in it, how it stays current, and why it beats retyping who you are.",
  cluster: "category",
  datePublished: "2026-07-07",
  dateModified: "2026-07-26",
  lead:
    "A personal context file is a single, structured profile that describes who you are and how you want AI to work with you. You write it once. Every tool you connect reads it before it answers.\n\nIt is plain text you own, usually Markdown, organized into short sections like identity, goals, work, preferences, and constraints. Specific and current, not a diary. Creed is that file, connected to your agents over MCP.",
  body: [
    { type: "h2", text: "Why it exists" },
    {
      type: "p",
      text: "Every new AI chat starts cold. The model does not know your role, your stack, your voice, or what you already told another assistant. Built-in memory helps a little, but it is trapped inside one app. A personal context file lives outside any single tool: one page, every agent.",
    },
    { type: "context-perf-chart" },
    { type: "h2", text: "What goes in it" },
    {
      type: "labeled-list",
      items: [
        {
          label: "Identity",
          text: "who you are, in a few lines an AI should never get wrong.",
          color: accentColorMap.skills,
        },
        {
          label: "Goals",
          text: "what you are working toward right now.",
          color: accentColorMap.yellow,
        },
        {
          label: "Work",
          text: "your role, stack, projects, and how you operate.",
          color: accentColorMap["operating-principles"],
        },
        {
          label: "Preferences",
          text: "how you want AI to talk, format, and assume.",
          color: accentColorMap.boundaries,
        },
        {
          label: "Routines",
          text: "the shape of your week that suggestions should respect.",
          color: accentColorMap.stack,
        },
        {
          label: "Optional",
          text: "Beliefs, Constraints, People, Health, Context, when they earn a place.",
          color: accentColorMap.projects,
        },
      ],
    },
    {
      type: "p",
      text: "Specific over complete. If a line would not change an answer, leave it out.",
    },
    { type: "h2", text: "Context file vs chatbot memory" },
    {
      type: "table",
      headers: ["Topic", "Chatbot memory", "Personal context file"],
      rows: [
        ["Where it lives", "Inside one app", "One file you own"],
        ["Portable across tools", "No", "Yes"],
        ["You can read and edit it", "Partly", "Yes, plain Markdown"],
        ["Export or delete", "Limited", "Anytime"],
        ["Kept current by", "Opaque heuristics", "Agent proposals you approve"],
      ],
    },
    { type: "h2", text: "How it stays current" },
    {
      type: "p",
      text: "Connected agents read the file before they answer and propose small updates as they learn something durable. You approve what stays. Session chatter stays out.",
    },
  ],
  faq: [
    {
      question: "What is a personal context file?",
      answer:
        "One file that describes who you are and how you want AI to respond, which every connected tool reads before it answers.",
    },
    {
      question: "How is it different from ChatGPT memory?",
      answer:
        "ChatGPT memory lives inside ChatGPT. A personal context file is portable Markdown you own, read by every agent you connect.",
    },
    {
      question: "What should I put in it?",
      answer:
        "Durable facts that change how AI should respond: identity, goals, work, preferences, constraints. Leave out session chatter.",
    },
  ],
  related: [
    { label: "Re-explaining tax", href: "/learn/re-explaining-tax" },
    { label: "Memory vs a context file", href: "/learn/memory-vs-context-file" },
    { label: "Connect your tools", href: "/learn/connect-your-tools" },
  ],
};
