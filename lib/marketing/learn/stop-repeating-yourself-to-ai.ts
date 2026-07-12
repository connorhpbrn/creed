import type { Article } from "./types";

export const stopRepeatingYourselfToAi: Article = {
  slug: "stop-repeating-yourself-to-ai",
  title: "Tired of re-explaining yourself to every AI?",
  description:
    "You retype the same context in every new chat and every new tool. Here is the re-explaining tax, why the usual fixes do not stick, and the one file that ends it.",
  cluster: "problem",
  datePublished: "2026-07-07",
  dateModified: "2026-07-07",
  lead:
    "If you use AI often, you pay a re-explaining tax. Every new chat starts cold, so you retype your role, your project, your tone, and the constraints you have already stated a dozen times. Then you open a second tool and do it all again, because what you told ChatGPT never reaches Claude or Cursor. The cost per message is small. Over a year, across tools, it is enormous.\n\nMost people try to patch it. They fill in custom instructions, paste a blurb at the top of important chats, or lean on built-in memory. Each helps a little, and none of it sticks. Instructions are capped and app-bound. Pasted blurbs are manual and go stale. Memory is opaque and trapped inside one vendor. So the tax keeps getting charged.\n\nThe fix is to write yourself down once and have every tool read the same page. Keep one structured context file that describes who you are and how you want AI to work, and connect it to the agents you use so it is read before every answer. Creed is that file: one personal context file that every AI reads before it answers, so you explain yourself once instead of forever.",
  body: [
    { type: "h2", text: "The re-explaining tax" },
    {
      type: "p",
      text: "The tax has two forms. The first is per-chat: even inside one tool, a fresh conversation does not know your role, your stack, or the preferences you set last week, so you restate them. The second is per-tool: what one app learns never crosses to another, so every new tool is a blank slate.",
    },
    {
      type: "p",
      text: "Neither is dramatic on its own. Together they mean you spend a real slice of every AI session priming the model to know things you have already said. The work is not the answer; it is getting the tool ready to give one.",
    },
    { type: "h2", text: "What people try, and why it does not stick" },
    {
      type: "p",
      text: "The common patches all address a symptom without moving your context out of the app it is stuck in.",
    },
    {
      type: "ul",
      items: [
        "Custom instructions: short, per-account, and ChatGPT-only. Good for a summary, useless outside ChatGPT.",
        "Pasting a blurb: works for one chat, but it is manual, easy to forget, and the copy drifts out of date the moment your work changes.",
        "Built-in memory: helps inside a single vendor, but it is opaque about what it kept and never reaches your other tools.",
      ],
    },
    {
      type: "p",
      text: "The pattern is the same each time. The context lives inside one tool, in a form you cannot fully see or move. So it does not persist across sessions in a trustworthy way, and it does not travel across tools at all.",
    },
    { type: "h2", text: "The fix: one file every agent reads" },
    {
      type: "p",
      text: "Stop storing your context inside chatbots. Put it in a file you own, and connect that file to every tool so each one reads it before it answers. The file becomes the single source of truth, and the apps become readers of it rather than owners of it.",
    },
    {
      type: "p",
      text: "Creed does this with one structured Markdown profile, organized into short sections: identity, goals, work, preferences, routines, plus optional constraints and more. Your agents connect over MCP and read the file before meaningful work, then propose small updates as they learn something durable, which you approve. You write yourself down once; every tool starts from the same page.",
    },
    {
      type: "table",
      caption: "How the usual patches compare to one shared context file.",
      headers: ["Topic", "Persists across chats", "Works across tools", "You can read and edit it"],
      rows: [
        ["Custom instructions", "Inside one app", "No", "Yes, but capped"],
        ["Pasting a blurb", "Only if you paste it", "Only where you paste it", "Yes, but goes stale"],
        ["Built-in memory", "Inside one app", "No", "Partly"],
        ["One context file", "Yes", "Yes", "Yes, plain Markdown you own"],
      ],
    },
    { type: "h2", text: "What good looks like" },
    {
      type: "p",
      text: "The aim is not to write everything about yourself. It is to keep the handful of durable facts that actually change how an AI should respond, in a form any tool can read. Specific over complete: if a line would not change an answer, leave it out.",
    },
    {
      type: "ol",
      items: [
        "Write the durable basics once: who you are, what you are working toward, how you work, how you want AI to respond.",
        "Cut anything that would not change an answer, and anything only true this week.",
        "Connect the file to each tool so it is read before every meaningful reply.",
        "Let your agents propose updates as your work shifts, and approve what stays.",
      ],
    },
    {
      type: "p",
      text: "Do that and the tax disappears. The next new chat, in any tool, already knows your role, your voice, and your constraints, because it read the same file the last one did. You spend your AI time on the work, not on introducing yourself again.",
    },
  ],
  faq: [
    {
      question: "Why do I have to keep re-explaining myself to AI?",
      answer:
        "Because context lives inside each app. New chats start cold, and what one tool learns never reaches another. Until your context lives in one file every tool reads, you keep restating the same facts.",
    },
    {
      question: "Do custom instructions or memory solve this?",
      answer:
        "Only partly. They help inside a single app but do not cross to your other tools, and they are hard to see or move. They reduce repetition in one place while leaving the cross-tool problem untouched.",
    },
    {
      question: "What actually stops the repetition?",
      answer:
        "One portable context file that every tool reads before it answers. You write your durable facts once, connect the file to each agent, and every new chat starts already knowing you.",
    },
    {
      question: "Won't a context file also go stale?",
      answer:
        "It can, unless it is maintained. With Creed, connected agents propose small updates as they learn something durable, and you approve what stays, so the file tracks your real life instead of drifting.",
    },
  ],
  related: [
    {
      label: "Why ChatGPT forgets you",
      href: "/learn/why-chatgpt-forgets-you",
    },
    {
      label: "Share context between ChatGPT and Claude",
      href: "/learn/share-context-between-chatgpt-and-claude",
    },
    {
      label: "What is a personal context file",
      href: "/learn/what-is-a-personal-context-file",
    },
  ],
};
