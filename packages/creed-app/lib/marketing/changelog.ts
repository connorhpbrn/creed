// Curated public releases, newest first. Keep this aligned with Creed's
// application version and the workflow in CHANGELOG.md.

export type ChangelogEntry = {
  date: string;
  title: string;
  body: string;
  highlights?: string[];
};

export const changelog: ChangelogEntry[] = [
  {
    date: "2026-08-10",
    title: "Creed Open v1.0.0",
    body: "The first stable Creed Open release: a private, single-owner Personal Creed that is straightforward to self-host and connect to your agents.",
    highlights: [
      "Guided local and Vercel setup with a private owner claim.",
      "Personal Creeds with proposals, direct edits, activity, revisions, Nexus, import, and export.",
      "MCP and scoped HTTP connections, optional GitHub version control, and BYOK model tools.",
      "Cloud, Shared Creeds, and the Creed CLI remain in development on the roadmap.",
    ],
  },
];
