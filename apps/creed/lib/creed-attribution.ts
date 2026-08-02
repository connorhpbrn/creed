// Canonical attribution strings for Creed activity.
//
// One place to render "who did this", so the activity drawer, the review pill,
// version rows, and the MCP health surface all agree. The rule (company plan,
// "Attribution"):
//
//   manual action  -> the member's name            e.g. "Fergus"
//   MCP agent      -> "[member]'s [agent]"          e.g. "Fergus's Claude Code"
//   panel agent    -> "[member]'s Creed"            e.g. "Fergus's Creed"
//
// Vague attribution ("Codex made a proposal") is never produced: an agent action
// always carries the member it acted for. Pure and dependency-free so it is
// unit-testable and usable on both server and client.

export type AttributionActor = {
  actorType: "user" | "agent";
  // Display name of the acting member. Null only for legacy rows with no known
  // actor, where we fall back to the agent name or a neutral label.
  userName: string | null;
  // The agent/app name for agent actions ("Claude Code", "Codex", "Creed" for
  // the in-app panel agent). Ignored for manual actions.
  agentName?: string | null;
};

/**
 * Possessive form of a name: "Fergus" -> "Fergus's". English convention keeps
 * the trailing "'s" even after an s ("Chris's"), which reads consistently and
 * avoids guessing at pluralisation.
 */
export function possessive(name: string): string {
  return `${name}'s`;
}

/**
 * The actor label for an activity/version/proposal row.
 *   manual -> "Fergus"
 *   agent  -> "Fergus's Claude Code" (or the bare agent name if the member is
 *             unknown, never a vague standalone).
 */
export function actorLabel(actor: AttributionActor): string {
  const name = actor.userName?.trim() || null;
  if (actor.actorType === "agent") {
    const agent = actor.agentName?.trim() || "agent";
    return name ? `${possessive(name)} ${agent}` : agent;
  }
  return name ?? "Someone";
}
