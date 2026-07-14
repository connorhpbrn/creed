import { getAgentIconKind } from "./agent-icon.ts";

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
    const tokenId = [...activeTokenIds].find((id) =>
      row.clientId.startsWith(`cli-${id}-`),
    );
    if (!tokenId) continue;
    const agentIcon = row.clientId.slice(`cli-${tokenId}-`.length);
    const existing = agents[agentIcon]?.lastSeenAt;
    if (!existing || (row.lastSeenAt && row.lastSeenAt > existing)) {
      agents[agentIcon] = { lastSeenAt: row.lastSeenAt };
    }
  }
  return agents;
}
