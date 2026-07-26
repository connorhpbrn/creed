import type { Article } from "./types";

export const connectYourTools: Article = {
  slug: "connect-your-tools",
  title: "Connect your tools",
  description:
    "Add Creed as an MCP server in Cursor, Claude Code, or ChatGPT. OAuth once, then every agent reads the same profile.",
  cluster: "integration",
  datePublished: "2026-07-07",
  dateModified: "2026-07-26",
  lead:
    "Creed connects over MCP at https://creed.md/mcp. Authorize once with OAuth in each tool. After that, the agent can read your profile before it works, and propose updates you approve.\n\nNo API key to paste. Same profile in every tool.",
  body: [
    { type: "h2", text: "Cursor" },
    {
      type: "ol",
      items: [
        "Open Cursor settings → MCP servers.",
        "Add a remote MCP server: https://creed.md/mcp",
        "Authorize in the browser; click Allow while signed in to creed.md.",
        "Ask Cursor to call read_creed once to verify.",
      ],
    },
    { type: "h2", text: "Claude Code" },
    {
      type: "code",
      lang: "bash",
      code: "claude mcp add -t http creed https://creed.md/mcp",
      parts: [
        { text: "claude", className: "hljs-built_in" },
        { text: " " },
        { text: "mcp", className: "hljs-title" },
        { text: " " },
        { text: "add" },
        { text: " " },
        { text: "-t", className: "hljs-attribute" },
        { text: " " },
        { text: "http", className: "hljs-string" },
        { text: " " },
        { text: "creed", className: "hljs-string" },
        { text: " " },
        { text: "https://creed.md/mcp", className: "hljs-string" },
      ],
    },
    {
      type: "ol",
      items: [
        "Run /mcp in Claude Code and authorize the creed server.",
        "Click Allow on the Creed consent screen.",
        "Call read_creed once to verify.",
      ],
    },
    { type: "h2", text: "ChatGPT" },
    {
      type: "ol",
      items: [
        "Open Settings → Connectors.",
        "Add a custom / remote MCP server: https://creed.md/mcp",
        "Authorize; click Allow while signed in to creed.md.",
        "Call read_creed once to verify.",
      ],
    },
    {
      type: "p",
      text: "Custom MCP connectors in ChatGPT depend on plan and rollout. If you do not see the option yet, your plan may not expose it.",
    },
    { type: "h2", text: "After you connect" },
    {
      type: "ul",
      items: [
        "Agents read your Creed before meaningful work.",
        "Durable updates arrive as proposals (or direct edits if you allow them).",
        "get_write_policy tells an agent which mode you are in.",
      ],
    },
  ],
  faq: [
    {
      question: "Is there a token to paste?",
      answer:
        "No. Creed MCP uses OAuth. You authorize in the browser by clicking Allow.",
    },
    {
      question: "What is the MCP URL?",
      answer: "https://creed.md/mcp",
    },
    {
      question: "How do I verify a connection?",
      answer:
        "Confirm the server shows as connected, then have the agent call read_creed once and check your sections return.",
    },
  ],
  related: [
    { label: "Personal context file", href: "/learn/personal-context-file" },
    { label: "Re-explaining tax", href: "/learn/re-explaining-tax" },
    { label: "Memory vs a context file", href: "/learn/memory-vs-context-file" },
    { label: "Read the docs", href: "/docs" },
  ],
};
