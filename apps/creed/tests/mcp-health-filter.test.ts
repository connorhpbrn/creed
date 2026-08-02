import assert from "node:assert/strict";
import test from "node:test";
import type { McpHealthSummary } from "../components/creed/mcp-health-preload.ts";
import { filterMcpHealthSummary } from "../lib/mcp-health-filter.ts";

const summary: McpHealthSummary = {
  range: "7d",
  totals: {
    agents: 2,
    newAgents: 2,
    reads: 7,
    directs: 3,
    proposals: 2,
    accepted: 1,
    rejected: 1,
    pending: 0,
    acceptRate: 0.5,
  },
  agents: [
    {
      clientId: "codex",
      name: "Codex",
      icon: "codex",
      firstSeen: "2026-07-14T10:00:00.000Z",
      reads: 4,
      directs: 1,
      proposals: 1,
      accepted: 1,
      rejected: 0,
      pending: 0,
    },
    {
      clientId: "cli",
      name: "Creed CLI",
      icon: "cli",
      firstSeen: "2026-07-14T11:00:00.000Z",
      reads: 3,
      directs: 2,
      proposals: 1,
      accepted: 0,
      rejected: 1,
      pending: 0,
    },
  ],
  days: [
    {
      date: "2026-07-14",
      reads: 7,
      directs: 3,
      proposals: 2,
      accepted: 1,
      rejected: 1,
      pending: 0,
      readsByAgent: { codex: 4, cli: 3 },
      directsByAgent: { codex: 1, cli: 2 },
      proposalsByAgent: { codex: 1, cli: 1 },
      acceptedByAgent: { codex: 1 },
      rejectedByAgent: { cli: 1 },
      pendingByAgent: {},
    },
  ],
  sections: [
    {
      sectionId: "goals",
      sectionName: "Goals",
      accent: "orange",
      count: 3,
      byAgent: { codex: 1, cli: 2 },
    },
  ],
};

test("MCP health excludes CLI identity and recomputes every rollup", () => {
  const filtered = filterMcpHealthSummary(summary, "all");

  assert.deepEqual(filtered.agents.map((agent) => agent.clientId), ["codex"]);
  assert.deepEqual(filtered.totals, {
    agents: 1,
    newAgents: 1,
    reads: 4,
    directs: 1,
    proposals: 1,
    accepted: 1,
    rejected: 0,
    pending: 0,
    acceptRate: 1,
  });
  assert.equal(filtered.days[0]?.reads, 4);
  assert.equal(filtered.days[0]?.directs, 1);
  assert.equal(filtered.sections[0]?.count, 1);
});

test("MCP health category filters cannot restore CLI data", () => {
  const filtered = filterMcpHealthSummary(summary, "personal");

  assert.equal(filtered.agents.length, 0);
  assert.equal(filtered.totals.reads, 0);
  assert.equal(filtered.sections.length, 0);
});
