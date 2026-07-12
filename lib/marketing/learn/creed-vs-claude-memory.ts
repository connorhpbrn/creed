import type { Article } from "./types";

export const creedVsClaudeMemory: Article = {
  slug: "creed-vs-claude-memory",
  title: "Claude Projects and memory vs a portable context file",
  description:
    "Claude Projects scope context to one workspace and do it well. A portable context file is one profile every tool reads. Here is how they compare and when to use each.",
  cluster: "comparison",
  datePublished: "2026-07-07",
  dateModified: "2026-07-07",
  lead:
    "Claude Projects, project knowledge, and Claude's memory are built to scope context to a workspace inside Claude, and they are good at it. A Project gathers the files, instructions, and knowledge for one body of work, so every chat in that Project starts with the right background loaded. If your goal is to give Claude deep, durable context about one initiative, this is a strong tool and the natural choice.\n\nA portable context file solves a different problem: it is one profile about you that every AI you connect reads, not just Claude. It is plain text you own, organized into short sections, and it travels across ChatGPT, Cursor, and other agents alongside Claude. Where a Project is scoped to a workspace and lives inside Claude, a context file is scoped to you and lives outside any single app.\n\nThe two are complementary more than competing. Use Claude Projects for the depth of one workspace, and use a portable context file for the facts about you that should follow you everywhere. Creed is that context file: it connects to your agents over MCP, including Claude, so the same profile is read before every answer.",
  body: [
    { type: "h2", text: "What Claude Projects and memory do well" },
    {
      type: "p",
      text: "Claude's project features are strong at scoping. A Project lets you attach documents, set custom instructions, and build up project knowledge that every conversation in that Project can draw on. For sustained work on one thing, a client, a codebase, a research area, that depth is exactly right. Claude also keeps context within a workspace so you are not re-uploading the same files each session.",
    },
    {
      type: "p",
      text: "This is genuinely useful, and a portable context file does not replace it. If you need Claude to reason over a large body of specific material for one initiative, Projects are the better container for that material. Keeping a fifty-page spec in your personal profile would be the wrong move; keeping it in a Project is the right one.",
    },
    { type: "h2", text: "Where they stop" },
    {
      type: "p",
      text: "The boundary is the same one every built-in feature has: it lives inside Claude. Project knowledge and Claude's memory do not travel to ChatGPT or Cursor, so context you build in Claude does not make your other tools any smarter. Scoping is also per-workspace by design, which means the durable facts about you get repeated across Projects rather than kept in one place. And what Claude retains as memory is shaped by the app, not laid out as a document you edit line by line.",
    },
    {
      type: "p",
      text: "A portable context file is the missing piece: one profile about you, read by every tool, that you own and can read end to end.",
    },
    { type: "h2", text: "Side by side" },
    {
      type: "table",
      caption: "Claude Projects and memory compared to a portable context file.",
      headers: ["Topic", "Claude Projects and memory", "Portable context file"],
      rows: [
        ["Scope", "One workspace inside Claude", "One profile about you"],
        ["Portability", "Claude only", "Every tool you connect"],
        ["Ownership", "Held in the app", "Plain Markdown you own"],
        ["Editability", "Instructions and files, per Project", "Read and edit every line, in one place"],
        ["Best for", "Deep context for one initiative", "Durable facts that follow you everywhere"],
        ["Kept current by", "You, per workspace", "Agent proposals you approve"],
      ],
    },
    { type: "h2", text: "When to use which" },
    {
      type: "p",
      text: "Reach for Claude Projects when the context belongs to a body of work rather than to you. A Project is the right home for the documents, reference material, and standing instructions of one initiative, and Claude's depth inside that workspace is hard to beat.",
    },
    {
      type: "p",
      text: "Reach for a portable context file when the context is about you and should apply everywhere. Your role, how you want answers formatted, your current goals, and your hard constraints do not belong to a single Claude Project; they belong to every conversation in every tool. Repeating them across Projects, and again in ChatGPT and Cursor, is the tax a context file removes.",
    },
    {
      type: "ul",
      items: [
        "Project knowledge for one initiative: use Claude Projects.",
        "Facts about you that never change per workspace: use a context file.",
        "Working across Claude, ChatGPT, and Cursor: use a context file for the shared layer.",
        "You want to read and own exactly what an AI knows about you: use a context file.",
      ],
    },
    { type: "h2", text: "How they fit together with Creed" },
    {
      type: "p",
      text: "Creed keeps one structured profile with short sections like identity, goals, work, preferences, and constraints: the durable facts that change how any AI should respond. It connects to your agents over MCP, so Claude reads your context file before it answers, and so do ChatGPT and Cursor. Inside Claude you still use Projects for workspace depth; the context file simply makes sure the same you shows up in every one of them.",
    },
    {
      type: "p",
      text: "To connect Claude Code, add Creed as a remote MCP server and authorize it in the browser.",
    },
    {
      type: "code",
      lang: "bash",
      code: "claude mcp add -t http creed https://creed.md/mcp\n# then run /mcp in Claude Code to authorize",
    },
    {
      type: "p",
      text: "After that, Claude reads the file before meaningful work and proposes narrow updates you approve, while your Projects keep doing what they do best.",
    },
  ],
  faq: [
    {
      question: "Do Claude Projects replace a personal context file?",
      answer:
        "No. Claude Projects scope context to one workspace inside Claude and do it well. A personal context file is one profile about you that every tool reads, including Claude. They work best together: Projects for workspace depth, the context file for the facts that follow you everywhere.",
    },
    {
      question: "Can Claude read a portable context file?",
      answer:
        "Yes. With Creed you connect Claude over MCP, and it reads your context file before it answers, then can propose updates you approve. You still use Projects for per-workspace knowledge.",
    },
    {
      question: "What should go in the context file versus a Claude Project?",
      answer:
        "Put durable facts about you in the context file: your role, preferences, goals, and constraints. Put the documents and standing instructions for one initiative in a Claude Project. If it is about you, it belongs in the profile; if it is about the work, it belongs in the Project.",
    },
    {
      question: "Does Claude's memory move to other tools?",
      answer:
        "No. Claude's project knowledge and memory stay inside Claude. A portable context file lives outside any single app, so the same profile is read by ChatGPT, Cursor, and other agents as well as Claude.",
    },
  ],
  related: [
    { label: "ChatGPT memory vs a personal context file", href: "/learn/creed-vs-chatgpt-memory" },
    { label: "Connect Creed to Claude Code", href: "/learn/connect-creed-to-claude-code" },
    { label: "What is a personal context file", href: "/learn/what-is-a-personal-context-file" },
  ],
};
