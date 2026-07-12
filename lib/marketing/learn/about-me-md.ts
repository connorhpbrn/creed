import type { Article } from "./types";

export const aboutMeMd: Article = {
  slug: "about-me-md",
  title: "about-me.md: give every AI the same introduction",
  description:
    "about-me.md is a short Markdown intro you paste into AI tools so each one starts knowing you. Here is how to write one, its limits, and how to automate it.",
  cluster: "category",
  datePublished: "2026-07-07",
  dateModified: "2026-07-07",
  lead:
    "about-me.md is a short Markdown introduction to yourself that you paste into an AI tool so it stops treating you like a stranger. Instead of re-explaining your job, your goals, and how you like answers at the start of every chat, you keep a few lines in one file and drop them into each tool's custom instructions or memory. It is the simplest form of a personal context file, and it takes five minutes to write.\n\nA good about-me.md is short and specific: who you are, what you are working on, how you want to be answered, and any hard limits. If a line would not change how an assistant responds, it does not belong.\n\nThe convention has three real limits. It is static, so it goes stale unless you edit it. It is manual, so you paste it into each tool by hand. And it is per-tool, so every app keeps its own copy and they drift apart. Creed automates all three: it is one personal context file that every AI you connect reads before it answers, kept current by agent proposals you approve.",
  body: [
    { type: "h2", text: "What about-me.md is" },
    {
      type: "p",
      text: "about-me.md is not a formal standard; it is a convention people converge on once they get tired of introducing themselves to every new chat. The name signals the intent: a Markdown file whose only job is to tell an AI who you are before it answers. You keep it in one place and paste it wherever a tool lets you set persistent instructions.",
    },
    {
      type: "p",
      text: "It sits at the light end of the same spectrum as a fuller personal context file. Where a full profile has ten sections, an about-me.md is often a dozen lines. That is a feature when you are starting out: low effort, immediate payoff.",
    },
    { type: "h2", text: "How to write one" },
    {
      type: "p",
      text: "Cover four things and stop. The discipline is to keep only lines that change an answer.",
    },
    {
      type: "ul",
      items: [
        "Identity: who you are, where you are, what you do, in a few lines.",
        "Focus: what you are working on right now, so advice points the right way.",
        "Preferences: how you want AI to answer, tone, format, and default assumptions.",
        "Limits: any hard constraints an assistant should never cross.",
      ],
    },
    {
      type: "p",
      text: "Here is a complete example. It is short on purpose; every line would change how an assistant replies.",
    },
    {
      type: "code",
      lang: "markdown",
      code: "# About me\n\nI am Dan, a solo founder in Berlin building a B2B analytics tool.\nNon-technical background; I can read code but not write much.\n\nRight now I am preparing a seed raise and writing the deck.\n\nHow to answer me:\n- Lead with the recommendation, then the reasoning.\n- Be blunt. I would rather hear the risk than the reassurance.\n- Keep jargon out unless you define it.\n- No em dashes.\n\nLimits:\n- Do not suggest hiring; I am staying solo through the raise.\n- Assume a European market unless I say otherwise.",
    },
    {
      type: "p",
      text: "Save it, then paste the contents into each tool's memory or custom-instructions field. That is the whole workflow.",
    },
    { type: "h2", text: "The limits of a pasted file" },
    {
      type: "p",
      text: "about-me.md is a real improvement over retyping, but it has three limits worth naming plainly.",
    },
    {
      type: "ul",
      items: [
        "Static: the file does not know when your focus changes or a preference sharpens. It only improves when you remember to edit it.",
        "Manual: you paste it into each tool by hand, and again whenever it changes. The more tools you use, the more the paperwork grows.",
        "Per-tool: every app keeps its own copy, so a change in one place does not reach the others, and the copies drift until they contradict each other.",
      ],
    },
    { type: "h2", text: "about-me.md vs a connected context file" },
    {
      type: "table",
      caption: "A pasted about-me.md compared to a connected context file.",
      headers: ["Topic", "about-me.md (pasted)", "Connected context file"],
      rows: [
        ["Reaches each tool by", "Manual paste", "MCP connection, read automatically"],
        ["Copies to maintain", "One per tool", "One"],
        ["Stays current by", "You editing every copy", "Agent proposals you approve"],
        ["Depth", "A dozen lines", "Ten sections when you need them"],
        ["You own the file", "Yes", "Yes, plain Markdown, export anytime"],
      ],
    },
    {
      type: "p",
      text: "The two are not opposites; a connected context file is what about-me.md wants to be once the manual parts hurt. You keep the same idea, a written introduction an AI reads before it answers, and remove the copying and the drift.",
    },
    { type: "h2", text: "How Creed automates it" },
    {
      type: "p",
      text: "Creed is one personal context file that every AI you connect reads before it answers. Instead of pasting an about-me.md into each app, you connect your agents over MCP, Claude Code, ChatGPT, Cursor, and others, and they read the same profile automatically. As they learn something durable about you, a shifted focus, a sharper preference, they propose a narrow update, and you approve what stays, so the file keeps up with you instead of going stale.",
    },
    {
      type: "p",
      text: "It is still plain Markdown you own. You can export or delete it at any time, and it starts as small as an about-me.md and grows only when a section earns its place. If you have a pasted intro today, it is the perfect first draft to move in.",
    },
  ],
  faq: [
    {
      question: "What is an about-me.md file?",
      answer:
        "It is a short Markdown introduction to yourself that you paste into an AI tool's memory or custom instructions, so the tool starts each chat already knowing who you are and how you want to be answered.",
    },
    {
      question: "What should an about-me.md include?",
      answer:
        "Four things: who you are, what you are working on now, how you want AI to answer you, and any hard limits it should not cross. Keep it short and specific; only include lines that would change how an assistant responds.",
    },
    {
      question: "What are the downsides of an about-me.md?",
      answer:
        "It is static, so it goes stale unless you edit it; manual, so you paste it into each tool by hand; and per-tool, so every app keeps its own copy and they drift apart over time.",
    },
    {
      question: "How is Creed different from pasting an about-me.md?",
      answer:
        "Creed connects one context file to your agents over MCP so each reads it automatically instead of from a pasted copy, and agents propose updates you approve so it stays current. It is still plain Markdown you own and can export anytime.",
    },
  ],
  related: [
    { label: "What is a personal context file?", href: "/learn/what-is-a-personal-context-file" },
    { label: "Personal context file template", href: "/learn/personal-context-file-template" },
    { label: "Stop repeating yourself to AI", href: "/learn/stop-repeating-yourself-to-ai" },
  ],
};
