import type { Article } from "./types";

export const whatIsAPersonalContextFile: Article = {
  slug: "what-is-a-personal-context-file",
  title: "What is a personal context file?",
  description:
    "A personal context file is one structured profile that every AI reads before it answers you. Here is what goes in it, how it works, and why it beats retyping who you are.",
  cluster: "category",
  datePublished: "2026-07-07",
  dateModified: "2026-07-12",
  lead:
    "A personal context file is a single, structured profile that describes who you are and how you want AI to work with you, written once and read by every AI tool you connect. Instead of re-explaining your job, your goals, and your preferences at the start of every chat, you keep them in one file that ChatGPT, Claude, Cursor, and other agents read before they answer.\n\nIt is plain text you own, usually Markdown, organized into short sections like identity, goals, work, preferences, and constraints. A good one is specific and current, not a diary. The point is not to store everything about you; it is to keep the handful of facts that actually change how an AI should respond, in a form any tool can read. Creed is a personal context file that connects to your agents over MCP, so the same profile follows you across every tool, and your agents can propose updates as they learn more about you.",
  body: [
    { type: "h2", text: "Why a context file exists" },
    {
      type: "p",
      text: "Every new AI chat starts cold. The model does not know your role, your stack, your writing voice, the people you work with, or the things you have told three other assistants already. So you re-explain, every time, in every tool. That re-explaining tax is small per message and enormous over a year.",
    },
    {
      type: "p",
      text: "Built-in memory helps a little, but it is trapped inside one app. ChatGPT's memory does not move to Claude. Claude's projects do not move to Cursor. A personal context file fixes the root problem by living outside any single tool: you write yourself down once, and every agent reads the same page.",
    },
    { type: "h2", text: "What goes in a personal context file" },
    {
      type: "p",
      text: "The format is simple on purpose. Creed organizes a context file into ten sections: five always-on core sections that everyone fills in, and five optional ones that appear only when you use them.",
    },
    {
      type: "ul",
      items: [
        "Identity: who you are, in a few lines an AI should never get wrong.",
        "Goals: what you are working toward right now, so advice points the right way.",
        "Work: your role, stack, projects, and how you actually operate.",
        "Preferences: how you want AI to talk to you, format answers, and make assumptions.",
        "Routines: the shape of your week that context-aware suggestions should respect.",
        "Optional: Beliefs, Constraints, People, Health, and Context, added as they earn their place.",
      ],
    },
    {
      type: "p",
      text: "The rule that keeps it useful: specific over complete. A short profile that changes how AI replies beats a long one that reads like a resume. A good context file names real tools, real people, and real defaults, and can be read end to end in under a minute. If a line would not change an answer, it does not belong in the file.",
    },
    { type: "h2", text: "How it stays current" },
    {
      type: "p",
      text: "A context file is only worth reading if it stays true. With Creed, connected agents read the file before they answer and propose small updates as they learn something durable about you: a sharper preference, a new routine, a goal that shifted. You approve what stays, or let trusted agents write directly. Session chatter, moods, and one-off tasks are left out by design.",
    },
    { type: "h2", text: "Context file vs chatbot memory" },
    {
      type: "table",
      caption: "A personal context file compared to a chatbot's built-in memory.",
      headers: ["Topic", "Chatbot memory", "Personal context file"],
      rows: [
        ["Where it lives", "Inside one app", "One file you own, outside any app"],
        ["Portable across tools", "No", "Yes, every agent you connect reads it"],
        ["You can read and edit it", "Partly, and indirectly", "Yes, it is plain Markdown"],
        ["Export or delete", "Limited", "Anytime, no lock-in"],
        ["Kept current by", "Opaque heuristics", "Agent proposals you approve"],
      ],
    },
    { type: "h2", text: "Portable, and yours" },
    {
      type: "p",
      text: "A context file only pays off if it travels. Creed connects to agents like Claude Code, Codex, Cursor, and ChatGPT over MCP, and integrates with GitHub for version control, with Notion and Obsidian on the way. The same profile follows you into every tool instead of living inside one app's memory.",
    },
    {
      type: "p",
      text: "Ownership is just as literal: the file is plain Markdown you control. You bring your own AI key, your tokens stay yours, and deleting your account wipes everything. There is no lock-in.",
    },
    { type: "h2", text: "Who it is for" },
    {
      type: "p",
      text: "A personal context file is not developer-only. The structure is identical whether you write code all day or never open a terminal; only the examples change. Founders, writers, researchers, operators, students, and parents all benefit from the same thing: AI that starts every conversation already knowing them.",
    },
    {
      type: "p",
      text: "If you want one, you can write a context file by hand in any Markdown editor and paste it into each tool, or use Creed to keep one profile that connects to your agents over MCP and updates itself as you go. Either way, the win is the same: you stop paying the re-explaining tax.",
    },
  ],
  faq: [
    {
      question: "What is a personal context file in simple terms?",
      answer:
        "It is one file that describes who you are and how you want AI to respond, which every AI tool you connect reads before it answers. You write it once instead of re-explaining yourself in every new chat.",
    },
    {
      question: "How is it different from ChatGPT's memory?",
      answer:
        "ChatGPT's memory lives inside ChatGPT and cannot move to other tools. A personal context file is one portable file you own that works across every agent you connect, and you can read, edit, export, or delete it as plain Markdown at any time.",
    },
    {
      question: "What should I put in a personal context file?",
      answer:
        "Keep the handful of durable facts that change how AI should respond: your identity, current goals, how you work, your preferences, and any hard constraints. Leave out session chatter and anything only true today. Specific beats complete.",
    },
    {
      question: "Which tools does a personal context file work with?",
      answer:
        "Creed connects to agents like Claude Code, Codex, Cursor, and ChatGPT over MCP, and integrates with GitHub for version control. Support for Notion and Obsidian is on the way.",
    },
    {
      question: "Do I own my personal context file?",
      answer:
        "Yes. Creed is plain Markdown that you control. You bring your own AI key, your tokens stay yours, and deleting your account wipes everything. There is no lock-in.",
    },
    {
      question: "Do I need to be a developer to use one?",
      answer:
        "No. The structure is the same for everyone; only the examples differ. Anyone who uses AI regularly benefits from a profile every tool reads before it answers.",
    },
  ],
  related: [
    { label: "Personal context file template", href: "/learn/personal-context-file-template" },
    { label: "Why ChatGPT forgets you", href: "/learn/why-chatgpt-forgets-you" },
    { label: "Share context between ChatGPT and Claude", href: "/learn/share-context-between-chatgpt-and-claude" },
  ],
};
