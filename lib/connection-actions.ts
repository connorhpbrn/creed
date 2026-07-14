import type { ConnectionAction, McpClient } from "@/lib/creed-data";

// Per-agent connect buttons + hint, computed on the client from the MCP URL.
//
// These deliberately do NOT live in the server-built connection definitions:
// the Creed provider snapshots server state once per page load
// (useState(initialState)) and ignores later props, so anything static baked
// into that payload goes stale in an open tab until a full reload with fresh
// server state. Deriving the presentation here keeps the cards on the normal
// component hot-reload path - edit this file and the open tab updates.
export type ConnectionPresentation = {
  hint?: string;
  primary?: ConnectionAction;
  secondary?: ConnectionAction;
};

export function splitConnectionClients(clients: McpClient[]) {
  return {
    mcp: clients.filter((client) => client.icon !== "cli"),
    cli: clients.filter((client) => client.icon === "cli"),
  };
}

export function getCliConnectionPresentation(
  connectionId: string,
  connectionName: string,
): ConnectionPresentation {
  const command = `npx creed-cli --agent ${connectionId} call read_creed --json`;
  return {
    hint: `Use Creed CLI with ${connectionName}. The first run opens the Creed OAuth screen, then the same command reads your live context whenever the agent needs it.`,
    primary: {
      kind: "copy",
      label: "Copy prompt",
      value: `Use the Creed CLI for my personal context. Before meaningful work, run \`${command}\`, complete the browser authorization if prompted, and use the returned Creed to shape your response.`,
    },
    secondary: {
      kind: "copy",
      label: "Copy command",
      value: command,
    },
  };
}

export function getConnectionPresentation(
  connectionId: string,
  mcpUrl: string,
): ConnectionPresentation {
  const copyUrl: ConnectionAction = {
    kind: "copy",
    label: "Copy URL",
    value: mcpUrl,
  };
  // Universal fallback secondary: a prompt the user pastes into the agent
  // itself, for clients with no install link, CLI, or settings URL.
  const copyPrompt: ConnectionAction = {
    kind: "copy",
    label: "Copy prompt",
    value: `Add a remote MCP server named "creed" at ${mcpUrl} (streamable HTTP with OAuth), then authorize it in the browser window it opens.`,
  };

  switch (connectionId) {
    case "cursor": {
      // Cursor one-click install. The config is the minimal remote-server
      // shape from Cursor's docs ({url} only - presence of `url` selects HTTP
      // transport and Cursor runs the OAuth flow itself, so no token is
      // embedded). The https://cursor.com/install-mcp link takes the same
      // base64 config as the cursor:// deeplink but also works where the OS
      // scheme handler doesn't (browsers, Cursor's web/agents views) and
      // hands off to the app.
      const config = btoa(JSON.stringify({ url: mcpUrl }));
      return {
        primary: {
          kind: "install",
          label: "Add MCP",
          href: `https://cursor.com/install-mcp?name=creed&config=${encodeURIComponent(config)}`,
        },
        secondary: {
          kind: "copy",
          label: "Copy JSON",
          value: JSON.stringify(
            { mcpServers: { creed: { url: mcpUrl } } },
            null,
            2,
          ),
        },
      };
    }
    case "claude":
      return {
        primary: {
          kind: "open",
          label: "Open connectors",
          href: "https://claude.ai/customize/connectors",
        },
        secondary: copyUrl,
      };
    case "chatgpt":
      return {
        primary: copyUrl,
        secondary: {
          kind: "open",
          label: "Open settings",
          href: "https://chatgpt.com/#settings/Connectors",
        },
      };
    case "claudecode":
      return {
        hint: "Paste the prompt into Claude Code and it adds Creed itself; run /mcp after to authorize in the browser.",
        primary: {
          kind: "copy",
          label: "Copy prompt",
          value: `Add the Creed MCP server by running: claude mcp add --transport http creed ${mcpUrl} --scope user. Then tell me to run /mcp to authorize it in the browser.`,
        },
        secondary: {
          kind: "copy",
          label: "Copy JSON",
          value: JSON.stringify(
            { mcpServers: { creed: { type: "http", url: mcpUrl } } },
            null,
            2,
          ),
        },
      };
    case "codex":
      return {
        hint: "Paste the prompt into Codex and it adds Creed itself, then authorize in the browser.",
        primary: {
          kind: "copy",
          label: "Copy prompt",
          value: `Add the Creed MCP server by running: codex mcp add creed --url ${mcpUrl}. Then run codex mcp login creed so I can authorize it in the browser.`,
        },
        secondary: {
          kind: "copy",
          label: "Copy TOML",
          value: `[mcp_servers.creed]\nurl = "${mcpUrl}"`,
        },
      };
    case "opencode":
      return {
        hint: "Add the JSON below to opencode.json, then run opencode mcp auth creed to authorize in the browser.",
        primary: {
          kind: "copy",
          label: "Copy JSON",
          value: JSON.stringify(
            { mcp: { creed: { type: "remote", url: mcpUrl, enabled: true } } },
            null,
            2,
          ),
        },
        secondary: {
          kind: "copy",
          label: "Copy command",
          value: "opencode mcp auth creed",
        },
      };
    case "factory":
      return {
        hint: "Run the command below, then /mcp inside droid to authorize in the browser.",
        primary: {
          kind: "copy",
          label: "Copy command",
          value: `droid mcp add creed ${mcpUrl} --type http`,
        },
        secondary: {
          kind: "copy",
          label: "Copy JSON",
          value: JSON.stringify(
            { mcpServers: { creed: { type: "http", url: mcpUrl } } },
            null,
            2,
          ),
        },
      };
    case "grok":
      return {
        primary: {
          kind: "open",
          label: "Open connectors",
          href: "https://grok.com/connectors",
        },
        secondary: copyUrl,
      };
    case "devin":
      return {
        hint: "In Devin, open Settings > Connections > MCP servers, add a custom MCP with the URL above then transport HTTP and OAuth.",
        primary: {
          kind: "open",
          label: "Open settings",
          href: "https://app.devin.ai/settings",
        },
        secondary: copyUrl,
      };
    case "v0":
      return {
        primary: {
          kind: "open",
          label: "Open connections",
          href: "https://v0.app/settings/mcp-connections",
        },
        secondary: copyUrl,
      };
    case "replit":
      return {
        hint: "In Replit, open the Agent's Integrations pane, add a custom MCP server with the URL above, and authorize Creed with OAuth.",
        primary: copyPrompt,
        secondary: copyUrl,
      };
    case "manus":
      return {
        hint: "In Manus, open Settings > Connectors > Add custom MCP, enter the URL above with transport HTTP, then authorize.",
        primary: copyPrompt,
        secondary: copyUrl,
      };
    case "openclaw":
    case "hermes":
    case "whirl":
    case "custom":
      return { primary: copyPrompt, secondary: copyUrl };
    default:
      return {};
  }
}
