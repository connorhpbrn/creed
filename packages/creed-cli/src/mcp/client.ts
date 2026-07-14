import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { createCallbackListener } from "../auth/callback-server.js";
import { CreedOAuthProvider } from "../auth/oauth-provider.js";
import { CLI_VERSION } from "../constants.js";
import { CliError } from "../errors.js";

export type ConnectedCreedClient = {
  client: Client;
  provider: CreedOAuthProvider;
  close(): Promise<void>;
};

export async function connectCreed(
  serverUrl: string,
  quiet = false,
  agent?: string,
): Promise<ConnectedCreedClient> {
  const callback = await createCallbackListener();
  const provider = new CreedOAuthProvider(serverUrl, callback.redirectUrl, quiet);
  await provider.load();

  const makeConnection = async (): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> => {
    const client = new Client({ name: "creed-cli", version: CLI_VERSION }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
      authProvider: provider,
      requestInit: agent
        ? { headers: { "X-Creed-CLI-Agent": agent } }
        : undefined,
    });
    await client.connect(transport);
    return { client, transport };
  };

  try {
    try {
      const connected = await makeConnection();
      await callback.close();
      return { client: connected.client, provider, close: () => connected.client.close() };
    } catch (error) {
      if (!(error instanceof UnauthorizedError)) throw error;
      const result = await callback.waitForCallback();
      const expectedState = provider.expectedState();
      if (expectedState && result.state !== expectedState) {
        throw new CliError("OAuth state validation failed. Login was cancelled for your safety.");
      }
      const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
        authProvider: provider,
        requestInit: agent
          ? { headers: { "X-Creed-CLI-Agent": agent } }
          : undefined,
      });
      await transport.finishAuth(result.code);
      const connected = await makeConnection();
      await callback.close();
      return { client: connected.client, provider, close: () => connected.client.close() };
    }
  } catch (error) {
    await callback.close();
    throw error;
  }
}

export async function listAllTools(client: Client): Promise<Tool[]> {
  const tools: Tool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  return tools;
}

export async function listAllResources(client: Client) {
  const resources: Awaited<ReturnType<Client["listResources"]>>["resources"] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listResources(cursor ? { cursor } : undefined);
    resources.push(...page.resources);
    cursor = page.nextCursor;
  } while (cursor);
  return resources;
}

export async function listAllPrompts(client: Client) {
  const prompts: Awaited<ReturnType<Client["listPrompts"]>>["prompts"] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listPrompts(cursor ? { cursor } : undefined);
    prompts.push(...page.prompts);
    cursor = page.nextCursor;
  } while (cursor);
  return prompts;
}
