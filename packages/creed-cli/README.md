# Creed CLI

The first-party terminal client for [Creed](https://creed.md). It connects to
the same OAuth-protected MCP server as Claude, Codex, ChatGPT, Cursor, and every
other Creed integration.

The CLI discovers tools, resources, and prompts from the live MCP server. New
Creed tools therefore appear automatically without a matching CLI release.

## Install

```bash
npm install --global creed-cli
creed
```

You can also run it without installing:

```bash
npx creed-cli
```

The first run opens Creed's OAuth screen in your browser. Click Allow and return
to the terminal.

## Interactive terminal

Run `creed` with no arguments and enter any live tool name. Required arguments
are collected from the tool's live JSON schema.

## Commands

```bash
creed login
creed logout
creed status
creed doctor
creed tools
creed call read_creed
creed call creed_search --query "current priorities" --limit 5
creed resources
creed resource creed://profile
creed prompts
creed prompt introduce-me
```

Every MCP tool is also available directly by its exact name:

```bash
creed creed_get_section --section-id goals
```

For scripts and coding agents, use JSON mode:

```bash
creed --agent codex tools --json
creed --agent codex call creed_search --args '{"query":"pricing","limit":5}' --json
printf '%s' '{"sectionId":"goals"}' | creed --agent codex call creed_get_section --json
```

JSON is written to stdout and diagnostics are written to stderr. Interactive
formatting and ANSI colour are disabled automatically outside a terminal.
The per-agent commands copied from `creed.md/connections` include `--agent`
automatically so the dashboard can show real CLI attribution and last-seen
times. Omit it for un-attributed manual terminal use.

## Self-hosted Creed

Use a server for one command:

```bash
creed --server http://localhost:3000/mcp doctor
```

Or save it:

```bash
creed config set server https://your-creed.example/mcp
```

`CREED_MCP_URL` can also set the server. HTTPS is required except on localhost.

## Security

Creed CLI uses OAuth 2.1 Dynamic Client Registration and PKCE. It never asks
you to copy an API token. Credentials are stored per server in the platform
configuration directory with restrictive filesystem permissions and are never
printed by the CLI. `creed logout` revokes the OAuth grant when the server
supports RFC 7009 revocation, then removes local credentials.

Set `NO_COLOR=1` to disable terminal colour.
