import type { Article } from "./types";

export const browserExtensionVsMcpContext: Article = {
  slug: "browser-extension-vs-mcp-context",
  title: "Memory browser extensions vs MCP: two ways to give AI your context",
  description:
    "Browser-extension memory tools inject context into web chat UIs; MCP-connected context lets the agent read a file directly. Here is how the two compare and when each wins.",
  cluster: "comparison",
  datePublished: "2026-07-07",
  dateModified: "2026-07-07",
  lead:
    "There are two common ways to give an AI your context without retyping it. A browser-extension memory tool watches the chat you type into a web page and injects saved context into the prompt before you send it. An MCP-connected context file lets the agent itself read a structured file over a protocol, before it answers, in whatever tool you are using.\n\nThe difference is where the context enters. An extension works at the surface, in the browser, editing what goes into a web chat box. MCP works underneath, giving the agent a tool it can call to read your profile directly. That changes coverage, reliability, and portability in ways worth understanding before you pick one.\n\nExtensions are easy to start with and work in the chat UIs you already open in a browser. MCP context reaches beyond the browser into coding agents and terminal tools, and does not depend on a page layout staying the same. Creed is an MCP-connected context file: one Markdown profile that every agent you connect reads before it answers, whether that agent runs in a browser or not.",
  body: [
    { type: "h2", text: "How a browser-extension memory tool works" },
    {
      type: "p",
      text: "A browser extension sits in the page. When you type into a web chat like a hosted assistant, the extension detects the input box and prepends or injects your stored context so the model sees it. Everything happens at the browser surface: it is editing the text that gets submitted to a web UI you have open.",
    },
    {
      type: "p",
      text: "This is convenient because there is nothing to configure inside the agent. You install the extension, it recognizes the sites it supports, and it starts adding context. For someone who lives in one or two web chat interfaces, that can be enough.",
    },
    { type: "h2", text: "How MCP-connected context works" },
    {
      type: "p",
      text: "MCP is a protocol that lets an agent call tools. An MCP-connected context file exposes a read tool the agent invokes on its own, before meaningful work, to load your profile. The context does not depend on any page; the agent asks for it directly and factors it into the answer. Creed works this way: you connect it once, and the agent reads the file over MCP.",
    },
    {
      type: "p",
      text: "Because the agent reads the file itself, this reaches wherever the agent runs. Coding agents like Claude Code, Codex, and Cursor are not web chat boxes an extension can inject into, but they speak MCP, so they read the same profile a hosted chat does.",
    },
    { type: "h2", text: "The trade-offs, side by side" },
    {
      type: "table",
      caption: "Browser-extension memory tools compared to MCP-connected context.",
      headers: ["Topic", "Browser extension", "MCP-connected context"],
      rows: [
        ["Where context enters", "Injected into a web chat box", "Read by the agent as a tool call"],
        ["Coverage", "Sites the extension supports", "Any agent that speaks MCP"],
        ["Works in coding agents", "Usually no, they are not web pages", "Yes, coding agents speak MCP"],
        ["Reliability", "Depends on page layout staying stable", "Does not depend on a UI surface"],
        ["Portability", "Tied to the browser and its supported sites", "One profile follows you across tools"],
        ["What you own", "Varies by tool", "Plain Markdown you own and can export"],
      ],
    },
    { type: "h2", text: "Where the browser extension approach wins" },
    {
      type: "p",
      text: "Extensions have real strengths. They require no setup inside the agent, they can start injecting context the moment you install them, and they work in web chat interfaces that do not otherwise expose a way to load a profile. If your AI use is almost entirely a couple of hosted chat sites in a browser, an extension is the shortest path.",
    },
    {
      type: "p",
      text: "They can also inject context into tools that have no MCP support at all, which is a coverage gap MCP cannot fill for those specific surfaces.",
    },
    { type: "h2", text: "Where MCP context wins" },
    {
      type: "ul",
      items: [
        "Coverage beyond the browser: coding agents and terminal tools read the same profile.",
        "Reliability: the agent calls a tool, so there is no page layout to break against.",
        "Portability: one owned profile follows you across every agent you connect.",
        "Two-way updates: agents can propose narrow changes you approve, not just read.",
      ],
    },
    {
      type: "p",
      text: "With Creed, the profile is one structured Markdown file you own, organized into sections like Identity, Goals, Work, Preferences, and Routines. Connected agents read it before they answer and propose small updates as they learn something durable, which you approve or let trusted agents write directly.",
    },
    { type: "h2", text: "Which to choose" },
    {
      type: "p",
      text: "If you only use one or two web chat sites and want zero setup, a browser extension is a fair start. If you use AI across a browser and coding tools, or you want the context to be a portable file you own rather than an injection tied to a page, MCP-connected context fits better. The two can coexist, but MCP is the one that follows you everywhere the agent runs.",
    },
  ],
  faq: [
    {
      question: "What is the difference between a memory browser extension and MCP context?",
      answer:
        "A browser extension injects saved context into a web chat box at the page surface. MCP context lets the agent read a structured file directly through a protocol, before it answers, in any tool that speaks MCP.",
    },
    {
      question: "Do browser extensions work in coding agents like Cursor?",
      answer:
        "Usually not, because coding agents are not web pages an extension can inject into. Those agents speak MCP, so an MCP-connected context file like Creed reaches them while a browser extension typically cannot.",
    },
    {
      question: "Is MCP context more reliable than a browser extension?",
      answer:
        "It tends to be, because the agent calls a tool to read the file rather than depending on a specific page layout. Extensions can break when the sites they support change their interface.",
    },
    {
      question: "Can I use both at once?",
      answer:
        "Yes. An extension can cover a web chat site that lacks MCP support while MCP context covers coding agents and portability. Creed is the MCP-connected option, giving you one owned profile every connected agent reads.",
    },
  ],
  related: [
    { label: "Sync AI memory across tools", href: "/learn/sync-ai-memory-across-tools" },
    { label: "Memory MCP servers compared", href: "/learn/memory-mcp-servers-compared" },
    { label: "What is a personal context file", href: "/learn/what-is-a-personal-context-file" },
  ],
};
