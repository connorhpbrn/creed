import type { CreedQualityReport } from "@/lib/ai/quality";
import type { AccentKey, CreedSection, Proposal } from "@/lib/creed-data";

export type DemoActivityStatus = "accepted" | "rejected" | "direct";

export type DemoActivity = {
  id: string;
  sectionName: string;
  accent: AccentKey;
  actor: string;
  actorType: "user" | "agent";
  status: DemoActivityStatus;
  timeLabel: string;
  added: number;
  removed: number;
  beforeText: string;
  afterText: string;
};

type DemoActivitySeed = Omit<DemoActivity, "beforeText" | "afterText">;

export type DemoProposalApply = Record<
  string,
  { base: string; html: string; score: number; added: number }
>;

export type DemoProfile = {
  name: string;
  image: string;
  sections: CreedSection[];
  proposals: Proposal[];
  proposalApply: DemoProposalApply;
  quality: CreedQualityReport;
  activity: DemoActivity[];
};

const bulletList = (items: string[]) =>
  `<ul class="creed-list creed-list-bullet">${items
    .map((item) => `<li class="creed-list-item"><p>${item}</p></li>`)
    .join("")}</ul>`;

const tagList = (items: string[]) =>
  `<p>${items
    .map(
      (item) =>
        `<span class="creed-inline-tag" data-tag="${item.toLowerCase().replaceAll(" ", "-")}">${item}</span>`
    )
    .join(" ")}</p>`;

function section(
  id: string,
  name: string,
  accent: AccentKey,
  content: string,
  lastEditedLabel: string,
  lastEditedBy = "You",
  lastEditedType: CreedSection["lastEditedType"] = "user"
): CreedSection {
  return {
    id,
    kind: "rich-text",
    template: "freeform",
    name,
    accent,
    content,
    agentWritable: true,
    agentPermission: "propose",
    lastEditedBy,
    lastEditedType,
    lastEditedLabel,
  };
}

function proposal(
  id: string,
  sectionId: string,
  sectionName: string,
  accent: AccentKey,
  agentName: string,
  reason: string,
  contentMarkdown: string,
  timeLabel = "1h ago"
): Proposal {
  return {
    id,
    sectionId,
    sectionName,
    accent,
    agentName,
    timeLabel,
    changeType: "refines-existing",
    reason,
    impact: "future-responses",
    confidence: "repeated",
    draft: { kind: "rich-text", contentMarkdown },
    status: "pending",
  };
}

function note(title: string, detail: string) {
  return { title, detail };
}

function qualitySection(
  section: CreedSection,
  score: number,
  tags: string[],
  strength: string,
  gap: string | null
): CreedQualityReport["sections"][number] {
  return {
    sectionId: section.id,
    sectionName: section.name,
    score,
    tags,
    strength: note("Useful context", strength),
    gap: gap ? note("Next refinement", gap) : null,
    reasons: [],
    strengths: [],
    gaps: [],
    missingContext: [],
    focus: "",
  };
}

function quality(
  key: string,
  sections: CreedSection[],
  scores: number[],
  summary: string,
  strength: string,
  gap: string
): CreedQualityReport {
  const sectionReports = sections.map((item, index) =>
    qualitySection(
      item,
      scores[index] ?? 84,
      index % 2 === 0 ? ["Specific", "Actionable"] : ["Current", "Concrete"],
      `${item.name} gives an agent concrete material to work with.`,
      index === scores.length - 1 ? "Add one dated example so this stays current." : null
    )
  );
  const overallScore = Math.round(
    sectionReports.reduce((total, item) => total + item.score, 0) / sectionReports.length
  );

  return {
    contentHash: `demo-${key}`,
    generatedAt: "",
    overall: {
      score: overallScore,
      summary,
      tags: ["Specific", "Current", "Durable"],
      strength: note("Strong point of view", strength),
      gap: note("Keep it operational", gap),
      strengths: [],
      gaps: [],
      focus: [],
    },
    sections: sectionReports,
  };
}

const steveFocus = [
  "Build products at the intersection of technology and the liberal arts.",
  "Start with the customer experience and work backward to the technology.",
  "Say no to a thousand good ideas so the essential few can be exceptional.",
];
const steveFocusNew = "Keep the product line small enough to explain on one table.";
const steveFocusPlain = steveFocus.join("\n");
const steveFocusApplied = [...steveFocus, steveFocusNew];

const steveSections = [
  section(
    "steve-identity",
    "Identity",
    "identity",
    "<p>Co-founder of <strong>Apple</strong>. I care about making advanced technology feel inevitable, personal, and humane.</p><p>My best work joins engineering, design, storytelling, and taste into one coherent product.</p>",
    "Edited by Steve, 22m ago",
    "Steve"
  ),
  section("steve-focus", "Focus", "projects", bulletList(steveFocus), "Edited by Steve, yesterday", "Steve"),
  section(
    "steve-craft",
    "Product Craft",
    "rose",
    `${bulletList([
      "The inside should be as considered as the outside, even when the customer never sees it.",
      "Typography, materials, packaging, software, and retail are one experience.",
      "A demo should reveal the idea in seconds, without a manual beside it.",
    ])}<blockquote class="creed-callout"><p>“A great carpenter isn’t going to use lousy wood for the back of a cabinet, even though nobody’s going to see it.”</p></blockquote>`,
    "Updated by Jony, 3h ago",
    "Jony",
    "agent"
  ),
  section(
    "steve-launches",
    "Launches",
    "output",
    "<p>Every launch needs one clear story, one memorable demonstration, and one sentence people repeat on the way home.</p><p>Cut slides that explain the organisation. Keep moments that explain the product.</p>",
    "Updated by Claude, yesterday",
    "Claude",
    "agent"
  ),
  section(
    "steve-standards",
    "Standards",
    "boundaries",
    bulletList([
      "Do not ship a confusing choice because the org chart could not make a decision.",
      "Do not confuse more features with a better product.",
      "Protect the end-to-end experience when integration is the advantage.",
    ]),
    "Edited by Steve, 4d ago",
    "Steve"
  ),
  section(
    "steve-people",
    "People",
    "rose",
    bulletList([
      "Steve Wozniak: the engineering wizard who made the first impossible thing work.",
      "Laurene Powell Jobs: partner, family, and the person trusted beyond the product world.",
      "Jony Ive: the design collaborator who could turn an argument about a radius into an object people loved.",
      "Ed Catmull: protected Pixar's creative engine while the rest of us debated the notes.",
    ]),
    "Edited by Steve, 1w ago",
    "Steve"
  ),
];

const steveProposals = [
  proposal(
    "steve-p-focus",
    "steve-focus",
    "Focus",
    "projects",
    "Claude",
    "The last three product reviews ended by reducing the number of products shown.",
    steveFocusApplied.join("\n")
  ),
];

const marcConvictions = [
  "Software will continue to reorganise every major industry.",
  "AI is a broad capability shift, not a feature cycle.",
  "The future belongs to builders willing to make ambitious things real.",
];
const marcConvictionsNew = "Judge new markets by what becomes possible when the cost curve collapses.";
const marcConvictionsPlain = marcConvictions.join("\n");

const marcFounderNotes = [
  "Look for an earned secret about the market, not a fashionable category label.",
  "Back founders with the conviction to recruit through disbelief.",
  "Help with talent, customers, policy, and narrative after the cheque is signed.",
];
const marcFounderNew = "Ask what the founder sees that a smart consensus still considers impossible.";
const marcFounderPlain = marcFounderNotes.join("\n");

const marcSections = [
  section(
    "marc-identity",
    "Builder to Investor",
    "identity",
    "<p>Co-created <strong>Mosaic</strong>, co-founded <strong>Netscape</strong> and <strong>Opsware</strong>, then co-founded <strong>Andreessen Horowitz</strong>.</p><p>I look for platform shifts before they become consensus.</p>",
    "Edited by Marc, 48m ago",
    "Marc"
  ),
  section("marc-convictions", "Convictions", "operating-principles", bulletList(marcConvictions), "Edited by Marc, today", "Marc"),
  section(
    "marc-retard-maxing",
    "Retard Maxing",
    "yellow",
    '<p><strong>Current status:</strong> retardmaxxing.</p><p>Stop converting every ordinary outcome into a graduate seminar on your own psychology. Go to work, do a good job, come home. Start the company. It succeeds or fails. It is fine.</p><blockquote class="creed-callout"><p>Elisha Long is the new life coach. We have not met. This improves the arrangement.</p></blockquote><p>Required viewing: <a href="https://www.youtube.com/@ElishaLong" target="_blank" rel="noopener noreferrer">Elisha Long on YouTube</a>.</p>',
    "Updated by Grok, 17m ago",
    "Grok",
    "agent"
  ),
  section("marc-founders", "Founder Test", "decisions", bulletList(marcFounderNotes), "Updated by Claude, 2h ago", "Claude", "agent"),
  section(
    "marc-frontiers",
    "Frontiers",
    "projects",
    `${tagList(["Convictions", "Founder Test", "Network"])}<p>Prioritise markets where technical progress can unlock abundance, resilience, or entirely new behaviour.</p>`,
    "Updated by Grok, yesterday",
    "Grok",
    "agent"
  ),
  section(
    "marc-network",
    "Network",
    "workflows",
    bulletList([
      "Treat the firm as an operating platform around the founder.",
      "Connect portfolio leaders to people who have already survived the next stage.",
      "Turn ideas into media when narrative can accelerate adoption.",
    ]),
    "Edited by Marc, 3d ago",
    "Marc"
  ),
  section(
    "marc-reading",
    "Reading Queue",
    "tools",
    bulletList([
      "Technical histories of platform transitions.",
      "Industrial policy and the return of hard technology.",
      "Founder accounts written before the outcome looked obvious.",
    ]),
    "Updated by ChatGPT, 5h ago",
    "ChatGPT",
    "agent"
  ),
];

const marcProposals = [
  proposal("marc-p-convictions", "marc-convictions", "Convictions", "operating-principles", "Grok", "You repeatedly reframed AI around falling inference costs.", [...marcConvictions, marcConvictionsNew].join("\n"), "18m ago"),
  proposal("marc-p-founders", "marc-founders", "Founder Test", "decisions", "Claude", "This question appeared in two recent founder debriefs.", [...marcFounderNotes, marcFounderNew].join("\n"), "1h ago"),
  proposal("marc-p-frontiers", "marc-frontiers", "Frontiers", "projects", "ChatGPT", "Your latest notes treat robotics as a convergence of AI and American Dynamism.", "AI\nAmerican Dynamism\nBio\nCrypto\nInfrastructure\nRobotics", "3h ago"),
];

const travisOps = [
  "Start with the city block: demand, supply, prep time, and delivery radius.",
  "Density beats breadth when the local operation is the product.",
  "Instrument every handoff from order to kitchen to courier.",
];
const travisOpsNew = "Open the next site only when the current zone has repeatable unit economics.";
const travisOpsPlain = travisOps.join("\n");

const travisSections = [
  section(
    "travis-identity",
    "Operator",
    "identity",
    "<p>Built through <strong>Scour</strong>, <strong>Red Swoosh</strong>, and <strong>Uber</strong>. Now focused on local commerce infrastructure through CloudKitchens.</p><p>I am most useful where software meets messy, physical operations.</p>",
    "Edited by Travis, 36m ago",
    "Travis"
  ),
  section("travis-ops", "City Operations", "workflows", bulletList(travisOps), "Edited by Travis, today", "Travis"),
  section(
    "travis-marketplace",
    "Marketplace",
    "stack",
    bulletList([
      "Reduce idle time on both sides before adding another market.",
      "Local liquidity matters more than a global signup number.",
      "Price and incentives should repair the network, not conceal a broken one.",
    ]),
    "Updated by Codex, 90m ago",
    "Codex",
    "agent"
  ),
  section(
    "travis-expansion",
    "Expansion Map",
    "projects",
    `${tagList(["City Operations", "Marketplace", "Operating Rules"])}<p>Rank cities by order density, site economics, restaurant demand, and operational repeatability.</p>`,
    "Updated by Claude, 4h ago",
    "Claude",
    "agent"
  ),
  section(
    "travis-rules",
    "Operating Rules",
    "boundaries",
    bulletList([
      "Escalate site-level failures with the raw metrics attached.",
      "Do not mistake expansion announcements for operational progress.",
      "Keep decision rights explicit when a market is off plan.",
    ]),
    "Edited by Travis, 2d ago",
    "Travis"
  ),
];

const travisProposals = [
  proposal("travis-p-ops", "travis-ops", "City Operations", "workflows", "Codex", "The last expansion review used site economics as the explicit gate.", [...travisOps, travisOpsNew].join("\n"), "42m ago"),
  proposal("travis-p-market", "travis-marketplace", "Marketplace", "stack", "Claude", "Three dashboards now track cancellation causes separately from demand.", "Reduce idle time on both sides before adding another market.\nLocal liquidity matters more than a global signup number.\nPrice and incentives should repair the network, not conceal a broken one.\nTrack cancellations by kitchen, courier, customer, and handoff.", "2h ago"),
];

const jasonChecks = [
  "Would I still want to meet this founder if the category were unfashionable?",
  "Can the founder explain why now in one minute without a market-size slide?",
  "Is there a small group of users who would be genuinely upset if this disappeared?",
];
const jasonChecksNew = "Write the pass reason before the next meeting so pattern recognition stays honest.";
const jasonChecksPlain = jasonChecks.join("\n");

const jasonFollowups = [
  "Reply to founders with a clear yes, no, or next step.",
  "Make introductions with enough context that both sides know why they should talk.",
  "Turn repeated founder questions into an episode, memo, or Founder University session.",
];
const jasonFollowupsNew = "Reserve Friday afternoon for closing every open founder loop.";
const jasonFollowupsPlain = jasonFollowups.join("\n");

const jasonSections = [
  section(
    "jason-identity",
    "Angel",
    "identity",
    "<p>Technology entrepreneur, host of <strong>This Week in Startups</strong>, co-host of <strong>All-In</strong>, and an early-stage investor through LAUNCH.</p><p>I learn in public, make lots of small bets, and help founders tighten the story.</p>",
    "Edited by Jason, 12m ago",
    "Jason"
  ),
  section("jason-checks", "Investment Checks", "decisions", bulletList(jasonChecks), "Edited by Jason, today", "Jason"),
  section(
    "jason-dealflow",
    "Deal Flow",
    "projects",
    bulletList([
      "Prioritise founders referred by people whose judgement has compounded.",
      "Keep the first meeting focused on product, users, and founder velocity.",
      "Track every promising company early enough to see the rate of change.",
    ]),
    "Updated by ChatGPT, 35m ago",
    "ChatGPT",
    "agent"
  ),
  section(
    "jason-shows",
    "Shows",
    "output",
    `${tagList(["All-In Besties", "Chamath Jokes", "Founder Follow-ups"])}<p>Open with the sharpest disagreement. Ask for the number, the decision, or the prediction that makes the conversation useful.</p>`,
    "Updated by Claude, 2h ago",
    "Claude",
    "agent"
  ),
  section(
    "jason-besties",
    "All-In Besties",
    "rose",
    bulletList([
      "Chamath Palihapitiya: Chairman Dictator, owner of at least one strong opinion per asset class.",
      "David Sacks: the docket, the counterargument, and the reason a 20-minute segment becomes an hour.",
      "David Friedberg: science corner, weather systems, and the adult supervision for any numerical claim.",
      "Jason Calacanis: moderator, executive producer, and neutral custodian of the world's greatest group chat.",
    ]),
    "Edited by Jason, 1d ago",
    "Jason"
  ),
  section(
    "jason-chamath-jokes",
    "Chamath Jokes",
    "yellow",
    bulletList([
      "Whenever Chamath says ‘first principles,’ start a timer until he mentions a market he owns.",
      "If Chamath says ‘the data is clear,’ quietly slide the spreadsheet toward Friedberg.",
      "Keep one emergency ‘Chamath, that was not the question’ ready for every cold open.",
      "Never challenge the cashmere. The cashmere has already marked itself up three times.",
    ]),
    "Updated by Claude, 3h ago",
    "Claude",
    "agent"
  ),
  section("jason-followups", "Founder Follow-ups", "workflows", bulletList(jasonFollowups), "Updated by Codex, 3h ago", "Codex", "agent"),
  section(
    "jason-network",
    "People to Connect",
    "tools",
    bulletList([
      "Technical founders looking for their first design partner.",
      "Seed investors with a strong view on AI-native applications.",
      "Operators who can teach first-time founders how to hire the first ten people.",
    ]),
    "Edited by Jason, yesterday",
    "Jason"
  ),
];

const jasonProposals = [
  proposal("jason-p-checks", "jason-checks", "Investment Checks", "decisions", "ChatGPT", "You dictated a pass memo immediately after each meeting this week.", [...jasonChecks, jasonChecksNew].join("\n"), "12m ago"),
  proposal("jason-p-followups", "jason-followups", "Founder Follow-ups", "workflows", "Codex", "You cleared the founder inbox in one Friday block three weeks running.", [...jasonFollowups, jasonFollowupsNew].join("\n"), "47m ago"),
  proposal("jason-p-shows", "jason-shows", "Shows", "output", "Claude", "The strongest recent clips all began with a falsifiable prediction.", "TWiST\nAll-In\nThis Week in AI\nEnd each market segment with one falsifiable prediction.", "2h ago"),
  proposal("jason-p-network", "jason-network", "People to Connect", "tools", "Claude", "Two portfolio companies asked for their first enterprise sales leader.", "Technical founders looking for their first design partner.\nSeed investors with a strong view on AI-native applications.\nOperators who can teach first-time founders how to hire the first ten people.\nEnterprise sales leaders who enjoy creating the first repeatable motion.", "4h ago"),
];

const elonPrinciples = [
  "Reduce the problem to physical limits before accepting industry assumptions.",
  "Delete the part or process before attempting to optimise it.",
  "Make the machine that makes the machine a first-class engineering problem.",
];
const elonPrinciplesNew = "Move faster only after the requirements and process steps have earned their place.";
const elonPrinciplesPlain = elonPrinciples.join("\n");

const elonMissions = [
  "Make life multiplanetary through a fully reusable space transportation system.",
  "Accelerate the transition to sustainable energy at enormous scale.",
  "Build AI and neural interfaces that expand what humans can understand and do.",
];
const elonMissionsNew = "Prefer work that changes the long-run probability of a good future for civilisation.";
const elonMissionsPlain = elonMissions.join("\n");

const elonSections = [
  section(
    "elon-identity",
    "Chief Engineer",
    "identity",
    "<p>Engineer and entrepreneur leading work across <strong>SpaceX</strong>, <strong>Tesla</strong>, <strong>xAI</strong>, Neuralink, and The Boring Company.</p><p>I allocate attention to bottlenecks that block scale.</p>",
    "Edited by Elon, 9m ago",
    "Elon"
  ),
  section("elon-missions", "Missions", "projects", bulletList(elonMissions), "Edited by Elon, today", "Elon"),
  section("elon-principles", "First Principles", "operating-principles", bulletList(elonPrinciples), "Updated by Grok, 28m ago", "Grok", "agent"),
  section(
    "elon-companies",
    "Companies",
    "stack",
    `${tagList(["Missions", "Manufacturing", "Constraints"])}<p>Review by the constraint that currently limits mission velocity: launch cadence, factories, compute, clinical progress, or tunnelling cost.</p>`,
    "Updated by Grok, 1h ago",
    "Grok",
    "agent"
  ),
  section(
    "elon-manufacturing",
    "Manufacturing",
    "workflows",
    bulletList([
      "Design for production rate, not only for the first successful prototype.",
      "Put engineering near the line when reality disagrees with the model.",
      "Track the slowest station and the highest-frequency failure every day.",
    ]),
    "Updated by Grok, 3h ago",
    "Grok",
    "agent"
  ),
  section(
    "elon-constraints",
    "Constraints",
    "boundaries",
    bulletList([
      "Do not accept a requirement without finding the person and reason behind it.",
      "Do not add automation to a process that should first be deleted.",
      "Escalate safety-critical ambiguity with evidence, not optimism.",
    ]),
    "Edited by Elon, yesterday",
    "Elon"
  ),
];

const elonProposals = [
  proposal("elon-p-missions", "elon-missions", "Missions", "projects", "Grok", "Your latest company review ranked projects by their effect on civilisation-scale outcomes.", [...elonMissions, elonMissionsNew].join("\n"), "9m ago"),
  proposal("elon-p-principles", "elon-principles", "First Principles", "operating-principles", "Grok", "Two recent reviews clarified that speed follows deletion and simplification.", [...elonPrinciples, elonPrinciplesNew].join("\n"), "28m ago"),
  proposal("elon-p-manufacturing", "elon-manufacturing", "Manufacturing", "workflows", "Grok", "The line review now names the slowest station before discussing total output.", "Design for production rate, not only for the first successful prototype.\nPut engineering near the line when reality disagrees with the model.\nTrack the slowest station and the highest-frequency failure every day.\nBegin every production review at the current bottleneck station.", "1h ago"),
  proposal("elon-p-companies", "elon-companies", "Companies", "stack", "Grok", "The weekly review now starts with one named bottleneck per company.", "SpaceX\nTesla\nxAI\nNeuralink\nThe Boring Company\nStart the cross-company review with the single constraint currently limiting each mission.", "2h ago"),
  proposal("elon-p-constraints", "elon-constraints", "Constraints", "boundaries", "Grok", "Three recent requirements disappeared when nobody could name their owner.", "Do not accept a requirement without finding the person and reason behind it.\nDo not add automation to a process that should first be deleted.\nEscalate safety-critical ambiguity with evidence, not optimism.\nIf a requirement has no named owner, treat it as a candidate for deletion.", "4h ago"),
];

const ACTIVITY_DIFF_COPY: Record<string, { beforeText: string; afterText: string }> = {
  "steve-a1": {
    beforeText: "Make the visible product beautiful.",
    afterText: "The inside should be as considered as the outside, even when the customer never sees it.",
  },
  "steve-a2": {
    beforeText: "Explain the product clearly on stage.",
    afterText: "Build every launch around one clear story and one memorable demonstration.",
  },
  "steve-a3": {
    beforeText: "More options can show progress.",
    afterText: "Do not confuse more features with a better product.",
  },
  "marc-a1": {
    beforeText: "Prioritise large technical markets.",
    afterText: "Prioritise markets where technical progress can unlock abundance or entirely new behaviour.",
  },
  "marc-a2": {
    beforeText: "Interrogate every ordinary outcome.",
    afterText: "Go to work, do a good job, come home. Start the company.",
  },
  "marc-a3": {
    beforeText: "Make useful introductions across the portfolio.",
    afterText: "Connect portfolio leaders to people who have already survived the next stage.",
  },
  "marc-a4": {
    beforeText: "Read current market commentary.",
    afterText: "Study technical histories of platform transitions before they become consensus.",
  },
  "travis-a1": {
    beforeText: "Track marketplace growth globally.",
    afterText: "Measure local liquidity and cancellation causes at every handoff.",
  },
  "travis-a2": {
    beforeText: "Expand into the largest available cities.",
    afterText: "Rank cities by order density, site economics, and operational repeatability.",
  },
  "travis-a3": {
    beforeText: "Escalate markets that fall behind plan.",
    afterText: "Escalate site-level failures with the raw metrics and decision owner attached.",
  },
  "jason-a1": {
    beforeText: "Track every promising founder.",
    afterText: "Track promising companies early enough to see the founder's rate of change.",
  },
  "jason-a2": {
    beforeText: "Open with the strongest topic.",
    afterText: "Open with the sharpest disagreement and end with one falsifiable prediction.",
  },
  "jason-a3": {
    beforeText: "Clear founder follow-ups regularly.",
    afterText: "Reserve Friday afternoon for closing every open founder loop.",
  },
  "jason-a4": {
    beforeText: "Keep a joke ready for the cold open.",
    afterText: "Whenever Chamath says first principles, start a timer until he mentions a market he owns.",
  },
  "jason-a5": {
    beforeText: "Connect founders with useful operators.",
    afterText: "Prioritise enterprise sales leaders who enjoy creating the first repeatable motion.",
  },
  "elon-a1": {
    beforeText: "Optimise each process before scaling it.",
    afterText: "Delete the part or process before attempting to optimise it.",
  },
  "elon-a2": {
    beforeText: "Review progress across every company.",
    afterText: "Start with the single constraint currently limiting each mission.",
  },
  "elon-a3": {
    beforeText: "Track total factory output every day.",
    afterText: "Begin every production review at the current bottleneck station.",
  },
  "elon-a4": {
    beforeText: "Challenge requirements that slow execution.",
    afterText: "If a requirement has no named owner, treat it as a candidate for deletion.",
  },
};

const profile = (
  name: string,
  image: string,
  sections: CreedSection[],
  proposals: Proposal[],
  proposalApply: DemoProposalApply,
  scores: number[],
  summary: string,
  strength: string,
  gap: string,
  activity: DemoActivitySeed[]
): DemoProfile => ({
  name,
  image,
  sections,
  proposals,
  proposalApply,
  quality: quality(name.toLowerCase(), sections, scores, summary, strength, gap),
  activity: activity.map((entry) => ({
    ...entry,
    ...(ACTIVITY_DIFF_COPY[entry.id] ?? {
      beforeText: `Earlier ${entry.sectionName} wording.`,
      afterText: `Updated ${entry.sectionName} with specific, current context.`,
    }),
  })),
});

export const DEMO_PROFILES = [
  profile(
    "Steve",
    "/assets/eggs/steve.jpg",
    steveSections,
    steveProposals,
    { "steve-p-focus": { base: steveFocusPlain, html: bulletList(steveFocusApplied), score: 94, added: 11 } },
    [96, 89, 94, 91, 93, 88],
    "Exceptionally coherent, with one useful focus refinement pending.",
    "Product, craft, and presentation all reinforce the same standard.",
    "Date the active product decisions so timeless principles do not hide current priorities.",
    [
      { id: "steve-a1", sectionName: "Product Craft", accent: "rose", actor: "Claude", actorType: "agent", status: "accepted", timeLabel: "3h ago", added: 8, removed: 2 },
      { id: "steve-a2", sectionName: "Launches", accent: "output", actor: "Claude", actorType: "agent", status: "accepted", timeLabel: "Yesterday", added: 12, removed: 5 },
      { id: "steve-a3", sectionName: "Standards", accent: "boundaries", actor: "ChatGPT", actorType: "agent", status: "direct", timeLabel: "4d ago", added: 9, removed: 4 },
    ]
  ),
  profile(
    "Marc",
    "/assets/eggs/marc.jpg",
    marcSections,
    marcProposals,
    {
      "marc-p-convictions": { base: marcConvictionsPlain, html: bulletList([...marcConvictions, marcConvictionsNew]), score: 93, added: 12 },
      "marc-p-founders": { base: marcFounderPlain, html: bulletList([...marcFounderNotes, marcFounderNew]), score: 91, added: 14 },
      "marc-p-frontiers": { base: "Convictions\nFounder Test\nNetwork", html: `${tagList(["Convictions", "Founder Test", "Network"])}<p>Add Robotics to the current frontier review.</p>`, score: 88, added: 1 },
    },
    [94, 88, 91, 86, 82, 90, 79],
    "A sharp investment worldview with three live refinements.",
    "The file connects technical history, market conviction, and founder support.",
    "Separate durable theses from this quarter's investable frontiers.",
    [
      { id: "marc-a1", sectionName: "Frontiers", accent: "projects", actor: "Grok", actorType: "agent", status: "accepted", timeLabel: "Yesterday", added: 5, removed: 1 },
      { id: "marc-a2", sectionName: "Retard Maxing", accent: "yellow", actor: "Grok", actorType: "agent", status: "direct", timeLabel: "2d ago", added: 17, removed: 0 },
      { id: "marc-a3", sectionName: "Network", accent: "workflows", actor: "Claude", actorType: "agent", status: "direct", timeLabel: "3d ago", added: 14, removed: 6 },
      { id: "marc-a4", sectionName: "Reading Queue", accent: "tools", actor: "ChatGPT", actorType: "agent", status: "accepted", timeLabel: "5d ago", added: 9, removed: 0 },
    ]
  ),
  profile(
    "Travis",
    "/assets/eggs/travis.jpg",
    travisSections,
    travisProposals,
    {
      "travis-p-ops": { base: travisOpsPlain, html: bulletList([...travisOps, travisOpsNew]), score: 91, added: 13 },
      "travis-p-market": { base: "Reduce idle time on both sides before adding another market.\nLocal liquidity matters more than a global signup number.\nPrice and incentives should repair the network, not conceal a broken one.", html: bulletList(["Reduce idle time on both sides before adding another market.", "Local liquidity matters more than a global signup number.", "Price and incentives should repair the network, not conceal a broken one.", "Track cancellations by kitchen, courier, customer, and handoff."]), score: 89, added: 9 },
    },
    [91, 84, 83, 80, 88],
    "Operationally specific, with two marketplace refinements ready for review.",
    "Every section resolves strategy into a city, site, metric, or handoff.",
    "Add review dates to the expansion map before the city rankings go stale.",
    [
      { id: "travis-a1", sectionName: "Marketplace", accent: "stack", actor: "Codex", actorType: "agent", status: "accepted", timeLabel: "90m ago", added: 11, removed: 3 },
      { id: "travis-a2", sectionName: "Expansion Map", accent: "projects", actor: "Claude", actorType: "agent", status: "rejected", timeLabel: "4h ago", added: 6, removed: 0 },
      { id: "travis-a3", sectionName: "Operating Rules", accent: "boundaries", actor: "Codex", actorType: "agent", status: "direct", timeLabel: "2d ago", added: 15, removed: 8 },
    ]
  ),
  profile(
    "Jason",
    "/assets/eggs/jason.jpg",
    jasonSections,
    jasonProposals,
    {
      "jason-p-checks": { base: jasonChecksPlain, html: bulletList([...jasonChecks, jasonChecksNew]), score: 92, added: 14 },
      "jason-p-followups": { base: jasonFollowupsPlain, html: bulletList([...jasonFollowups, jasonFollowupsNew]), score: 90, added: 10 },
      "jason-p-shows": { base: "All-In Besties\nChamath Jokes\nFounder Follow-ups", html: `${tagList(["All-In Besties", "Chamath Jokes", "Founder Follow-ups"])}<p>End each market segment with one falsifiable prediction.</p>`, score: 88, added: 9 },
      "jason-p-network": { base: "Technical founders looking for their first design partner.\nSeed investors with a strong view on AI-native applications.\nOperators who can teach first-time founders how to hire the first ten people.", html: bulletList(["Technical founders looking for their first design partner.", "Seed investors with a strong view on AI-native applications.", "Operators who can teach first-time founders how to hire the first ten people.", "Enterprise sales leaders who enjoy creating the first repeatable motion."]), score: 86, added: 10 },
    },
    [92, 85, 82, 84, 89, 87, 80, 78],
    "High-signal and busy, with four agent proposals waiting.",
    "Investing, media, and founder support reinforce one another instead of living in silos.",
    "Prune the connection queue weekly so it stays useful rather than aspirational.",
    [
      { id: "jason-a1", sectionName: "Deal Flow", accent: "projects", actor: "ChatGPT", actorType: "agent", status: "accepted", timeLabel: "35m ago", added: 18, removed: 4 },
      { id: "jason-a2", sectionName: "Shows", accent: "output", actor: "Claude", actorType: "agent", status: "accepted", timeLabel: "2h ago", added: 7, removed: 2 },
      { id: "jason-a3", sectionName: "Founder Follow-ups", accent: "workflows", actor: "Codex", actorType: "agent", status: "accepted", timeLabel: "3h ago", added: 9, removed: 1 },
      { id: "jason-a4", sectionName: "Chamath Jokes", accent: "yellow", actor: "Claude", actorType: "agent", status: "direct", timeLabel: "5h ago", added: 12, removed: 2 },
      { id: "jason-a5", sectionName: "People to Connect", accent: "tools", actor: "Claude", actorType: "agent", status: "direct", timeLabel: "Yesterday", added: 21, removed: 13 },
    ]
  ),
  profile(
    "Elon",
    "/assets/eggs/elon.jpg",
    elonSections,
    elonProposals,
    {
      "elon-p-missions": { base: elonMissionsPlain, html: bulletList([...elonMissions, elonMissionsNew]), score: 94, added: 15 },
      "elon-p-principles": { base: elonPrinciplesPlain, html: bulletList([...elonPrinciples, elonPrinciplesNew]), score: 93, added: 13 },
      "elon-p-manufacturing": { base: "Design for production rate, not only for the first successful prototype.\nPut engineering near the line when reality disagrees with the model.\nTrack the slowest station and the highest-frequency failure every day.", html: bulletList(["Design for production rate, not only for the first successful prototype.", "Put engineering near the line when reality disagrees with the model.", "Track the slowest station and the highest-frequency failure every day.", "Begin every production review at the current bottleneck station."]), score: 91, added: 9 },
      "elon-p-companies": { base: "Missions\nManufacturing\nConstraints", html: `${tagList(["Missions", "Manufacturing", "Constraints"])}<p>Start the cross-company review with the single constraint currently limiting each mission.</p>`, score: 90, added: 12 },
      "elon-p-constraints": { base: "Do not accept a requirement without finding the person and reason behind it.\nDo not add automation to a process that should first be deleted.\nEscalate safety-critical ambiguity with evidence, not optimism.", html: bulletList(["Do not accept a requirement without finding the person and reason behind it.", "Do not add automation to a process that should first be deleted.", "Escalate safety-critical ambiguity with evidence, not optimism.", "If a requirement has no named owner, treat it as a candidate for deletion."]), score: 92, added: 11 },
    },
    [94, 91, 89, 86, 84, 90],
    "Mission-dense and engineering-led, with five Grok refinements pending.",
    "The file connects civilisation-scale goals to concrete engineering review habits.",
    "Name the current bottleneck per company so the broad mission stack remains actionable.",
    [
      { id: "elon-a1", sectionName: "First Principles", accent: "operating-principles", actor: "Grok", actorType: "agent", status: "accepted", timeLabel: "28m ago", added: 12, removed: 5 },
      { id: "elon-a2", sectionName: "Companies", accent: "stack", actor: "Grok", actorType: "agent", status: "accepted", timeLabel: "1h ago", added: 8, removed: 2 },
      { id: "elon-a3", sectionName: "Manufacturing", accent: "workflows", actor: "Grok", actorType: "agent", status: "accepted", timeLabel: "3h ago", added: 10, removed: 3 },
      { id: "elon-a4", sectionName: "Constraints", accent: "boundaries", actor: "Grok", actorType: "agent", status: "direct", timeLabel: "Yesterday", added: 16, removed: 7 },
    ]
  ),
] as const satisfies readonly DemoProfile[];
