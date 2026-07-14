import { stdin as input } from "node:process";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { CLI_VERSION, DEFAULT_SERVER_URL } from "./constants.js";
import { parseToolArguments } from "./commands/arguments.js";
import { loadCredential, loadSavedServer, saveServer } from "./config/store.js";
import { CliError } from "./errors.js";
import { connectCreed, listAllPrompts, listAllResources, listAllTools } from "./mcp/client.js";
import { printToolResult, writeJson } from "./terminal/output.js";
import { runInteractive } from "./terminal/interactive.js";
import { revokeTokens } from "./auth/revoke.js";

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function usage(): string {
  return `Usage: creed [--agent ID] [command]\n\nCommands:\n  login                  Connect through Creed OAuth\n  logout                 Revoke and remove this connection\n  status                  Show local connection status\n  doctor                  Verify OAuth, MCP, tools, resources, and prompts\n  tools [--json]          List live MCP tools\n  call <tool> [options]   Call an exact MCP tool name\n  resources [--json]      List live MCP resources\n  resource <uri>          Read a resource\n  prompts [--json]        List live MCP prompts\n  prompt <name>           Get a prompt\n  config set server URL   Save a hosted or self-hosted MCP URL\n\nPass --agent ID when an agent invokes the CLI so Creed can attribute usage.\nRun creed with no command for the interactive terminal.\n`;
}

export async function run(argv: string[]): Promise<void> {
  const json = argv.includes("--json");
  const quiet = argv.includes("--quiet");
  const explicitServer = optionValue(argv, "--server") ?? process.env.CREED_MCP_URL;
  const agent = optionValue(argv, "--agent");
  const serverUrl = explicitServer ?? await loadSavedServer() ?? DEFAULT_SERVER_URL;
  const args = argv.filter((value, index) =>
    value !== "--server" && argv[index - 1] !== "--server" &&
    value !== "--agent" && argv[index - 1] !== "--agent" &&
    value !== "--json" && value !== "--quiet"
  );
  const command = args[0];

  if (command === "--version" || command === "-v") {
    process.stdout.write(`${CLI_VERSION}\n`);
    return;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(usage());
    return;
  }
  if (command === "config") {
    if (args[1] !== "set" || args[2] !== "server" || !args[3]) throw new CliError("Usage: creed config set server <URL>", 2);
    const url = new URL(args[3]);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      throw new CliError("Creed requires HTTPS, except for an explicit localhost server.", 2);
    }
    await saveServer(url.toString());
    process.stdout.write(`Saved ${url.toString()}\n`);
    return;
  }
  if (command === "status") {
    const credential = await loadCredential(serverUrl);
    const connected = Boolean(credential.tokens && credential.clientInformation);
    const value = { connected, server: serverUrl, clientRegistered: Boolean(credential.clientInformation), tokensStored: Boolean(credential.tokens) };
    if (json) writeJson(value); else process.stdout.write(`${connected ? "Connected" : "Not connected"}\nServer: ${serverUrl}\n`);
    return;
  }
  if (command === "logout") {
    const credential = await loadCredential(serverUrl);
    let revoked = false;
    try {
      revoked = await revokeTokens(serverUrl, credential.tokens as OAuthTokens | undefined, credential.clientInformation as OAuthClientInformationMixed | undefined);
    } catch { revoked = false; }
    const callback = await import("./config/store.js");
    await callback.removeCredential(serverUrl);
    if (json) writeJson({ ok: true, revoked, localCredentialsRemoved: true });
    else process.stdout.write(revoked ? "Disconnected Creed CLI.\n" : "Removed local credentials. Remote revocation could not be confirmed.\n");
    return;
  }

  const connection = await connectCreed(serverUrl, quiet, agent);
  try {
    if (command === "login") {
      if (json) writeJson({ ok: true, server: serverUrl }); else process.stdout.write("Creed CLI is connected.\n");
      return;
    }
    if (command === "tools") {
      const tools = await listAllTools(connection.client);
      if (json) writeJson(tools); else for (const tool of tools) process.stdout.write(`${tool.name.padEnd(30)} ${tool.description ?? ""}\n`);
      return;
    }
    if (command === "resources") {
      const resources = await listAllResources(connection.client);
      if (json) writeJson(resources); else for (const resource of resources) process.stdout.write(`${resource.uri}\t${resource.name}\n`);
      return;
    }
    if (command === "resource") {
      if (!args[1]) throw new CliError("Usage: creed resource <uri>", 2);
      const result = await connection.client.readResource({ uri: args[1] });
      if (json) writeJson(result); else for (const content of result.contents) process.stdout.write(`${"text" in content ? content.text : JSON.stringify(content)}\n`);
      return;
    }
    if (command === "prompts") {
      const prompts = await listAllPrompts(connection.client);
      if (json) writeJson(prompts); else for (const prompt of prompts) process.stdout.write(`${prompt.name.padEnd(24)} ${prompt.description ?? ""}\n`);
      return;
    }
    if (command === "prompt") {
      if (!args[1]) throw new CliError("Usage: creed prompt <name> [--args JSON]", 2);
      const rawArgs = optionValue(args, "--args");
      const promptArgs = rawArgs ? JSON.parse(rawArgs) as Record<string, string> : undefined;
      const result = await connection.client.getPrompt({ name: args[1], ...(promptArgs ? { arguments: promptArgs } : {}) });
      writeJson(result);
      return;
    }
    if (command === "doctor") {
      const [tools, resources, prompts] = await Promise.all([listAllTools(connection.client), listAllResources(connection.client), listAllPrompts(connection.client)]);
      const value = { ok: true, server: serverUrl, serverInfo: connection.client.getServerVersion(), protocolInstructions: Boolean(connection.client.getInstructions()), tools: tools.length, resources: resources.length, prompts: prompts.length };
      if (json) writeJson(value); else process.stdout.write(`Connected to ${value.serverInfo?.name ?? "Creed"}.\nTools: ${tools.length}\nResources: ${resources.length}\nPrompts: ${prompts.length}\n`);
      return;
    }

    const tools = await listAllTools(connection.client);
    const toolName = command === "call" ? args[1] : command;
    if (toolName) {
      const tool = tools.find((entry) => entry.name === toolName);
      if (!tool) throw new CliError(`Unknown command or MCP tool: ${toolName}. Run \`creed tools\` to list live tools.`, 2);
      const offset = command === "call" ? 2 : 1;
      let toolTokens = args.slice(offset);
      if (!process.stdin.isTTY && !toolTokens.includes("--args") && !toolTokens.includes("--file")) {
        const stdin = (await readStdin()).trim();
        if (stdin) toolTokens = ["--args", stdin, ...toolTokens];
      }
      const toolArgs = await parseToolArguments(toolTokens, tool.inputSchema);
      const result = await connection.client.callTool({ name: tool.name, arguments: toolArgs });
      printToolResult(result, json);
      if (result.isError) throw new CliError("The Creed tool returned an error.", 3);
      return;
    }
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new CliError("Interactive mode requires a terminal. Use `creed --help` for scriptable commands.", 2);
    await runInteractive(connection.client, tools);
  } finally {
    await connection.close();
  }
}
