import type { Article } from "./types";
import { accentColorMap } from "@/lib/creed-data";

export const reExplainingTax: Article = {
  slug: "re-explaining-tax",
  title: "Re-explaining tax",
  description:
    "Every new chat and every new tool starts cold. Why the usual patches do not stick, and the one file that ends the tax.",
  cluster: "problem",
  datePublished: "2026-07-07",
  dateModified: "2026-07-26",
  lead:
    "If you use AI often, you pay a re-explaining tax. Every new chat starts cold, so you retype your role, project, tone, and constraints. Open a second tool and do it again, because what you told ChatGPT never reaches Claude or Cursor.\n\nCustom instructions, pasted blurbs, and built-in memory each help a little. None of them travel. The fix is one context file every tool reads before it answers.",
  body: [
    { type: "h2", text: "Two forms of the tax" },
    {
      type: "p",
      text: "Per-chat: a fresh conversation does not know what you set last week. Per-tool: what one app learns never crosses to another. Neither is dramatic alone. Together they eat a real slice of every session.",
    },
    { type: "tax-compound-chart" },
    { type: "h2", text: "Why the usual patches fail" },
    {
      type: "labeled-list",
      items: [
        {
          label: "Custom instructions",
          text: "short, per-account, one app only.",
          color: accentColorMap.boundaries,
        },
        {
          label: "Pasting a blurb",
          text: "works once, then goes stale.",
          color: accentColorMap.boundaries,
        },
        {
          label: "Built-in memory",
          text: "opaque, trapped inside one vendor.",
          color: accentColorMap.boundaries,
        },
      ],
    },
    { type: "h2", text: "What actually ends it" },
    {
      type: "table",
      headers: ["Approach", "Across chats", "Across tools", "Editable"],
      rows: [
        ["Custom instructions", "Inside one app", "No", "Capped"],
        ["Pasting a blurb", "Only if you paste", "Only where you paste", "Goes stale"],
        ["Built-in memory", "Inside one app", "No", "Partly"],
        ["One context file", "Yes", "Yes", "Plain Markdown"],
      ],
    },
    {
      type: "ol",
      items: [
        "Write the durable basics once.",
        "Cut anything that would not change an answer.",
        "Connect the file to each tool.",
        "Approve agent updates as your work shifts.",
      ],
    },
  ],
  faq: [
    {
      question: "Why do I keep re-explaining myself to AI?",
      answer:
        "Context lives inside each app. New chats start cold, and what one tool learns never reaches another.",
    },
    {
      question: "Do custom instructions or memory solve this?",
      answer:
        "Only inside one app. They leave the cross-tool problem untouched.",
    },
    {
      question: "What stops the repetition?",
      answer:
        "One portable context file that every tool reads before it answers.",
    },
  ],
  related: [
    { label: "Personal context file", href: "/learn/personal-context-file" },
    { label: "Memory vs a context file", href: "/learn/memory-vs-context-file" },
    { label: "Connect your tools", href: "/learn/connect-your-tools" },
  ],
};
