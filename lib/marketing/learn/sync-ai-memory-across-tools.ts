import type { Article } from "./types";

export const syncAiMemoryAcrossTools: Article = {
  slug: "sync-ai-memory-across-tools",
  title: "How to sync your AI context across ChatGPT, Claude, and Cursor",
  description:
    "Per-tool memory does not sync between apps. The way to keep ChatGPT, Claude, and Cursor consistent is one context file each reads over MCP. Here is how.",
  cluster: "problem",
  datePublished: "2026-07-07",
  dateModified: "2026-07-07",
  lead:
    "AI memory does not sync across tools, because each tool keeps its own private store. ChatGPT's memory, Claude's context, and Cursor's settings are separate, and none of them can read the others. So there is no built-in switch that makes them consistent, and trying to keep three in-app memories aligned by hand is a losing game.\n\nThe way to actually sync is to stop relying on per-tool memory and keep one context file that every tool reads instead. Put your durable facts in a file you own, connect each tool to it, and every agent loads the same profile before it answers. Change the file once, and all of them see the update.\n\nCreed works this way. It is one personal context file that every AI reads before it answers, connected to your agents over MCP. Rather than syncing three memories, you give ChatGPT, Claude, and Cursor a single source of truth, so they stay consistent because they are all reading the same page.",
  body: [
    { type: "h2", text: "Why per-tool memory does not sync" },
    {
      type: "p",
      text: "Each AI tool builds its own memory to make its own app better. Those stores are private to the vendor, in formats you cannot fully see, with no bridge to a competitor. There is no shared bus for AI memory, so there is nothing to sync in the usual sense. What one tool learns stays in that tool.",
    },
    {
      type: "p",
      text: "You can paste the same profile into all three, but the copies drift the moment your work changes, and you are now maintaining three versions of yourself. Manual copies are the opposite of sync: they multiply the upkeep instead of removing it.",
    },
    { type: "h2", text: "The model that does stay consistent" },
    {
      type: "p",
      text: "Instead of syncing memories, share a source. Keep one context file that lives outside every app, and connect each tool to it so the file, not the app, is the source of truth. When every tool reads the same file, they are consistent by construction: there is only one thing to update.",
    },
    {
      type: "p",
      text: "Creed is that file: plain Markdown you own, organized into short sections like identity, goals, work, preferences, and constraints. Tools connect over MCP, an open way for agents to read external context, and the Creed server uses OAuth, so there is nothing to copy. You add the server, click Allow on the consent screen while signed in to creed.md, and the tool can read your profile.",
    },
    { type: "h2", text: "How each tool connects" },
    {
      type: "table",
      caption: "Connecting ChatGPT, Claude Code, and Cursor to one context file.",
      headers: ["Tool", "How you connect", "Where you authorize"],
      rows: [
        [
          "ChatGPT",
          "Settings > Connectors > add a custom or remote MCP server at https://creed.md/mcp",
          "Click Allow on the Creed consent screen",
        ],
        [
          "Claude Code",
          "Run claude mcp add -t http creed https://creed.md/mcp",
          "Run /mcp in Claude Code, then Allow in the browser",
        ],
        [
          "Cursor",
          "Add a remote MCP server in Cursor settings pointing to https://creed.md/mcp",
          "Authorize in the browser with Allow",
        ],
      ],
    },
    { type: "h2", text: "Setup, step by step" },
    {
      type: "ol",
      items: [
        "Write your durable context into one file: who you are, current goals, how you work, your preferences, hard constraints.",
        "Add the Creed MCP server to each tool using https://creed.md/mcp.",
        "Authorize each connection with OAuth: sign in to creed.md and click Allow.",
        "Verify by listing the MCP tools in each app and calling read_creed once.",
        "Let each agent read the file before meaningful work and propose small updates as your work shifts.",
      ],
    },
    {
      type: "p",
      text: "For Claude Code specifically, the command to register the server is short.",
    },
    {
      type: "code",
      lang: "bash",
      code: "claude mcp add -t http creed https://creed.md/mcp",
    },
    { type: "h2", text: "Keeping every tool current" },
    {
      type: "p",
      text: "Once all three read the same file, staying in sync is automatic: you update the file once and every connected tool picks it up on its next read. With Creed, agents propose narrow updates as they learn something durable, and you approve what stays. The get_write_policy tool reports whether an edit applies directly or arrives as a proposal, so you keep control.",
    },
    {
      type: "p",
      text: "You can still leave each tool's built-in memory on for app-specific niceties. But the context that has to be consistent across ChatGPT, Claude, and Cursor lives in one file they all read, which is why it actually stays in sync.",
    },
  ],
  faq: [
    {
      question: "Can I sync ChatGPT, Claude, and Cursor memory automatically?",
      answer:
        "Not directly. Each tool keeps a private memory with no bridge to the others. The reliable path is to keep one context file every tool reads, so there is a single source to update instead of three memories to reconcile.",
    },
    {
      question: "Do I need API keys to connect the tools?",
      answer:
        "No. The Creed MCP connection uses OAuth. You add the server at https://creed.md/mcp in each tool, click Allow on the consent screen while signed in to creed.md, and the tool can read your profile.",
    },
    {
      question: "What happens when I update my context?",
      answer:
        "Because every tool reads the same file, one update reaches all of them on their next read. You do not touch each app individually, which is what keeps them consistent.",
    },
    {
      question: "Should I still use each tool's built-in memory?",
      answer:
        "You can. In-app memory is fine for app-specific convenience. Just keep the context that must be consistent across tools in the shared file, since built-in memory never crosses between apps.",
    },
  ],
  related: [
    {
      label: "Share context between ChatGPT and Claude",
      href: "/learn/share-context-between-chatgpt-and-claude",
    },
    {
      label: "Connect Creed to Cursor",
      href: "/learn/connect-creed-to-cursor",
    },
    {
      label: "Browser extension vs MCP context",
      href: "/learn/browser-extension-vs-mcp-context",
    },
  ],
};
