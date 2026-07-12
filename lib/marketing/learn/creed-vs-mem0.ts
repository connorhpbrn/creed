import type { Article } from "./types";

export const creedVsMem0: Article = {
  slug: "creed-vs-mem0",
  title: "Creed vs mem0: two different jobs",
  description:
    "Creed and mem0 both deal in memory, but they do different jobs. mem0 is developer infrastructure for agent memory; Creed is a user-owned context profile every tool reads.",
  cluster: "comparison",
  datePublished: "2026-07-07",
  dateModified: "2026-07-07",
  lead:
    "Creed and mem0 are often compared because both involve memory for AI, but they solve different problems for different people. mem0 is developer infrastructure: a memory API and layer you embed inside agents and apps you build, so those systems can store and retrieve what a user said across sessions. Creed is a user-owned, human-readable context profile that every AI tool you connect reads before it answers.\n\nThe distinction is who the memory belongs to and where it lives. mem0 memory is managed by the application; it is designed for engineers wiring persistence into a product. Creed memory is one Markdown file you own, structured into sections, that follows you across ChatGPT, Claude, Cursor, and other agents over MCP.\n\nSo this is not really a head-to-head. If you are building an agent that needs to remember its users, mem0 is the kind of tool you reach for. If you are a person who wants every AI you use to already know who you are, Creed is the fit. Some teams even use both: mem0 inside a product, Creed for the humans building it.",
  body: [
    { type: "h2", text: "What mem0 is" },
    {
      type: "p",
      text: "mem0 is developer infrastructure for agent memory. It gives engineers an API and a memory layer to add to the agents and applications they build, so those systems can persist facts, retrieve relevant context, and carry state across sessions. It is a building block you integrate with code, aimed at people shipping AI products.",
    },
    {
      type: "p",
      text: "That framing matters. mem0 lives on the builder's side of the line. The memory it manages belongs to the application and its architecture, not to the end user as a portable document. When you evaluate mem0, you are evaluating a component for a system you are assembling.",
    },
    { type: "h2", text: "What Creed is" },
    {
      type: "p",
      text: "Creed is one personal context file that every AI reads before it answers. It is a structured Markdown profile organized into ten sections: five always-on core sections (Identity, Goals, Work, Preferences, Routines) plus optional Beliefs, Constraints, People, Health, and Context. Agents connect over MCP, read the file before meaningful work, and propose narrow updates you approve.",
    },
    {
      type: "p",
      text: "Creed sits on the user's side of the line. It is plain Markdown you own, with BYOK support, export, and delete at any time, and GitHub integration for version control. You do not need to write code to use it, and it works for anyone, not just developers.",
    },
    { type: "h2", text: "The honest comparison" },
    {
      type: "table",
      caption: "mem0 and Creed do different jobs; this table shows where each fits.",
      headers: ["Topic", "mem0", "Creed"],
      rows: [
        ["Audience", "Developers building agents and apps", "Anyone who uses AI tools"],
        ["Form factor", "Memory API and layer you integrate in code", "A Markdown context profile read over MCP"],
        ["Human-readable", "Not the primary interface; managed by the app", "Yes, plain Markdown you read and edit"],
        ["Portable to you", "Belongs to the application you build", "One file you own, read by every agent you connect"],
        ["Self-host", "Available as developer infrastructure", "Open source, free to self-host"],
        ["Best for", "Giving your product memory across sessions", "Giving every AI you use context about you"],
      ],
    },
    { type: "h2", text: "What mem0 is better at" },
    {
      type: "p",
      text: "If your goal is to build an application that remembers its users, mem0 is designed for exactly that. It is meant to be embedded in code, to scale with an app, and to handle retrieval and persistence as a system concern. Creed is not an agent memory backend and does not try to be. For that job, mem0 is the right category of tool.",
    },
    { type: "h2", text: "What Creed is better at" },
    {
      type: "p",
      text: "If you are a person who is tired of re-explaining your role, stack, goals, and preferences to every new chat, Creed is built for that. The profile is yours, readable, portable across tools, and kept current by agent proposals you approve rather than opaque heuristics buried in an app.",
    },
    {
      type: "ul",
      items: [
        "One profile that ChatGPT, Claude, Cursor, and other agents read before answering.",
        "Plain Markdown you own, with export, delete, and no lock-in.",
        "Updates proposed narrowly by your agents, approved by you.",
        "GitHub integration for version control of your own context.",
      ],
    },
    { type: "h2", text: "Which one you want" },
    {
      type: "p",
      text: "Pick mem0 when you are the builder and the memory belongs to the system you are shipping. Pick Creed when you are the user and you want the context to belong to you and follow you everywhere. They are not competitors; they answer different questions. If you build agents and also use AI daily, using both is reasonable: mem0 inside the product, Creed for yourself.",
    },
  ],
  faq: [
    {
      question: "Is Creed a replacement for mem0?",
      answer:
        "No. mem0 is developer infrastructure for adding memory to agents and apps you build. Creed is a user-owned context profile that every AI you connect reads before it answers. They solve different problems.",
    },
    {
      question: "Can I use mem0 and Creed together?",
      answer:
        "Yes. A team can use mem0 inside a product to give it memory across sessions while the people building it use Creed so their own AI tools know who they are. The two do not conflict.",
    },
    {
      question: "Do I need to be a developer to use Creed?",
      answer:
        "No. Creed is plain Markdown read over MCP and works for anyone who uses AI, not just developers. mem0, by contrast, is aimed at engineers integrating memory into code.",
    },
    {
      question: "Who owns the memory in each?",
      answer:
        "With mem0, memory belongs to the application you build and is managed as a system concern. With Creed, the profile is one Markdown file you own and can read, edit, export, or delete at any time.",
    },
  ],
  related: [
    { label: "Memory MCP servers compared", href: "/learn/memory-mcp-servers-compared" },
    { label: "What is a personal context file", href: "/learn/what-is-a-personal-context-file" },
    { label: "Browser extension vs MCP context", href: "/learn/browser-extension-vs-mcp-context" },
  ],
};
