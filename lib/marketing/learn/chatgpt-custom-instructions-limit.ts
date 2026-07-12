import type { Article } from "./types";

export const chatgptCustomInstructionsLimit: Article = {
  slug: "chatgpt-custom-instructions-limit",
  title: "ChatGPT custom instructions: what fits, and 5 workarounds",
  description:
    "ChatGPT custom instructions are two short boxes that apply to your account inside ChatGPT. Here is what fits, why they run out, and five ways to hold more context.",
  cluster: "problem",
  datePublished: "2026-07-07",
  dateModified: "2026-07-07",
  lead:
    "ChatGPT custom instructions are two text boxes in your settings: one for what ChatGPT should know about you, and one for how you want it to respond. They apply to your account inside ChatGPT and quietly prefix your chats, so you do not repeat your role, tone, and preferences every time. They are useful and worth filling in.\n\nThe catch is that they are short. Each box is limited, so they are best for a tight summary, not your whole context. They also live only inside ChatGPT: they do not shape Claude, Cursor, or any other tool, and there is no clean way to move them. Once you have written a crisp version, you tend to hit the ceiling and start trimming.\n\nWhen the boxes run out, you have options. You can tighten what you keep, lean on a Project for scoped context, paste a longer profile at the start of a chat, use ChatGPT memory for durable facts, or move your context into a portable file every tool reads. Creed takes that last approach: one context file you own that your agents read over MCP, so the same profile follows you across tools instead of living in two capped boxes.",
  body: [
    { type: "h2", text: "What custom instructions are" },
    {
      type: "p",
      text: "Custom instructions live in your ChatGPT settings as two fields. The first captures what you want ChatGPT to know about you: your role, what you are working on, how you think. The second captures how you want it to respond: tone, format, length, level of detail. ChatGPT applies both to your conversations so you are not restating them each session.",
    },
    {
      type: "p",
      text: "Three things are worth being precise about. They are short, so they hold a summary rather than everything. They are per-account inside ChatGPT, so they follow you across your ChatGPT chats but nowhere else. And they are in-app only, so they do nothing for the other AI tools you use.",
    },
    { type: "h2", text: "Why you run out of room" },
    {
      type: "p",
      text: "The fields are deliberately limited, so you cannot paste a long dossier. That constraint is actually healthy: it forces you to keep only the lines that change how ChatGPT answers. But it means custom instructions cannot be your complete context, and it means anything you cut has to live somewhere else.",
    },
    {
      type: "p",
      text: "The deeper limit is scope. Even a perfect set of instructions only helps inside ChatGPT. Switch to Claude or Cursor and you are starting from nothing again. So the real question is not just what fits in the boxes, but where the rest of your context should live so every tool can use it.",
    },
    { type: "h2", text: "5 workarounds when the boxes run out" },
    {
      type: "ol",
      items: [
        "Tighten what you keep. Cut anything that would not change an answer. Prefer sharp lines like your role, your stack, your writing voice, and two or three hard constraints over a life story. A short, specific profile beats a long, generic one.",
        "Use a Project for scoped context. ChatGPT Projects let you attach instructions and files that apply within that Project, so work-specific context does not have to compete for space in your global boxes.",
        "Paste a profile at the start of a chat. Keep a longer Markdown profile in a note and drop it into the first message when a conversation needs the full picture. It is manual, but it lifts the ceiling for that thread.",
        "Use ChatGPT memory for durable facts. Let saved memories carry stable details so your custom instructions can stay lean. Review them occasionally so the store does not drift.",
        "Move your context into a portable file every tool reads. Keep one structured file that describes who you are, and connect it to each tool so it is read before every answer. This is the only option that also covers Claude, Cursor, and the rest.",
      ],
    },
    { type: "h2", text: "In-app fixes vs a portable file" },
    {
      type: "p",
      text: "The first four workarounds all improve ChatGPT. None of them cross the app boundary. If you use more than one AI tool, that boundary is where the effort leaks: you tune ChatGPT beautifully and then rebuild the same context in the next tool. A portable file is the one approach that removes the leak.",
    },
    {
      type: "table",
      caption: "Where each workaround helps.",
      headers: ["Approach", "Holds more context", "Works outside ChatGPT"],
      rows: [
        ["Tighter custom instructions", "No, same limit", "No"],
        ["Project instructions", "Yes, scoped", "No"],
        ["Pasted profile", "Yes, per chat", "Only if you paste it there too"],
        ["ChatGPT memory", "Somewhat", "No"],
        ["Portable context file", "Yes", "Yes, every tool you connect"],
      ],
    },
    { type: "h2", text: "How a portable file works" },
    {
      type: "p",
      text: "Creed is one personal context file that every AI reads before it answers. It is plain Markdown you own, organized into short sections such as identity, goals, work, preferences, and constraints, and connected to your agents over MCP. Your custom instructions can then stay short on purpose, because the full, current picture lives in a file that every tool reads, not in two capped boxes in one app.",
    },
    {
      type: "p",
      text: "The practical routine is simple: keep custom instructions as a tight summary for ChatGPT, and keep the durable, cross-tool version in the file. As your agents learn something that lasts, they propose a small update you approve, so the file stays current without turning into a diary.",
    },
  ],
  faq: [
    {
      question: "How long can ChatGPT custom instructions be?",
      answer:
        "Both boxes are limited, so they hold a short summary rather than your entire context. Rather than counting characters, treat them as space for the few lines that change how ChatGPT responds, and keep anything longer somewhere else.",
    },
    {
      question: "Do custom instructions work in Claude or Cursor?",
      answer:
        "No. Custom instructions apply inside ChatGPT only. Other tools never see them, which is why relying on them alone leaves you re-explaining yourself in every other app.",
    },
    {
      question: "What is the difference between custom instructions and memory?",
      answer:
        "Custom instructions are text you write and control directly. Memory is what ChatGPT saves or infers over time. Both are ChatGPT-only, so neither carries over to other tools.",
    },
    {
      question: "How do I keep more context without hitting the limit?",
      answer:
        "Tighten the boxes to essentials and move the rest into a portable context file that every tool reads. That way custom instructions stay short and your full profile lives in one place you own, available across ChatGPT, Claude, and more.",
    },
  ],
  related: [
    {
      label: "Stop repeating yourself to AI",
      href: "/learn/stop-repeating-yourself-to-ai",
    },
    {
      label: "Why ChatGPT forgets you",
      href: "/learn/why-chatgpt-forgets-you",
    },
    { label: "The about-me.md file", href: "/learn/about-me-md" },
  ],
};
