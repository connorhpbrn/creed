import type { Article } from "./types";

export const personalContextFileTemplate: Article = {
  slug: "personal-context-file-template",
  title: "Personal context file template",
  description:
    "A complete, copyable ten-section template for a personal context file, plus guidance on what belongs in each section and what to leave out.",
  cluster: "category",
  datePublished: "2026-07-07",
  dateModified: "2026-07-07",
  lead:
    "A personal context file is one structured Markdown profile that every AI you connect reads before it answers. This is a full template you can copy today. It has ten sections: five always-on core sections that everyone fills in, Identity, Goals, Work, Preferences, and Routines, plus five optional ones, Beliefs, Constraints, People, Health, and Context, that you add only when they earn their place.\n\nCopy the template below, delete the placeholder lines, and replace them with facts that actually change how an AI should respond to you. The guiding rule is specific over complete: a short profile that changes answers beats a long one that reads like a resume. If a line would not change what an assistant says, leave it out.\n\nYou can keep this file anywhere and paste it into each tool by hand. Creed keeps the same ten-section profile live, connects it to your agents over MCP, and lets them propose narrow updates you approve, so the file follows you across every tool and stays current without manual copying.",
  body: [
    { type: "h2", text: "The template" },
    {
      type: "p",
      text: "Copy this whole block into a Markdown file. The bracketed lines are prompts, not real content; replace each one with a single specific fact, or delete it. The optional sections at the bottom can be removed entirely until you need them.",
    },
    {
      type: "code",
      lang: "markdown",
      code: "# Identity\n- I am Maya Okonkwo, based in Lisbon (WET/WEST).\n- I run a two-person design studio; I am the lead and the operator.\n- Native English, fluent Portuguese. I write in English.\n\n# Goals\n- Ship the studio's new portfolio site by end of Q3.\n- Land two retainer clients this year, not one-off projects.\n- Learn enough SQL to stop asking a contractor for every report.\n\n# Work\n- Brand and product design for early-stage startups.\n- Tools: Figma, Notion, Linear, a little HTML/CSS.\n- I bill by project, not by hour. I protect deep-work mornings.\n- Decisions I own: scope, pricing, hiring. My partner owns delivery.\n\n# Preferences\n- Answer first, then explain. Lead with the recommendation.\n- Be direct. Skip preamble and hedging.\n- Use British spelling. No em dashes.\n- For code, give me the whole file, not a diff.\n\n# Routines\n- Deep work 08:00-12:00; no meetings before noon.\n- Fridays are admin and invoicing.\n- I plan the week on Sunday evening.\n\n# Beliefs (optional)\n- I would rather ship something small and real than plan something big.\n\n# Constraints (optional)\n- No calls after 18:00. Do not suggest tools that need a US bank account.\n\n# People (optional)\n- Tom is my studio partner and handles all client delivery.\n- Priya is my accountant; route tax questions to her, not me.\n\n# Health (optional)\n- I manage migraines; keep long reading tasks broken into chunks.\n\n# Context (optional)\n- Currently rebranding the studio from \"Okonkwo Design\" to \"Field\".",
    },
    { type: "h2", text: "Identity" },
    {
      type: "p",
      text: "The handful of lines an AI should never get wrong: your name, where you are, what you do, and the languages you work in. Keep it to facts that frame every answer.",
    },
    {
      type: "ul",
      items: [
        "Include: name, location and timezone, your role in one line, working languages.",
        "Avoid: biography, backstory, or anything that reads like an About page.",
      ],
    },
    { type: "h2", text: "Goals" },
    {
      type: "p",
      text: "What you are working toward right now, so advice points the right way. Goals date faster than anything else in the file, so keep them current.",
    },
    {
      type: "ul",
      items: [
        "Include: two to four concrete near-term goals with a rough horizon.",
        "Avoid: vague aspirations (\"grow\", \"be happier\") and goals you finished months ago.",
      ],
    },
    { type: "h2", text: "Work" },
    {
      type: "p",
      text: "Your role, your stack, and how you actually operate, including which decisions are yours to make. This is the section that makes work advice land.",
    },
    {
      type: "ul",
      items: [
        "Include: what you do, the tools you use, how you bill or measure output, what you own.",
        "Avoid: your full org chart or a tool you tried once and dropped.",
      ],
    },
    { type: "h2", text: "Preferences" },
    {
      type: "p",
      text: "How you want AI to talk to you: format, tone, spelling, and the assumptions it should default to. This is the section that changes the most answers per line.",
    },
    {
      type: "ul",
      items: [
        "Include: answer-first vs explain-first, tone, spelling rules, code format, hard style rules.",
        "Avoid: preferences you are not sure you hold, or ones that contradict each other.",
      ],
    },
    { type: "h2", text: "Routines" },
    {
      type: "p",
      text: "The shape of your week that context-aware suggestions should respect, so an assistant does not propose a call during your deep-work block.",
    },
    {
      type: "ul",
      items: [
        "Include: recurring blocks, protected hours, planning rhythms.",
        "Avoid: one-off events and a full calendar dump.",
      ],
    },
    { type: "h2", text: "The optional sections" },
    {
      type: "p",
      text: "Beliefs, Constraints, People, Health, and Context are off by default. Add one only when it would change an answer, and remove it when it stops mattering.",
    },
    {
      type: "table",
      caption: "The five optional sections and what belongs in each.",
      headers: ["Section", "Add it when", "Keep out"],
      rows: [
        ["Beliefs", "A value should steer trade-offs and recommendations", "Politics or opinions with no bearing on your work"],
        ["Constraints", "There are hard limits AI must never cross", "Soft preferences that already live under Preferences"],
        ["People", "Recurring names change how you route or delegate", "Your full contact list"],
        ["Health", "A durable factor should shape pacing or suggestions", "Symptoms that are only true this week"],
        ["Context", "A current situation reframes near-term advice", "A running journal of your day"],
      ],
    },
    { type: "h2", text: "Keeping the template alive" },
    {
      type: "p",
      text: "A template is a starting point; the value is in keeping it true. Written by hand, that means editing the file and repasting it into each tool whenever something changes. Creed keeps this same ten-section profile in one place, lets every connected agent read it before it answers, and has agents propose narrow updates as they learn something durable about you, so the file stays sharp instead of just longer.",
    },
  ],
  faq: [
    {
      question: "What sections should a personal context file have?",
      answer:
        "Five core sections everyone fills in: Identity, Goals, Work, Preferences, and Routines. Then five optional ones, Beliefs, Constraints, People, Health, and Context, added only when a line in them would change how an AI responds.",
    },
    {
      question: "How long should a personal context file be?",
      answer:
        "Short enough that every line earns its place. Aim for facts that change answers, not completeness. A tight one-page profile beats a multi-page resume, because an AI reads the whole thing before every reply.",
    },
    {
      question: "Can I just copy this template and use it everywhere?",
      answer:
        "Yes. Fill it in, save it as Markdown, and paste it into each tool's custom instructions or memory. To skip the manual copying and keep it current, use Creed, which connects the same ten-section profile to your agents over MCP.",
    },
    {
      question: "What should I leave out of a context file?",
      answer:
        "Session chatter, moods, one-off tasks, and anything only true today. Also leave out facts that would not change an answer. The file is a durable profile, not a diary or a scratchpad.",
    },
  ],
  related: [
    { label: "What is a personal context file?", href: "/learn/what-is-a-personal-context-file" },
    { label: "CLAUDE.md for your life", href: "/learn/claude-md-for-your-life" },
    { label: "about-me.md: give every AI the same introduction", href: "/learn/about-me-md" },
  ],
};
