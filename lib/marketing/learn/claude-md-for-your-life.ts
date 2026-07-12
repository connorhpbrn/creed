import type { Article } from "./types";

export const claudeMdForYourLife: Article = {
  slug: "claude-md-for-your-life",
  title: "CLAUDE.md for your life: the complete guide",
  description:
    "CLAUDE.md is the file Claude Code reads before working in a repo. Here is how to apply the same pattern to your whole life, where it breaks, and the upgrade path.",
  cluster: "category",
  datePublished: "2026-07-07",
  dateModified: "2026-07-07",
  lead:
    "CLAUDE.md is the file Claude Code reads before it does anything in a repository. It holds project instructions, conventions, and commands, so the agent starts every task already knowing how that codebase works instead of guessing. Developers love it because it turns repeated explanation into a file the tool reads for you.\n\nA CLAUDE.md for your life applies the same idea to you rather than a codebase. You write down who you are, how you work, your preferences, and your constraints once, and an agent reads it before it answers. It works, and it is a good habit. But a per-repo file has real limits: it lives in one repository, it does not travel to other tools, and nothing keeps it current except you.\n\nCreed is the portable version of that idea: one personal context file that every AI you connect reads before it answers, kept sharp by agent proposals you approve. This guide covers the pattern, its limits, and how to upgrade from a file in one repo to one profile every tool reads.",
  body: [
    { type: "h2", text: "What CLAUDE.md actually is" },
    {
      type: "p",
      text: "In Claude Code, CLAUDE.md is a Markdown file the agent loads automatically at the start of a session. It is where you put the things you would otherwise repeat: how to build and test the project, naming conventions, which directories matter, and any rules the agent should follow. The file lives in the repository, usually at the root, so it is versioned alongside the code and shared with everyone who clones it.",
    },
    {
      type: "p",
      text: "The reason it works is boring and powerful: the agent reads it before it acts. Instructions in a file that is always loaded beat instructions you remember to type sometimes. That single property, read-before-you-act, is the whole idea worth stealing.",
    },
    { type: "h2", text: "The idea: a CLAUDE.md for your whole life" },
    {
      type: "p",
      text: "If a per-repo file makes an agent better at that repo, a per-person file makes an agent better at you. Instead of build commands and conventions, you write down the durable facts an assistant should never have to ask for: your role, your goals, how you want answers formatted, and the limits it must respect.",
    },
    {
      type: "p",
      text: "A personal CLAUDE.md typically has a few short sections. It reads less like documentation and more like a briefing.",
    },
    {
      type: "ul",
      items: [
        "Who you are: name, location, role, and languages, in a few lines.",
        "How you work: your stack, how you make decisions, what you own.",
        "Preferences: answer-first vs explain-first, tone, format, hard style rules.",
        "Constraints: the limits an agent must never cross.",
      ],
    },
    {
      type: "p",
      text: "Written well, this file does the same job the project file does: the agent starts already knowing you, so you stop re-explaining yourself at the top of every session.",
    },
    { type: "h2", text: "Where a personal CLAUDE.md breaks down" },
    {
      type: "p",
      text: "The pattern is right, but a raw per-repo file was designed for a codebase, not a person. Three limits show up quickly.",
    },
    {
      type: "ul",
      items: [
        "Per-repo, not per-you: the file lives in one repository. Open a different project and the agent no longer sees it unless you copy it in.",
        "Not portable across tools: CLAUDE.md is a Claude Code convention. ChatGPT, Cursor, and other agents do not read it, so you end up maintaining a separate copy in each tool's memory or instructions.",
        "No proposal loop: nothing keeps it current. When a goal shifts or a preference sharpens, the file only changes if you remember to edit it, in every place you keep it.",
      ],
    },
    {
      type: "p",
      text: "The result is the same drift you were trying to avoid, just moved up a level. You now maintain several near-identical files, and they slowly disagree with each other and with you.",
    },
    { type: "h2", text: "Repo CLAUDE.md vs a personal context file" },
    {
      type: "table",
      caption: "A per-repo CLAUDE.md compared to a portable personal context file.",
      headers: ["Topic", "Repo CLAUDE.md", "Personal context file"],
      rows: [
        ["Scope", "One repository", "You, everywhere"],
        ["Read by", "Claude Code in that repo", "Every agent you connect"],
        ["Portable across tools", "No", "Yes, over MCP"],
        ["Stays current by", "You editing the file", "Agent proposals you approve"],
        ["Best for", "Project conventions and commands", "Durable facts about you"],
      ],
    },
    {
      type: "p",
      text: "This is not a knock on CLAUDE.md. For its job, project-scoped instructions versioned with the code, it is exactly right, and you should keep using it. The point is that your identity is not project-scoped, so it needs a home that is not either.",
    },
    { type: "h2", text: "The upgrade path" },
    {
      type: "p",
      text: "The move is to keep the read-before-you-act habit and drop the per-tool copies. Instead of a life file pasted into each repo and each app, you keep one portable context file and connect it to every agent.",
    },
    {
      type: "ol",
      items: [
        "Take the personal sections out of any repo CLAUDE.md; leave project conventions behind where they belong.",
        "Put them in one structured profile with clear sections for identity, work, preferences, and constraints.",
        "Connect that profile to your tools so each one reads it before it answers, rather than keeping its own copy.",
        "Let agents propose narrow updates as they learn something durable, so the file stays sharp instead of drifting.",
      ],
    },
    {
      type: "p",
      text: "Creed is that portable file. It is one personal context file that every AI you connect reads before it answers, connected over MCP to Claude Code, ChatGPT, Cursor, and others, so you write yourself down once and every tool sees the same page. It is plain Markdown you own, exportable and deletable at any time, and it integrates with GitHub if you want version control, the same versioning instinct that made CLAUDE.md feel natural in the first place.",
    },
  ],
  faq: [
    {
      question: "What is CLAUDE.md?",
      answer:
        "CLAUDE.md is a Markdown file Claude Code reads automatically at the start of a session in a repository. It holds project instructions, conventions, and commands, so the agent starts every task already knowing how that codebase works.",
    },
    {
      question: "Can I use a CLAUDE.md for personal, non-coding context?",
      answer:
        "Yes. You can write a personal CLAUDE.md with sections for who you are, how you work, your preferences, and your constraints. It works, but the file is per-repo and Claude Code specific, so other tools will not read it and nothing keeps it current on its own.",
    },
    {
      question: "Why does a per-repo file not work for personal context?",
      answer:
        "Your identity is not scoped to one repository or one tool. A CLAUDE.md lives in a single repo and is a Claude Code convention, so you end up copying it into every project and every app, and the copies drift apart. A portable context file every agent reads solves that.",
    },
    {
      question: "How is Creed different from a personal CLAUDE.md?",
      answer:
        "Creed is one context file that every AI you connect reads over MCP, not just Claude Code in one repo. It is portable across tools and agents propose narrow updates you approve, so it stays current instead of drifting across copies.",
    },
  ],
  related: [
    { label: "A personal CLAUDE.md template", href: "/learn/personal-claude-md-template" },
    { label: "What is a personal context file?", href: "/learn/what-is-a-personal-context-file" },
    { label: "Connect Creed to Claude Code", href: "/learn/connect-creed-to-claude-code" },
  ],
};
