import {
  CLI_ATTRIBUTABLE_AGENT_IDS,
  getAgentIconKind,
} from "./agent-icon.ts";

type OAuthTokenIdentity = {
  id: string;
  client_id: string;
};

export function getGrantedClientIds(
  activeTokens: OAuthTokenIdentity[],
  grantedTokenIds: ReadonlySet<string>,
) {
  return [
    ...new Set(
      activeTokens
        .filter((token) => grantedTokenIds.has(token.id))
        .map((token) => token.client_id),
    ),
  ];
}

export function hasActiveConnectionIcon({
  icon,
  oauthClientNames,
  rosterClientNames = [],
}: {
  icon: string;
  oauthClientNames: string[];
  rosterClientNames?: string[];
}) {
  if (oauthClientNames.some((name) => getAgentIconKind(name) === icon)) {
    return true;
  }

  const hasGenericClient = oauthClientNames.some(
    (name) => name.trim().toLowerCase() === "mcp client",
  );
  return hasGenericClient &&
    rosterClientNames.some((name) => getAgentIconKind(name) === icon);
}

export function resolveCliAgentStatuses(
  activeTokenIds: ReadonlySet<string>,
  rows: Array<{ clientId: string; lastSeenAt: string | null }>,
) {
  const agents: Record<string, { lastSeenAt: string | null }> = {};
  for (const row of rows) {
    if (!row.clientId.startsWith("cli-")) continue;
    const agentIcon = CLI_ATTRIBUTABLE_AGENT_IDS.find((id) =>
      row.clientId.endsWith(`-${id}`),
    );
    if (!agentIcon) continue;
    const suffix = `-${agentIcon}`;
    const tokenId = row.clientId.slice(4, -suffix.length);
    if (!activeTokenIds.has(tokenId)) continue;
    const existing = agents[agentIcon]?.lastSeenAt;
    if (!existing || (row.lastSeenAt && row.lastSeenAt > existing)) {
      agents[agentIcon] = { lastSeenAt: row.lastSeenAt };
    }
  }
  return agents;
}
