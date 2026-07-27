import { getSiteUrl } from "@/lib/supabase/env";
import { CREED_DESCRIPTION, CREED_TAGLINE } from "@/lib/marketing/brand";
import { PLAN_FACTS } from "@/lib/marketing/pricing";
import {
  homeFaqItems,
  contextFileFaqItems,
  pricingFaqItems,
  type FaqItem,
} from "@/lib/marketing/faq";

// Serves /llms-full.txt - the full plain-text content of Creed's most citable
// pages in one document. Generated from the same content modules the site
// renders from (FAQ arrays and pricing facts) so it can never
// drift. The audience that actually fetches this is coding agents (Claude Code,
// Cursor); keep it accurate rather than elaborate.
export const dynamic = "force-static";

function faqBlock(title: string, items: FaqItem[]): string {
  const body = items
    .map((item) => `### ${item.question}\n\n${item.answer}`)
    .join("\n\n");
  return `## ${title}\n\n${body}`;
}

export function GET() {
  const base = getSiteUrl().replace(/\/$/, "");

  const pricing = PLAN_FACTS.map((p) => {
    const seats = p.seats ? ` ${p.seats}` : "";
    return `- ${p.name}: ${p.price} ${p.cadence}. ${p.summary} ${p.usage}${seats}`;
  }).join("\n");

  const body = `# Creed

${CREED_TAGLINE}
${CREED_DESCRIPTION.slice(CREED_TAGLINE.length).trim()} Site: ${base}

## What Creed is

Creed is a single, structured profile that describes who you are and how you
want AI to work with you. Every AI tool you connect reads it before it answers,
so you stop re-explaining your role, your goals, and your preferences at the
start of every chat. It is plain Markdown you own, not a database you rent.

Creed is not a journal, a scratchpad, or a chat log. Its value comes from
staying concise, current, and specific enough that every line changes how an AI
replies to you. It works the same whether you write code all day or never open a
terminal; only the examples differ.

## The problem it solves

Every new AI conversation starts cold. The model does not know your context, so
you retype it, in every tool, forever. Built-in memory helps inside one app but
does not move between apps: ChatGPT's memory does not reach Claude, and Claude's
projects do not reach Cursor. A personal context file lives outside any single
tool, so one profile follows you everywhere.

## The ten sections

A Creed has ten sections: five always-on core sections everyone fills in, and
five optional ones that appear only once you use them.

- Identity: who you are, in a few lines an AI should never get wrong.
- Goals: what you are working toward now, so advice points the right way.
- Work: your role, stack, projects, and how you operate.
- Preferences: how you want AI to talk to you and format answers.
- Routines: the shape of your week that suggestions should respect.
- Beliefs (optional): values and principles that guide your decisions.
- Constraints (optional): hard limits and non-negotiables to respect.
- People (optional): the people who matter to how you work and live.
- Health (optional): anything AI should account for or never suggest.
- Context (optional): situational detail that does not fit elsewhere.

The rule that keeps it useful: specific over complete. A short profile that
changes how AI replies beats a long one that reads like a resume.

## How it works

Creed runs on a simple loop. You write yourself down once. Connected agents read
the file before they answer you. As they learn something durable, they propose a
narrow update to the right section, and you approve what stays or let trusted
agents edit directly. Session chatter, moods, and one-off tasks are left out by
design.

Agents connect over MCP (Model Context Protocol) using OAuth, so there is
nothing to copy. You add the Creed server URL (${base}/mcp) to your agent, click
Allow on the consent screen while signed in, and it stays connected. Clients
that cannot speak MCP can use the HTTP API instead. Creed also integrates with
GitHub for manual version control of your file.

Supported agents include Claude Code, Codex, Cursor, and ChatGPT, plus any
custom agent that speaks MCP.

## Ownership and privacy

Your Creed is plain Markdown you own. You bring your own AI key (BYOK) so model
spend runs on your account, your tokens stay yours, and you can export or delete
everything at any time. Deleting your account wipes everything. There is no
lock-in.

## The Company plan

Creed works for one person or a whole team. The Company plan adds one shared
Company Creed that every member's agents read: the canonical company context,
with member roles (Owner, Admin, Member), section permissions, an activity view
across every member, and admin controls. A team buyer needs a Creed account but
not a personal Creed first.

## Pricing

${pricing}

All hosted plans support BYOK. Billing on the Company plan is per workspace and
owner-only.

## How to write a good context file

The hard part of a context file is not writing it, it is keeping it worth
reading. A few principles keep a Creed sharp:

Be specific, not complete. The goal is not to describe everything about you. It
is to capture the handful of facts that change how an AI should respond. "I
prefer terse, direct answers and I already know the basics" changes every reply.
"I like technology" changes nothing. If a line would not change an answer, cut
it.

Write it so you would read it aloud. A good Creed reads like a short, honest
introduction, not a form you filled in. Full sentences, plain language, no
keyword lists. The people and agents reading it should understand you faster,
not parse a schema.

Keep it current. A stale profile is worse than none, because it makes AI
confidently wrong about you. When a goal ships, a preference shifts, or a project
ends, the file should change too. This is why the proposal loop matters: agents
notice what changed and offer to update the file, so it does not rot.

Separate durable from temporary. Your identity, your standing preferences, and
your hard constraints belong in the file. Today's mood, this week's task, and a
one-off request do not. The test for any line is simple: would this make every
future AI conversation better, or only the next one?

Let the optional sections earn their place. Everyone fills in Identity, Goals,
Work, Preferences, and Routines. Beliefs, Constraints, People, Health, and
Context appear only when you actually have something durable to put in them. An
empty section is not a gap to fill; it is space you have not needed yet.

## How Creed compares

Creed sits in a crowded space, so it helps to be precise about what it is and is
not.

Versus chatbot memory (ChatGPT memory, Claude's project knowledge): built-in
memory is automatic and effortless, and if you live inside one assistant it is
often enough. But it lives inside that one app, you cannot fully read or move it,
and it does not follow you to the next tool. A context file is portable, owned,
and readable, and every tool you connect reads the same one. Many people use
both: memory for in-app convenience, a context file for the profile that has to
travel.

Versus agent-memory infrastructure (mem0, Zep, and similar): these are developer
tools for giving the agents you build a memory layer, usually a vector store or
API you embed in an application. They are strong at that job. Creed is a
different job: a human-readable profile a person owns and every tool reads, not
a database an app writes to. If you are building an agent product, you may want
memory infrastructure. If you are a person who wants every AI to know you, you
want a context file.

Versus recording and life-logging tools: some products try to capture everything
you do and recall it later. Creed takes the opposite view. It brags, quietly,
about how little it keeps and how true that little stays. Curation over
accumulation is the whole point.

## Who Creed is for

Creed is not developer-only. Developers are a natural wedge because they already
live in tools like Claude Code and Cursor, but the structure is identical for
everyone and only the examples change. A founder captures their company and their
priorities. A writer captures voice and the projects in flight. A researcher
captures methods and standing constraints. A parent or a student captures the
context that should shape everyday help. The same ten sections fit all of them,
because the thing they share is simple: they want AI that starts every
conversation already knowing them, instead of starting from zero.

${faqBlock("Common questions", homeFaqItems)}

${faqBlock("About personal context files", contextFileFaqItems)}

${faqBlock("Common questions", pricingFaqItems)}

`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
