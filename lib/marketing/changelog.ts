// Curated changelog for the public site. Hand-written, user-facing entries for
// meaningful ships, newest first. See CHANGELOG.md for when to add an entry.
// This is not a raw commit log.

export type ChangelogEntry = {
  // ISO date (YYYY-MM-DD), used for ordering and the visible date.
  date: string;
  title: string;
  body: string;
  highlights?: string[];
};

export const changelog: ChangelogEntry[] = [
  {
    date: "2026-07-27",
    title: "Creed Bench",
    body: "A public leaderboard that measures how well frontier models use Creed through its real MCP tools. Pass@1 is plotted against average cost per task, with the full task suite and methodology on /bench.",
    highlights: [
      "Official runs cover 24 tasks across single-tool, multi-tool, and adversarial families.",
      "Each model is scored at low, medium, and high effort, three trials each.",
      "Results stay local as traces; only the generated chart ships with the site.",
      "Open the chart and task tables at /bench.",
    ],
  },
  {
    date: "2026-07-14",
    title: "Creed CLI",
    body: "Creed now has a first-party terminal client on npm. It uses the same browser OAuth flow and mirrors the live MCP server, so every current and future Creed tool is available from the terminal without a separate implementation.",
    highlights: [
      "Install globally with npm install --global creed-cli or run it once with npx creed-cli.",
      "Interactive and one-shot commands for tools, resources, and prompts.",
      "JSON output for scripts and coding agents, with diagnostics kept on stderr.",
      "Token-bound per-agent attribution keeps CLI status and last-seen times separate from MCP connections.",
      "Secure per-server credential storage, automatic token refresh, and OAuth revocation on logout.",
    ],
  },
  {
    date: "2026-07-12",
    title: "Tab autocomplete",
    body: "Press Tab while editing and Creed finishes the thought in your voice, drawn from your whole file. One suggestion per press, streamed as ghost text in a few hundred milliseconds.",
    highlights: [
      "Tab once for a suggestion, Tab again to accept, Escape or keep typing to dismiss.",
      "Never invents facts: it only recombines what your file already says.",
      "Empty sections get a short drafted opening synthesized from the rest of your Creed.",
      "One metered generation per press against your usage allowance; accepting and dismissing are free.",
    ],
  },
  {
    date: "2026-07-07",
    title: "Company Creeds",
    body: "Creed now works for a whole team, not just one person. The Company plan adds a shared Company Creed that every member's agents read before they act.",
    highlights: [
      "One shared Company Creed with Owner, Admin, and Member roles.",
      "Section permissions decide who edits directly and who proposes.",
      "An activity view across every member and agent, with attribution.",
      "Owner-only billing from $129/mo for 10 seats, with extra seats available.",
    ],
  },
  {
    date: "2026-07-03",
    title: "The command panel",
    body: "A command panel with search, ask, and an in-app agent, so you can work your Creed without leaving the file. New paid users get a short welcome tour.",
  },
  {
    date: "2026-07-02",
    title: "Usage credits and tiered pricing",
    body: "AI billing moved to a clear usage-credit model with tiered plans. Hosted plans include a monthly allowance, and BYOK is available when you want model spend on your own key.",
  },
  {
    date: "2026-06-29",
    title: "Guided onboarding and a live roadmap",
    body: "Onboarding is now a guided three-question flow that fits a founder, a writer, or a researcher equally. A public roadmap page shows what we are building, straight from the task board.",
  },
  {
    date: "2026-06-24",
    title: "Interactive landing and examples",
    body: "The landing page was rebuilt around interactive demos showing how Creed works and what changes when every agent reads the same context.",
  },
  {
    date: "2026-06-22",
    title: "Docs, billing, and connectable agents",
    body: "A full docs page with agent guides and a tool and API reference, subscription billing with monthly and lifetime plans, and the first connectable agents over MCP.",
  },
  {
    date: "2026-06-21",
    title: "Accounts and authentication",
    body: "Email, social, and password-reset authentication, so your Creed is tied to an account you control.",
  },
];
