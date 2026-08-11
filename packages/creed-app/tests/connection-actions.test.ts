import assert from "node:assert/strict";
import test from "node:test";
import {
  getCliConnectionPresentation,
  getConnectionPresentation,
  splitConnectionClients,
} from "../lib/connection-actions.ts";

test("keeps the CLI identity out of the MCP connection roster", () => {
  const clients = splitConnectionClients([
    { id: "codex-client", name: "Codex", icon: "codex" },
    { id: "cli-client", name: "Creed CLI", icon: "cli" },
    { id: "chatgpt-client", name: "ChatGPT", icon: "chatgpt" },
  ]);

  assert.deepEqual(clients.mcp.map((client) => client.icon), ["codex", "chatgpt"]);
  assert.deepEqual(clients.cli.map((client) => client.icon), ["cli"]);
});

test("CLI mode always offers a prompt followed by the executable command", () => {
  const presentation = getCliConnectionPresentation("codex", "Codex");

  assert.deepEqual(presentation.primary, {
    kind: "copy",
    label: "Copy prompt",
    value: "Use the Creed CLI for my personal context. Before meaningful work, run `npx creed-cli --agent codex call read_creed --json`, complete the browser authorization if prompted, and use the returned Creed to shape your response.",
  });
  assert.deepEqual(presentation.secondary, {
    kind: "copy",
    label: "Copy command",
    value: "npx creed-cli --agent codex call read_creed --json",
  });
});

test("MCP mode keeps each agent's native connection actions", () => {
  const presentation = getConnectionPresentation("codex", "https://creed.md/mcp");

  assert.equal(presentation.primary?.label, "Copy prompt");
  assert.equal(presentation.secondary?.label, "Copy TOML");
});
