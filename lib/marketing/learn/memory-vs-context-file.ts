import type { Article } from "./types";

export const memoryVsContextFile: Article = {
  slug: "memory-vs-context-file",
  title: "Memory vs a context file",
  description:
    "Chatbot memory is automatic inside one app. A personal context file is portable and owned. When each one wins.",
  cluster: "comparison",
  datePublished: "2026-07-07",
  dateModified: "2026-07-26",
  lead:
    "Chatbot memory and a personal context file solve overlapping problems differently. Memory is effortless and trapped in one app. A context file is portable and legible, and asks you to own it.\n\nIf you live in one chatbot, memory is often enough. The moment you use a second tool, or want to see exactly what AI knows about you, the file wins.",
  body: [
    { type: "h2", text: "Side by side" },
    {
      type: "table",
      headers: ["Topic", "Chatbot memory", "Personal context file"],
      rows: [
        ["Portable across tools", "cross", "check"],
        ["You own it", "cross", "check"],
        ["Fully editable", "cross", "check"],
        ["Zero upkeep", "check", "cross"],
        ["Same profile everywhere", "cross", "check"],
      ],
    },
    { type: "h2", text: "When memory alone is enough" },
    {
      type: "p",
      text: "If one chatbot is the only AI you use, and you would rather do nothing than maintain a file, built-in memory is fine. You do not need a context file for that setup.",
    },
    { type: "h2", text: "When the file wins" },
    {
      type: "ul",
      accent: "var(--creed-success)",
      items: [
        "You use more than one tool (ChatGPT, Claude, Cursor, etc.).",
        "You want to read and correct exactly what AI knows about you.",
        "You expect to switch vendors as models improve.",
        "You want the same profile to follow you everywhere.",
      ],
    },
    { type: "h2", text: "You can use both" },
    {
      type: "p",
      text: "Nothing stops ChatGPT from keeping its own memory while a portable context file informs every tool, including ChatGPT. The file is what makes the rest of your stack as informed as the one app that already remembers you.",
    },
  ],
  faq: [
    {
      question: "When is chatbot memory enough on its own?",
      answer:
        "When you live in one chatbot and do not care that its notes are opaque or stuck there. If that is how you work, built-in memory is the lower-effort answer.",
    },
    {
      question: "When does a context file win?",
      answer:
        "As soon as you use a second tool, want to read and edit exactly what AI knows about you, or expect to switch vendors. Portability and legibility are the point.",
    },
    {
      question: "Should I turn memory off if I use a context file?",
      answer:
        "No. Leave vendor memory on if it helps inside that app. The file is what brings every other tool up to the same level, including that chatbot when it is connected.",
    },
    {
      question: "Why doesn't ChatGPT memory show up in Claude or Cursor?",
      answer:
        "It is stored inside that product and is not built to export. A personal context file lives outside any single app, so the same profile can be read everywhere you connect it.",
    },
  ],
  related: [
    { label: "Personal context file", href: "/learn/personal-context-file" },
    { label: "Re-explaining tax", href: "/learn/re-explaining-tax" },
    { label: "Connect your tools", href: "/learn/connect-your-tools" },
  ],
};
