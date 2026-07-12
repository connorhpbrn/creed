import type { Article } from "./types";

export const shareContextBetweenChatgptAndClaude: Article = {
  slug: "share-context-between-chatgpt-and-claude",
  title: "How to share context between ChatGPT and Claude",
  description:
    "ChatGPT and Claude do not share memory with each other. The durable fix is one context file both read over MCP. Here is the step-by-step setup.",
  cluster: "problem",
  datePublished: "2026-07-07",
  dateModified: "2026-07-07",
  lead:
    "ChatGPT and Claude do not share memory. Each keeps its own private store, and neither can read the other's. So the context you built up in ChatGPT means nothing to Claude, and you end up maintaining two half-versions of yourself, one in each app.\n\nYou can copy and paste a profile into both, and that works for a day. But the two copies drift apart the moment your work changes, and you are back to manual upkeep in two places. The manual approach does not scale past a tool or two.\n\nThe durable fix is to keep your context in one file that both tools read, rather than inside either app. Put the file in one place you own, connect it to ChatGPT and to Claude, and each reads the same profile before it answers. Creed is one personal context file that every AI reads before it answers; both ChatGPT and Claude connect to it over MCP, so a single profile stays consistent across both instead of living in two disconnected memories.",
  body: [
    { type: "h2", text: "Why the two apps can't see each other" },
    {
      type: "p",
      text: "ChatGPT memory and Claude's context are separate products from separate companies. There is no bridge between their memory stores, and there is not meant to be. Each is designed to make its own app better, not to sync with a competitor. That is reasonable, but it leaves you carrying your context between them by hand.",
    },
    {
      type: "p",
      text: "Pasting a blurb into both is the usual stopgap. It fixes one session and then rots: you update ChatGPT, forget Claude, and the two versions of you diverge. The only thing that stays consistent is a single source both apps read.",
    },
    { type: "h2", text: "The durable fix: one file both tools read" },
    {
      type: "p",
      text: "Move your context out of both apps and into one file you own. Then connect that file to each tool over MCP, an open way for agents to read external context, so ChatGPT and Claude both load the same profile before they answer. Update the file once and both tools see the change.",
    },
    {
      type: "p",
      text: "Creed is that file. It is plain Markdown organized into short sections: identity, goals, work, preferences, routines, and optional ones like constraints. The Creed MCP server uses OAuth, so there is nothing to copy: you add the server, click Allow on the Creed consent screen while signed in, and the tool can read your profile.",
    },
    { type: "h2", text: "Connect Claude Code" },
    {
      type: "p",
      text: "Add Creed as a remote MCP server, then authorize it from inside Claude Code.",
    },
    {
      type: "code",
      lang: "bash",
      code: "claude mcp add -t http creed https://creed.md/mcp",
    },
    {
      type: "ol",
      items: [
        "Run the command above to register the Creed server.",
        "In Claude Code, run /mcp to start authorization.",
        "Your browser opens the Creed consent screen; while signed in to creed.md, click Allow.",
        "Verify by listing the MCP tools and calling read_creed once.",
      ],
    },
    { type: "h2", text: "Connect ChatGPT" },
    {
      type: "ol",
      items: [
        "In ChatGPT, open Settings and go to Connectors.",
        "Add a custom or remote MCP server pointing to https://creed.md/mcp.",
        "When prompted, authorize it: sign in to creed.md and click Allow on the Creed consent screen.",
        "Confirm ChatGPT can see the Creed tools, then let it read your profile before meaningful work.",
      ],
    },
    {
      type: "p",
      text: "Both connections point at the same server and the same file. Once both are authorized, ChatGPT and Claude read one profile, and a change you make flows to both without any copy and paste.",
    },
    {
      type: "table",
      caption: "Sharing context by hand vs one file both tools read.",
      headers: ["Topic", "Copy and paste", "One context file over MCP"],
      rows: [
        ["Stays in sync", "No, copies drift", "Yes, both read one file"],
        ["Manual upkeep", "Every change, twice", "Update once"],
        ["Works beyond two tools", "Poorly", "Yes, any tool you connect"],
        ["You own the source", "Scattered notes", "One file you control"],
      ],
    },
    { type: "h2", text: "Keeping the shared file current" },
    {
      type: "p",
      text: "A shared file is only as good as its freshness. With Creed, connected agents read the profile before meaningful work and propose narrow updates as they learn something durable about you, which you approve. The get_write_policy tool reports whether a given edit applies directly or arrives as a proposal, so you stay in control of what changes.",
    },
    {
      type: "p",
      text: "The result is one profile, two tools, no divergence. ChatGPT and Claude still keep their own in-app memory if you want it, but the context that matters lives in a file both of them read, and that is what makes it consistent.",
    },
  ],
  faq: [
    {
      question: "Can ChatGPT and Claude share memory directly?",
      answer:
        "No. They are separate products and keep separate memory stores with no bridge between them. To make them consistent, you have to give both tools one shared source they can each read, rather than syncing their internal memories.",
    },
    {
      question: "How do I share context between ChatGPT and Claude?",
      answer:
        "Keep your context in one file and connect it to both tools over MCP. Add the Creed server at https://creed.md/mcp in each app, authorize with OAuth, and both read the same profile before they answer.",
    },
    {
      question: "Is there anything to copy or paste with MCP?",
      answer:
        "No. The Creed MCP connection uses OAuth, so you add the server, click Allow on the consent screen while signed in to creed.md, and the tool can read your profile. There are no keys to copy.",
    },
    {
      question: "Will the shared context stay up to date?",
      answer:
        "Yes, if you maintain it. Connected agents propose small updates as they learn something durable, and you approve what stays. Because both tools read the same file, one update reaches both.",
    },
  ],
  related: [
    {
      label: "Sync AI memory across tools",
      href: "/learn/sync-ai-memory-across-tools",
    },
    {
      label: "Connect Creed to ChatGPT",
      href: "/learn/connect-creed-to-chatgpt",
    },
    {
      label: "Connect Creed to Claude Code",
      href: "/learn/connect-creed-to-claude-code",
    },
  ],
};
