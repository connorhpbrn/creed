import "server-only";
// MCP health aggregation for the /connections dashboard. Reads three sources -
// the per-agent daily read rollup (creed_mcp_read_events), the connected-agent
// roster (creed_mcp_clients), and agent-authored activity (creed_activity) -
// and folds them into one summary the client renders with recharts. All of this
// lives off the hot loadCreedState path: it's fetched on demand by the route.
import type { AgentIconKind } from "@/lib/creed-data";
import { accentColorMap, normalizeLegacySectionId, isAccentKey } from "@/lib/creed-data";
import { inferAgentIconKind, normalizeMcpClientId } from "@/lib/creed-backend";

export type McpHealthRange = "7d" | "30d" | "90d";

export const MCP_HEALTH_RANGES: readonly McpHealthRange[] = ["7d", "30d", "90d"];

export function isMcpHealthRange(value: string): value is McpHealthRange {
  return (MCP_HEALTH_RANGES as readonly string[]).includes(value);
}

export type McpHealthAgent = {
  clientId: string;
  name: string;
  icon: AgentIconKind;
  firstSeen?: string;
  lastSeen?: string;
  reads: number;
  directs: number;
  proposals: number;
  accepted: number;
  rejected: number;
  pending: number;
};

// Each day carries every metric, broken down by agent, so the client can
// switch metric and filter by agent without another round-trip.
export type McpHealthDay = {
  date: string;
  reads: number;
  directs: number;
  proposals: number;
  accepted: number;
  rejected: number;
  pending: number;
  readsByAgent: Record<string, number>;
  directsByAgent: Record<string, number>;
  proposalsByAgent: Record<string, number>;
  acceptedByAgent: Record<string, number>;
  rejectedByAgent: Record<string, number>;
  pendingByAgent: Record<string, number>;
};

export type McpHealthSection = {
  sectionId: string;
  sectionName: string;
  accent: string;
  count: number;
  byAgent: Record<string, number>;
};

export type McpHealthSummary = {
  range: McpHealthRange;
  totals: {
    agents: number;
    newAgents: number;
    reads: number;
    directs: number;
    proposals: number;
    accepted: number;
    rejected: number;
    pending: number;
    acceptRate: number | null;
  };
  days: McpHealthDay[];
  agents: McpHealthAgent[];
  sections: McpHealthSection[];
};

type QueryResult = { data: unknown; error: { message: string } | null };

type QueryFilter = Promise<QueryResult> & {
  eq: (column: string, value: unknown) => QueryFilter;
  gte: (column: string, value: unknown) => QueryFilter;
};

type SupabaseLike = {
  from: (table: string) => { select: (columns: string) => QueryFilter };
};

type ReadEventRow = { client_id: string; day: string; read_count: number };
type ClientRow = { client_id: string; client_name: string; last_seen_at: string | null; created_at: string | null };
type ActivityRow = {
  actor: string;
  actor_type: string;
  section_id: string;
  section_name: string;
  accent: string;
  status: string;
  created_at: string;
};

function rangeDays(range: McpHealthRange) {
  return range === "7d" ? 7 : range === "30d" ? 30 : 90;
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Continuous day buckets from (today - n + 1) through today, so a sparse
// rollup still renders as an unbroken time-series instead of gappy bars.
function buildDayWindow(range: McpHealthRange): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = rangeDays(range) - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    days.push(isoDay(d));
  }
  return days;
}

function resolveAccent(accent: string): string {
  return isAccentKey(accent) ? accentColorMap[accent] : "var(--accent-color-mono)";
}

// Which rows the dashboard aggregates. Personal Creeds scope by the owning
// user (byte-identical to the original behaviour); company Creeds scope by
// creed_id so a team's dashboard shows only that team's agents, reads, and
// proposal outcomes - never the viewer's personal MCP activity. A fresh team
// has no creed_id-stamped rows yet, so it correctly shows zero.
export type McpHealthScope =
  | { kind: "user"; userId: string }
  | { kind: "creed"; creedId: string };

export async function loadMcpHealth(
  client: unknown,
  scope: McpHealthScope,
  range: McpHealthRange
): Promise<McpHealthSummary> {
  const db = client as unknown as SupabaseLike;
  const window = buildDayWindow(range);
  const windowStart = window[0];
  const windowStartIso = `${windowStart}T00:00:00.000Z`;

  const [scopeColumn, scopeValue] =
    scope.kind === "creed" ? (["creed_id", scope.creedId] as const) : (["user_id", scope.userId] as const);

  const [readEvents, clients, activity] = await Promise.all([
    db.from("creed_mcp_read_events").select("client_id, day, read_count").eq(scopeColumn, scopeValue).gte("day", windowStart),
    db.from("creed_mcp_clients").select("client_id, client_name, last_seen_at, created_at").eq(scopeColumn, scopeValue).gte("created_at", "1970-01-01"),
    db.from("creed_activity").select("actor, actor_type, section_id, section_name, accent, status, created_at").eq(scopeColumn, scopeValue).gte("created_at", windowStartIso),
  ]);

  const readRows = (readEvents.data as ReadEventRow[] | null) ?? [];
  const clientRows = (clients.data as ClientRow[] | null) ?? [];
  const activityRows = ((activity.data as ActivityRow[] | null) ?? []).filter(
    (row) => row.actor_type === "agent"
  );

  // Agent roster keyed by the normalized client id. Activity rows store a
  // display name ("Codex") while clients store a connect name ("codex-check");
  // both run through normalizeMcpClientId so they resolve to the same id and
  // attribute correctly. Read events are already keyed by that id.
  const agents = new Map<string, McpHealthAgent>();
  for (const row of clientRows) {
    const clientId = row.client_id;
    agents.set(clientId, {
      clientId,
      name: row.client_name,
      icon: inferAgentIconKind(row.client_name),
      firstSeen: row.created_at ?? undefined,
      lastSeen: row.last_seen_at ?? undefined,
      reads: 0,
      directs: 0,
      proposals: 0,
      accepted: 0,
      rejected: 0,
      pending: 0,
    });
  }

  // Resolve an activity actor to a roster agent, creating a synthetic entry for
  // agents that have activity but never recorded a read, so nothing drops.
  const agentForActor = (actor: string): McpHealthAgent => {
    const id = normalizeMcpClientId(actor) || "custom";
    let agent = agents.get(id);
    if (!agent) {
      agent = {
        clientId: id,
        name: actor,
        icon: inferAgentIconKind(actor),
        reads: 0,
        directs: 0,
        proposals: 0,
        accepted: 0,
        rejected: 0,
        pending: 0,
      };
      agents.set(id, agent);
    }
    return agent;
  };

  // Per-day buckets, seeded with the full window so the chart has no gaps.
  const dayMap = new Map<string, McpHealthDay>();
  for (const day of window) {
    dayMap.set(day, {
      date: day,
      reads: 0,
      directs: 0,
      proposals: 0,
      accepted: 0,
      rejected: 0,
      pending: 0,
      readsByAgent: {},
      directsByAgent: {},
      proposalsByAgent: {},
      acceptedByAgent: {},
      rejectedByAgent: {},
      pendingByAgent: {},
    });
  }

  let totalReads = 0;
  for (const row of readRows) {
    const day = row.day.slice(0, 10);
    const bucket = dayMap.get(day);
    const count = Number(row.read_count) || 0;
    totalReads += count;
    const agent = agents.get(row.client_id);
    if (agent) agent.reads += count;
    if (bucket) {
      bucket.reads += count;
      bucket.readsByAgent[row.client_id] = (bucket.readsByAgent[row.client_id] ?? 0) + count;
    }
  }

  // Agent activity splits on status: "direct" rows are direct edits, the
  // pending/accepted/rejected rows are proposals.
  let totalDirects = 0;
  let totalProposals = 0;
  let accepted = 0;
  let rejected = 0;
  let pending = 0;
  const sectionMap = new Map<string, McpHealthSection>();
  for (const row of activityRows) {
    const day = row.created_at.slice(0, 10);
    const bucket = dayMap.get(day);
    const isDirect = row.status === "direct";
    const agent = agentForActor(row.actor);
    const agentId = agent.clientId;

    if (isDirect) {
      totalDirects += 1;
      agent.directs += 1;
      if (bucket) {
        bucket.directs += 1;
        bucket.directsByAgent[agentId] = (bucket.directsByAgent[agentId] ?? 0) + 1;
      }
    } else {
      totalProposals += 1;
      agent.proposals += 1;
      if (bucket) {
        bucket.proposals += 1;
        bucket.proposalsByAgent[agentId] = (bucket.proposalsByAgent[agentId] ?? 0) + 1;
      }
      if (row.status === "accepted") {
        accepted += 1;
        agent.accepted += 1;
        if (bucket) {
          bucket.accepted += 1;
          bucket.acceptedByAgent[agentId] = (bucket.acceptedByAgent[agentId] ?? 0) + 1;
        }
      } else if (row.status === "rejected") {
        rejected += 1;
        agent.rejected += 1;
        if (bucket) {
          bucket.rejected += 1;
          bucket.rejectedByAgent[agentId] = (bucket.rejectedByAgent[agentId] ?? 0) + 1;
        }
      } else if (row.status === "pending") {
        pending += 1;
        agent.pending += 1;
        if (bucket) {
          bucket.pending += 1;
          bucket.pendingByAgent[agentId] = (bucket.pendingByAgent[agentId] ?? 0) + 1;
        }
      }
    }

    // Section coverage counts every agent edit (directs + proposals).
    const sectionId = normalizeLegacySectionId(row.section_id);
    const existing = sectionMap.get(sectionId);
    if (existing) {
      existing.count += 1;
      existing.byAgent[agentId] = (existing.byAgent[agentId] ?? 0) + 1;
    } else {
      sectionMap.set(sectionId, {
        sectionId,
        sectionName: row.section_name,
        accent: resolveAccent(row.accent),
        count: 1,
        byAgent: { [agentId]: 1 },
      });
    }
  }

  const newAgents = clientRows.filter(
    (row) => row.created_at && row.created_at >= windowStartIso
  ).length;

  const agentList = [...agents.values()].sort(
    (a, b) => b.reads - a.reads || b.directs + b.proposals - (a.directs + a.proposals)
  );
  const sections = [...sectionMap.values()].sort((a, b) => b.count - a.count);
  const resolved = accepted + rejected;

  return {
    range,
    totals: {
      agents: agents.size,
      newAgents,
      reads: totalReads,
      directs: totalDirects,
      proposals: totalProposals,
      accepted,
      rejected,
      pending,
      acceptRate: resolved > 0 ? accepted / resolved : null,
    },
    days: window.map((day) => dayMap.get(day) as McpHealthDay),
    agents: agentList,
    sections,
  };
}
