import assert from "node:assert/strict";
import test from "node:test";
import {
  getGrantedClientIds,
  hasActiveConnectionIcon,
  resolveCliAgentStatuses,
} from "../lib/mcp-connection-status.ts";

test("connection status includes only tokens granted to the active Creed", () => {
  const clients = getGrantedClientIds(
    [
      { id: "personal-token", client_id: "creed-cli-personal" },
      { id: "company-token", client_id: "creed-cli-company" },
      { id: "duplicate-token", client_id: "creed-cli-personal" },
    ],
    new Set(["personal-token", "duplicate-token"]),
  );

  assert.deepEqual(clients, ["creed-cli-personal"]);
});

test("a specifically named active OAuth client connects its own icon", () => {
  assert.equal(
    hasActiveConnectionIcon({
      icon: "cli",
      oauthClientNames: ["Creed CLI"],
    }),
    true,
  );
});

test("historical roster rows cannot revive an expired named client", () => {
  assert.equal(
    hasActiveConnectionIcon({
      icon: "cli",
      oauthClientNames: [],
      rosterClientNames: ["Creed CLI"],
    }),
    false,
  );
});

test("generic active OAuth clients may resolve their JSON-RPC identity", () => {
  assert.equal(
    hasActiveConnectionIcon({
      icon: "codex",
      oauthClientNames: ["MCP Client"],
      rosterClientNames: ["Codex"],
    }),
    true,
  );
});

test("a different specifically named client cannot borrow a roster identity", () => {
  assert.equal(
    hasActiveConnectionIcon({
      icon: "codex",
      oauthClientNames: ["Claude"],
      rosterClientNames: ["Codex"],
    }),
    false,
  );
});

test("CLI attribution is bound to an active OAuth token", () => {
  const statuses = resolveCliAgentStatuses(
    new Set(["active-token"]),
    [
      {
        clientId: "cli-expired-token-claude",
        lastSeenAt: "2026-07-14T12:00:00.000Z",
      },
      {
        clientId: "cli-active-token-codex",
        lastSeenAt: "2026-07-14T13:00:00.000Z",
      },
    ],
  );

  assert.deepEqual(statuses, {
    codex: { lastSeenAt: "2026-07-14T13:00:00.000Z" },
  });
});

test("CLI attribution keeps the newest use across active sessions", () => {
  const statuses = resolveCliAgentStatuses(
    new Set(["token-a", "token-b"]),
    [
      { clientId: "cli-token-a-codex", lastSeenAt: "2026-07-14T12:00:00.000Z" },
      { clientId: "cli-token-b-codex", lastSeenAt: "2026-07-14T13:00:00.000Z" },
    ],
  );

  assert.deepEqual(statuses, {
    codex: { lastSeenAt: "2026-07-14T13:00:00.000Z" },
  });
});
