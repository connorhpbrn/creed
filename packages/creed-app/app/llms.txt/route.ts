import { getSiteUrl } from "@creed/persistence/supabase/env";
import { CREED_DESCRIPTION, CREED_TAGLINE } from "@/lib/marketing/brand";
import { PRICING_ONE_LINER } from "@/lib/marketing/pricing";

// Serves /llms.txt - the emerging convention that gives AI crawlers a clean,
// plain-text map of the site's most citable pages and a one-paragraph summary
// of what Creed is. Built from the deploy origin so links resolve correctly.
// The full plain-text content lives at /llms-full.txt (linked below); coding
// agents like Claude Code and Cursor fetch these directly.
export const dynamic = "force-static";

export function GET() {
  const base = getSiteUrl().replace(/\/$/, "");

  const body = `# Creed

> ${CREED_TAGLINE} ${CREED_DESCRIPTION.slice(CREED_TAGLINE.length).trim()}

Full plain-text content: ${base}/llms-full.txt

## About

- [Home](${base}/home): What Creed is and how it works.
- [Roadmap](${base}/roadmap): What is available now and what is planned.
- [Docs](https://docs.creed.md): Setting up Creed, connecting agents, and keeping context useful over time.
- [Stack](${base}/stack): The technology Creed runs on.

## Details

A personal context file is one structured profile that describes who you are and how you want AI to respond. Creed organizes it into ten sections: Identity, Goals, Work, Preferences, and Routines as the always-on core, plus optional Beliefs, Constraints, People, Health, and Context.

Agents connect over MCP (Claude Code, Codex, Cursor, ChatGPT) and read the file before answering, then propose narrowly scoped updates that you approve. The file is plain Markdown you own: bring your own AI key, keep your tokens, and export or delete everything at any time. There is no lock-in.

Creed Open v1 is a private, single-owner application for Personal Creeds. Shared Creeds, managed Cloud hosting, and the Creed CLI are on the roadmap.

## Pricing

${PRICING_ONE_LINER}

`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
