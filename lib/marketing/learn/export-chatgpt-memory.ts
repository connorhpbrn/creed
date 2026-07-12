import type { Article } from "./types";

export const exportChatgptMemory: Article = {
  slug: "export-chatgpt-memory",
  title: "How to export ChatGPT's memory and make it portable",
  description:
    "You can view and manage ChatGPT's saved memories and export your account data, but the export is not a clean profile. Here is how to do both and make it portable.",
  cluster: "problem",
  datePublished: "2026-07-07",
  dateModified: "2026-07-07",
  lead:
    "ChatGPT does not offer a one-click way to export its memory as a tidy profile. What you can do is two things: review and manage the saved memories inside ChatGPT's settings, and request a full export of your account data through data controls. The data export is broad and includes your conversations, so it is a raw archive rather than a neat summary of what ChatGPT knows about you.\n\nThat matters, because the useful thing is not the archive itself. It is the handful of durable facts buried in it: your role, your goals, your preferences, your constraints. The export gives you the raw material; it does not hand you a portable profile, and nothing about it will be read by Claude or Cursor.\n\nSo the real task is to distill what you find into one context file that every tool reads. Skim your saved memories and export, pull out the lines that would change how any AI answers, and write them into a file you own. Creed is one personal context file that every AI reads before it answers, so once you have distilled your ChatGPT memory into it, that context becomes portable across all your tools instead of staying locked in one app.",
  body: [
    { type: "h2", text: "View and manage saved memories" },
    {
      type: "p",
      text: "Start inside ChatGPT. In settings, under personalization, you can see the memories ChatGPT has saved and delete any you no longer want. This is the clearest window into what ChatGPT is explicitly holding about you, and it is worth reading before you export anything.",
    },
    {
      type: "p",
      text: "Be realistic about what this shows. Saved memories are the explicit facts. They do not include everything the model may infer from your chat history, and there is no button that prints the complete profile the model works from. So treat this list as a strong starting point, not the whole picture.",
    },
    { type: "h2", text: "Export your account data" },
    {
      type: "ol",
      items: [
        "Open ChatGPT settings and find data controls.",
        "Choose the option to export your data.",
        "Confirm the request; ChatGPT prepares an archive and emails you a download link.",
        "Download and unzip the archive when it arrives.",
      ],
    },
    {
      type: "p",
      text: "What you get is broad: a data export of your account, including your conversation history, in a raw format. It is not a curated profile, and it is not organized around who you are. Do not overstate it: this is an archive to mine, not a ready-made context file.",
    },
    { type: "h2", text: "Distill it into durable facts" },
    {
      type: "p",
      text: "The value is in the distillation. Read your saved memories and skim the export for the facts that actually change how an AI should respond, and leave the rest behind. The test is simple: if a line would not change an answer, it does not belong in your profile.",
    },
    {
      type: "ul",
      items: [
        "Identity: who you are, in a few lines an AI should never get wrong.",
        "Goals: what you are working toward now, so advice points the right way.",
        "Work: your role, stack, and how you actually operate.",
        "Preferences: tone, format, and the assumptions you want AI to make.",
        "Constraints: the hard limits that should shape every answer.",
      ],
    },
    { type: "h2", text: "Make it portable" },
    {
      type: "p",
      text: "Write those distilled facts into one context file you own, and connect it to your tools so each reads it before answering. This is the step that turns a locked, in-app memory into portable context. Creed keeps it as plain Markdown, organized into short sections, connected to your agents over MCP. Because it is a file rather than a vendor's memory, it is portable by design, and you can read, edit, export, or delete it whenever you want.",
    },
    {
      type: "table",
      caption:
        "What the ChatGPT export gives you, and what a portable file adds.",
      headers: ["Topic", "ChatGPT export", "Portable context file"],
      rows: [
        ["Format", "Raw archive with chat history", "Structured Markdown profile"],
        ["Curated to who you are", "No", "Yes, distilled to durable facts"],
        ["Read by other tools", "No", "Yes, every agent you connect"],
        ["Stays current", "Snapshot in time", "Updated via agent proposals you approve"],
      ],
    },
    { type: "h2", text: "Keep it fresh after the move" },
    {
      type: "p",
      text: "A one-time distillation goes stale like any snapshot. Once your context lives in a file, connected agents can read it before meaningful work and propose small updates as they learn something durable, which you approve. That way the profile tracks your real life instead of freezing at the moment you exported.",
    },
    {
      type: "p",
      text: "You can leave ChatGPT memory on afterward if you like it. The difference is that the context worth keeping no longer lives only inside ChatGPT. It lives in a file you own that every tool reads, which is what makes it portable.",
    },
  ],
  faq: [
    {
      question: "Can I export ChatGPT's memory directly?",
      answer:
        "Not as a clean profile. You can view and delete saved memories in settings, and you can export your account data through data controls, but that export is a raw archive of your account and conversations, not a curated summary of what ChatGPT knows.",
    },
    {
      question: "Does the ChatGPT data export contain everything it knows about me?",
      answer:
        "No. It contains your account data and chat history, but not necessarily a tidy record of everything the model infers. Treat it as raw material to distill, not a finished profile.",
    },
    {
      question: "How do I make my ChatGPT memory usable in other tools?",
      answer:
        "Distill the durable facts from your saved memories and export into one context file, then connect that file to your other tools. Other apps cannot read ChatGPT's memory, but they can read a shared file you own.",
    },
    {
      question: "Will I have to redo this every time my context changes?",
      answer:
        "No, if you keep the context in a maintained file. With Creed, connected agents propose small updates as they learn something durable and you approve what stays, so the profile stays current without another full export.",
    },
  ],
  related: [
    {
      label: "Why ChatGPT forgets you",
      href: "/learn/why-chatgpt-forgets-you",
    },
    {
      label: "Sync AI memory across tools",
      href: "/learn/sync-ai-memory-across-tools",
    },
    {
      label: "What is a personal context file",
      href: "/learn/what-is-a-personal-context-file",
    },
  ],
};
