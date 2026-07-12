import type { Article } from "./types";

export const tabAutocomplete: Article = {
  slug: "tab-autocomplete",
  title: "Tab: autocomplete for your context file",
  description:
    "Press Tab while editing your Creed and it finishes the thought in your voice, drawn from your whole file. How it works, what it costs, and why it gets sharper as your file does.",
  cluster: "category",
  datePublished: "2026-07-12",
  dateModified: "2026-07-12",
  lead:
    "Tab is Creed's in-editor autocomplete. Put your cursor anywhere in a section, press Tab once, and a suggestion streams in as ghost text: the rest of the sentence, written in your voice, drawn from everything else in your file. Press Tab again to accept it, press Escape to dismiss it, or just keep typing and it gets out of your way.\n\nIt is not the per-keystroke prediction you know from code editors. Tab only runs when you ask, it completes one thought at a time, and it never invents facts about you. It can only recombine and extend what is already in your file or clearly implied by what you just typed. If it does not know your deploy tooling, it writes up to the gap and stops rather than guessing.\n\nThat design means Tab compounds. With one thin section, it can only offer structure. With a full file, it completes a Preferences line with your actual tools, your actual constraints, your actual people, because it read them in your other sections. The sharper your Creed, the sharper Tab writes.",
  body: [
    { type: "h2", text: "How it works" },
    {
      type: "p",
      text: "Every press sends your whole visible Creed plus the text around your cursor to a fast model, with one standing instruction set: match your voice and formatting, be specific, and never invent a fact that is not in the file. The suggestion streams back as tinted ghost text at your cursor, usually in well under a second.",
    },
    {
      type: "ul",
      items: [
        "Tab once: one suggestion appears as ghost text.",
        "Tab again: accept the whole suggestion.",
        "Cmd or Ctrl plus Right Arrow: accept it one word at a time.",
        "Escape, or any keystroke: dismiss it and keep what you typed.",
        "Tab in an empty section: a short drafted opening, synthesized from the rest of your file.",
      ],
    },
    {
      type: "p",
      text: "Ghost text is never document content. It lives outside your file until you accept it, so a dismissed suggestion leaves no trace in your Creed, your history, or your agents' reads.",
    },
    { type: "h2", text: "It gets better as your file does" },
    {
      type: "p",
      text: "Most autocomplete predicts from the last few lines. Tab conditions on your entire Creed, so its ceiling is set by how much true, specific context you have written. That inverts the usual curve: instead of being impressive on day one and flat after, Tab starts modest and compounds. Writing good context makes writing more good context easier.",
    },
    {
      type: "p",
      text: "It also holds itself to the same bar Creed's quality analysis scores you on: specific, anchored, steering, current, tight. A completion that pads or flatters would be worse than none, so Tab is instructed to write lines an AI would actually act on.",
    },
    { type: "h2", text: "Speed and cost" },
    {
      type: "p",
      text: "Tab runs on fast open-weights silicon, routed to the quickest available provider, and streams from the first token. A typical suggestion lands in a few hundred milliseconds. Each press is one metered generation against your plan's usage allowance; accepting, rejecting, or typing past a suggestion costs nothing.",
    },
    { type: "h2", text: "What Tab will not do" },
    {
      type: "ul",
      items: [
        "No per-keystroke ghost text. It runs only when you press Tab.",
        "No invented facts. Unknown details end the suggestion instead of being guessed.",
        "No whole-section dumps. It completes one thought; press Tab again to continue.",
        "No surprise writes. Nothing enters your file until you accept it.",
      ],
    },
  ],
  faq: [
    {
      question: "How do I use Tab in Creed?",
      answer:
        "Click into any section of your file, put the cursor where you are writing, and press Tab. A suggestion streams in as ghost text. Press Tab again to accept, Escape to dismiss, or keep typing to ignore it.",
    },
    {
      question: "Does Tab make things up about me?",
      answer:
        "No. Tab may only use facts already in your file or clearly implied by what you typed. When it would need a fact it does not have, it writes up to that point and stops.",
    },
    {
      question: "What does Tab cost?",
      answer:
        "One metered generation per press, billed against your plan's monthly usage allowance. Accepting, rejecting, or dismissing a suggestion is free, and the generations are small and cheap.",
    },
    {
      question: "Why is Tab better when my Creed is fuller?",
      answer:
        "Every suggestion is drawn from your whole file. More specific sections give it more true material to complete from, so suggestions shift from generic structure to lines that name your real tools, goals, and constraints.",
    },
  ],
  related: [
    {
      label: "What is a personal context file",
      href: "/learn/what-is-a-personal-context-file",
    },
    {
      label: "A template you can copy",
      href: "/learn/personal-context-file-template",
    },
    {
      label: "Stop repeating yourself to AI",
      href: "/learn/stop-repeating-yourself-to-ai",
    },
  ],
};
