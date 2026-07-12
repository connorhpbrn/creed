import type { Article } from "./types";

export const personalClaudeMdTemplate: Article = {
  slug: "personal-claude-md-template",
  title: "A personal CLAUDE.md template",
  description:
    "A ready-to-copy personal CLAUDE.md with sections for who you are, how you work, your preferences, and your constraints, plus how to use it and why a portable file is better.",
  cluster: "category",
  datePublished: "2026-07-07",
  dateModified: "2026-07-07",
  lead:
    "CLAUDE.md is the file Claude Code reads before it works in a repository. This is a personal version of that file: instead of project conventions, it holds the durable facts about you an AI should never have to ask for. Copy the template below into a CLAUDE.md, replace the placeholders with real facts, and an agent that reads it will start already knowing who you are and how you want to be answered.\n\nKeep it short and specific. The value is in lines that change how an assistant responds, not in completeness. Four sections cover almost everyone: who you are, how you work, your preferences, and your constraints.\n\nA per-file approach works, but it lives in one repository and one tool, and nothing keeps it current except you. Creed is the portable version: one personal context file that every AI you connect reads before it answers, kept sharp by agent proposals you approve. Use the template to start, and upgrade when you get tired of maintaining copies.",
  body: [
    { type: "h2", text: "The template" },
    {
      type: "p",
      text: "Copy this into a file named CLAUDE.md. The bracketed lines are prompts, not real content; replace each with one specific fact, or delete it. Resist the urge to fill every line. A tight profile the agent reads in full beats a long one it skims.",
    },
    {
      type: "code",
      lang: "markdown",
      code: "# About me\n- I am [name], based in [city / timezone].\n- I work as [role] at [company / on my own].\n- I write in [language], [British / American] spelling.\n- What I want from you: [one line, e.g. a sharp thinking partner, not a cheerleader].\n\n# How I work\n- My focus right now: [current goal or project].\n- Tools I live in: [e.g. Linear, Figma, VS Code, a terminal].\n- How I make decisions: [e.g. fast and reversible; I dislike long options lists].\n- Decisions I own: [scope, hiring, pricing]. Not mine: [delivery, legal].\n\n# Preferences\n- Answer first, then explain. Lead with the recommendation.\n- Be direct. No preamble, no hedging, no flattery.\n- For code: give me the whole file, not a diff. [language / framework] by default.\n- Style: no em dashes; [any other hard rules].\n\n# Constraints\n- Never [a hard limit, e.g. suggest tools that need a US bank account].\n- Do not [another, e.g. schedule anything before 10:00].\n- Assume [a default that keeps you from having to correct it, e.g. remote-first].",
    },
    { type: "h2", text: "How to use it" },
    {
      type: "p",
      text: "The point of the file is that the agent reads it before it acts, so it needs to be somewhere the agent loads automatically.",
    },
    {
      type: "ol",
      items: [
        "Save the filled-in file as CLAUDE.md at the root of a repository you work in, so Claude Code loads it at the start of each session.",
        "For non-coding tools, paste the same content into their custom instructions or memory field.",
        "Keep it separate from project rules. Build commands and conventions belong in the project's own CLAUDE.md, not in the personal one.",
        "Revisit it when something durable changes, a new goal, a sharper preference, and edit every copy so they do not drift.",
      ],
    },
    {
      type: "p",
      text: "That last step is the catch, and it is worth being honest about it.",
    },
    { type: "h2", text: "Why a portable context file beats a per-tool file" },
    {
      type: "p",
      text: "A personal CLAUDE.md is a good start, but it inherits the limits of a per-repo, per-tool file. It lives in one repository, so other projects do not see it. It is a Claude Code convention, so ChatGPT and Cursor do not read it. And nothing keeps it current, so the copies you scatter across tools slowly disagree with each other and with you.",
    },
    {
      type: "table",
      caption: "A personal CLAUDE.md compared to a portable context file.",
      headers: ["Topic", "Personal CLAUDE.md", "Portable context file"],
      rows: [
        ["Where it lives", "One repo, or pasted per tool", "One file you own"],
        ["Read by", "Claude Code, or whatever you pasted into", "Every agent you connect, over MCP"],
        ["Copies to maintain", "One per repo and per tool", "One"],
        ["Stays current by", "You editing each copy", "Agent proposals you approve"],
        ["Export or delete", "Manual, per file", "Anytime, plain Markdown, no lock-in"],
      ],
    },
    {
      type: "p",
      text: "Creed keeps the same content this template holds, who you are, how you work, your preferences, your constraints, in one structured profile that every AI you connect reads before it answers. It connects over MCP to Claude Code, ChatGPT, Cursor, and others, so you write yourself down once instead of once per tool. Agents propose narrow updates as they learn something durable, and you approve what stays, so the profile stays sharp instead of drifting across copies. It is plain Markdown you own and can export or delete at any time.",
    },
    {
      type: "p",
      text: "Start with the template. When you notice you are maintaining the same facts in three places, that is the signal to move to one file every tool reads.",
    },
  ],
  faq: [
    {
      question: "What goes in a personal CLAUDE.md?",
      answer:
        "Four short sections cover most people: who you are, how you work, your preferences, and your constraints. Keep it to durable facts that change how an assistant should answer, not project conventions or a full biography.",
    },
    {
      question: "Where do I put a personal CLAUDE.md?",
      answer:
        "Save it as CLAUDE.md at the root of a repository so Claude Code loads it automatically, and paste the same content into the memory or custom-instructions field of any non-coding tool you use.",
    },
    {
      question: "Should personal and project instructions live in the same file?",
      answer:
        "No. Keep project build commands and conventions in the project's own CLAUDE.md, and keep facts about you separate. Your identity is not scoped to one repository, so mixing them makes both harder to maintain.",
    },
    {
      question: "Why move from a CLAUDE.md to Creed?",
      answer:
        "A CLAUDE.md is per-repo and Claude Code specific, so you end up maintaining copies across tools that drift apart. Creed keeps one portable context file every agent reads over MCP, and agents propose updates you approve so it stays current.",
    },
  ],
  related: [
    { label: "CLAUDE.md for your life", href: "/learn/claude-md-for-your-life" },
    { label: "Personal context file template", href: "/learn/personal-context-file-template" },
    { label: "Connect Creed to Claude Code", href: "/learn/connect-creed-to-claude-code" },
  ],
};
