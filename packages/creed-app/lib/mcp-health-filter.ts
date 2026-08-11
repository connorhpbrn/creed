import type { McpHealthSummary } from "../components/creed/mcp-health-preload.ts";
import { getAgentCategory, type AgentCategory } from "./agent-icon.ts";

export function filterMcpHealthSummary(
  summary: McpHealthSummary,
  categoryFilter: AgentCategory | "all",
): McpHealthSummary {
  const allowed = new Set(
    summary.agents
      .filter(
        (agent) =>
          agent.icon !== "cli" &&
          (categoryFilter === "all" ||
            getAgentCategory(agent.icon) === categoryFilter),
      )
      .map((agent) => agent.clientId),
  );
  const sumOf = (byAgent: Record<string, number>) =>
    Object.entries(byAgent).reduce(
      (total, [id, count]) => (allowed.has(id) ? total + count : total),
      0,
    );
  const agents = summary.agents.filter((agent) => allowed.has(agent.clientId));
  const days = summary.days.map((day) => ({
    ...day,
    reads: sumOf(day.readsByAgent),
    directs: sumOf(day.directsByAgent),
    proposals: sumOf(day.proposalsByAgent),
    accepted: sumOf(day.acceptedByAgent),
    rejected: sumOf(day.rejectedByAgent),
    pending: sumOf(day.pendingByAgent),
  }));
  const sections = summary.sections
    .map((section) => ({ ...section, count: sumOf(section.byAgent) }))
    .filter((section) => section.count > 0);
  const sumAgents = (
    key:
      | "reads"
      | "directs"
      | "proposals"
      | "accepted"
      | "rejected"
      | "pending",
  ) => agents.reduce((total, agent) => total + agent[key], 0);
  const accepted = sumAgents("accepted");
  const rejected = sumAgents("rejected");
  const windowStart = summary.days[0]?.date;

  return {
    ...summary,
    agents,
    days,
    sections,
    totals: {
      ...summary.totals,
      agents: agents.length,
      newAgents: windowStart
        ? agents.filter(
            (agent) => agent.firstSeen && agent.firstSeen >= windowStart,
          ).length
        : 0,
      reads: sumAgents("reads"),
      directs: sumAgents("directs"),
      proposals: sumAgents("proposals"),
      accepted,
      rejected,
      pending: sumAgents("pending"),
      acceptRate:
        accepted + rejected > 0 ? accepted / (accepted + rejected) : null,
    },
  };
}
