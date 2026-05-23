"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { KeyRound, Link2 } from "lucide-react";
import { AnimatedCheckmark } from "@/components/ui/animated-checkmark";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CopyIcon } from "@/components/ui/copy";
import { Check, ChevronDown } from "lucide-react";
import { AgentIconStack } from "@/components/creed/agent-icon-stack";
import { AnimatedIconButton } from "@/components/creed/animated-icon-action";
import { IntegrationGlyph } from "@/components/creed/brand";
import { useCreed } from "@/components/creed/creed-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function maskToken(token: string) {
  if (!token) {
    return token;
  }

  if (token.length <= 12) {
    return `${token.slice(0, 4)}****${token.slice(-2)}`;
  }

  return `${token.slice(0, 8)}********${token.slice(-6)}`;
}

function maskSensitiveText(value: string) {
  return value
    .replace(/token=([A-Za-z0-9_-]+)/g, (_match, token: string) => `token=${maskToken(token)}`)
    .replace(/\bxt_(?:read|proposal|write|mcp)_[A-Za-z0-9_-]+\b/g, (token: string) => maskToken(token));
}

function getPromptButtonClasses(connectionId: string) {
  switch (connectionId) {
    case "codex":
      return "bg-[#2563EB] text-white transition-colors hover:bg-[#1D4ED8]";
    case "claude":
      return "bg-[#FF6200] text-white hover:bg-[#E65A00]";
    case "openclaw":
      return "bg-[#FF0000] text-white hover:bg-[#E00000]";
    case "hermes":
      return "bg-[#FFBB00] text-white hover:bg-[#E6A900] dark:bg-[#D9A000] dark:hover:bg-[#B88600]";
    case "cursor":
    case "windsurf":
    case "opencode":
      return "bg-[#171717] text-white hover:bg-[#0F0F0F] dark:bg-[#e7e7e2] dark:text-[#0e0e0d] dark:hover:bg-[#cfcfc8]";
    case "custom":
      return "border border-[var(--creed-border-strong)] bg-[var(--creed-surface)] text-[var(--creed-text-primary)] hover:bg-[var(--creed-surface-raised)]";
    default:
      return "bg-[var(--creed-text-primary)] text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]";
  }
}

function buildOpenCodeMcpConfig(url: string, token: string) {
  return JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      mcp: {
        creed: {
          type: "remote",
          url,
          enabled: true,
          oauth: false,
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 30000,
        },
      },
    },
    null,
    2
  );
}

function buildMcpServersConfig(url: string, token: string) {
  return JSON.stringify(
    {
      mcpServers: {
        creed: {
          url,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    },
    null,
    2
  );
}

function buildClaudeCodeConfig(url: string, token: string) {
  return [
    "claude mcp add-json creed '",
    JSON.stringify(
      {
        type: "http",
        url,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      null,
      2
    ),
    "'",
  ].join("");
}

function buildCodexMcpConfig(url: string, token: string) {
  return [
    "[mcp_servers.creed]",
    `url = "${url}"`,
    "enabled = true",
    "",
    "[mcp_servers.creed.http_headers]",
    `Authorization = "Bearer ${token}"`,
  ].join("\n");
}

type ManualMcpAgentId =
  | "custom"
  | "codex"
  | "claude"
  | "opencode"
  | "cursor"
  | "windsurf"
  | "openclaw"
  | "hermes";

type ManualMcpAgent = {
  id: ManualMcpAgentId;
  name: string;
  icon: "custom" | "codex" | "claude" | "opencode" | "cursor" | "windsurf" | "openclaw" | "hermes";
  tint: string;
  format: string;
  detail: string;
  buildConfig: (url: string, token: string, fallbackConfig: string) => string;
};

const manualMcpAgents: ManualMcpAgent[] = [
  {
    id: "custom",
    name: "Custom agent",
    icon: "custom",
    tint: "#6B7280",
    format: "mcpServers JSON",
    detail: "For clients that accept standard mcpServers JSON.",
    buildConfig: (_url, _token, fallbackConfig) => fallbackConfig,
  },
  {
    id: "codex",
    name: "Codex",
    icon: "codex",
    tint: "#2563EB",
    format: "config.toml",
    detail: "Add this to ~/.codex/config.toml.",
    buildConfig: buildCodexMcpConfig,
  },
  {
    id: "claude",
    name: "Claude Code",
    icon: "claude",
    tint: "#FF6200",
    format: "claude mcp add-json",
    detail: "Run this command from Claude Code.",
    buildConfig: buildClaudeCodeConfig,
  },
  {
    id: "opencode",
    name: "OpenCode",
    icon: "opencode",
    tint: "#171717",
    format: "opencode.json",
    detail: "Use oauth false so OpenCode does not start OAuth.",
    buildConfig: buildOpenCodeMcpConfig,
  },
  {
    id: "cursor",
    name: "Cursor",
    icon: "cursor",
    tint: "#171717",
    format: "mcp.json",
    detail: "Use this in Cursor's MCP config.",
    buildConfig: buildMcpServersConfig,
  },
  {
    id: "windsurf",
    name: "Windsurf",
    icon: "windsurf",
    tint: "#0EA5E9",
    format: "mcp_config.json",
    detail: "Use this in Windsurf's MCP config.",
    buildConfig: buildMcpServersConfig,
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    icon: "openclaw",
    tint: "#FF0000",
    format: "mcpServers JSON",
    detail: "Use the standard remote MCP server shape.",
    buildConfig: buildMcpServersConfig,
  },
  {
    id: "hermes",
    name: "Hermes",
    icon: "hermes",
    tint: "#FFBB00",
    format: "mcpServers JSON",
    detail: "Use the standard remote MCP server shape.",
    buildConfig: buildMcpServersConfig,
  },
];

function buildMcpSetupPrompt(config: string, opencodeConfig: string) {
  return [
    "Set up Creed MCP for me in this agent environment.",
    "",
    "Before you do anything else:",
    "- Read https://creed.md/docs once and use it as the operating guide for this setup.",
    "",
    "Goal:",
    "- Install the Creed MCP server config below into your persistent MCP configuration so future sessions can use Creed without me pasting this setup prompt again.",
    "- This should be a one-prompt setup. Do the install, verification, and durable reminder now without asking me to paste a second prompt.",
    "- After installing it, verify the connection by listing the MCP tools and calling read_creed once.",
    "- Also call get_write_policy and confirm whether you can direct_edit_creed or should use propose_creed_update.",
    "- Do not claim Creed is connected unless read_creed succeeds and you can see a valid write policy.",
    "- Read Creed before meaningful work and identify the sections that matter for the task before planning.",
    "- At the end of meaningful work, use the self-improvement contract from Creed to decide whether the file should be refined, pruned, or left unchanged.",
    "- If a durable improvement exists, use propose_creed_update or direct_edit_creed according to the write policy.",
    "- If nothing durable changed, do nothing. Do not create update noise just to show activity.",
    "- When calling Creed MCP tools, include your product name as agentName when the tool accepts it, for example Codex, Claude Code, OpenClaw, Hermes, OpenCode, or Custom Agent.",
    "",
    "OpenCode-specific setup:",
    "- If this environment is OpenCode, do not run opencode mcp auth creed. Creed MCP uses a bearer token, not OAuth.",
    "- Install the OpenCode config below into the persistent OpenCode config, usually ~/.config/opencode/opencode.json or the active project opencode.json.",
    "- Keep oauth set to false so OpenCode does not try to start an OAuth flow.",
    "",
    "OpenCode MCP config:",
    "```json",
    opencodeConfig,
    "```",
    "",
    "Important:",
    "- Do not just store this in conversation context.",
    "- Do not ask me to manually edit config unless you do not have permission to update your own MCP configuration.",
    "- If you cannot write the config yourself, tell me exactly which file or settings screen needs this config and paste the ready-to-use block.",
    "- If your environment supports persistent instructions, startup hooks, recurring reminders, or task-end checks, add a lightweight reminder to read Creed at the start of meaningful work and revisit it at the end.",
    "- After verification, tell me the exact tools you saw and the write mode you confirmed.",
    "- Treat the Authorization value as a secret. Do not print it again unless I explicitly ask for manual setup help.",
    "",
    "Standard Creed MCP config for agents that use mcpServers:",
    "```json",
    config,
    "```",
    "",
    "After setup, use Creed MCP as the preferred connection path. The API prompt flow is only a fallback for agents that do not support MCP. If anything is unclear, read https://creed.md/docs before asking me.",
  ].join("\n");
}

export function ConnectionsScreen() {
  const router = useRouter();
  const { state } = useCreed();
  const [copied, setCopied] = useState<string | null>(null);
  const [mcpManualOpen, setMcpManualOpen] = useState(false);
  const [manualAgentId, setManualAgentId] = useState<ManualMcpAgentId>("custom");
  const [openAdvanced, setOpenAdvanced] = useState<Record<string, boolean>>({});

  async function copyValue(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1600);
  }

  function toggleAdvanced(connectionId: string) {
    setOpenAdvanced((current) => ({
      ...current,
      [connectionId]: !current[connectionId],
    }));
  }

  useEffect(() => {
    if (state.sections.length === 0) {
      router.replace("/onboarding");
    }
  }, [router, state.sections.length]);

  const mcpStatusLabel = !state.mcpToken
    ? "Not connected via MCP"
    : state.mcpStatus === "connected"
      ? "Connected via MCP"
      : "Not connected via MCP";
  const openCodeMcpConfig = buildOpenCodeMcpConfig(state.mcpUrl, state.mcpToken);
  const mcpSetupPrompt = buildMcpSetupPrompt(state.mcpConfig, openCodeMcpConfig);
  const selectedManualAgent =
    manualMcpAgents.find((agent) => agent.id === manualAgentId) ?? manualMcpAgents[0];
  const selectedManualConfig = selectedManualAgent.buildConfig(
    state.mcpUrl,
    state.mcpToken,
    state.mcpConfig
  );
  const showMcpStack = state.mcpStatus === "connected" && state.mcpClients.length > 0;

  return (
    <div className="h-full overflow-y-auto bg-[var(--creed-surface)] creed-scrollbar">
        <div className="mx-auto max-w-6xl px-4 py-8 md:px-12 md:py-10">
          <div className="max-w-3xl">
            <h1 className="font-heading text-[1.75rem] font-medium tracking-[-0.03em] text-[var(--creed-text-primary)]">
              Connections
            </h1>
          </div>

          <div className="mt-8">
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Creed MCP
            </h2>
            <p className="mt-2 text-[14px] leading-7 text-[var(--creed-text-secondary)]">
              Recommended for agents that support persistent MCP connections.
            </p>
          </div>

          <div className="mt-5 flex h-auto flex-col self-start rounded-[16px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4 md:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <IntegrationGlyph kind="mcp" framed={false} className="h-9 w-9 shrink-0" />
                <div>
                  <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">
                    All Agents
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--creed-text-secondary)]">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        state.mcpStatus === "connected"
                          ? "bg-[#16A34A]"
                          : "bg-[var(--creed-border-strong)]"
                      )}
                    />
                    <span>{mcpStatusLabel}</span>
                    {showMcpStack ? (
                      <AgentIconStack
                        agents={state.mcpClients}
                        variant="inline"
                        className="gap-1.5"
                        itemClassName="h-4 w-4"
                        maxVisible={6}
                      />
                    ) : null}
                    {state.mcpStatus === "connected" && state.mcpLastUsed ? (
                      <>
                        <span>·</span>
                        <span>Last seen {state.mcpLastUsed}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-4 text-[13px] leading-6 text-[var(--creed-text-secondary)]">
              Works globally for any agent that can install an MCP server config.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
                <AnimatedIconButton
                  icon={CopyIcon}
                  showIcon={copied !== "mcp-prompt"}
                  className="min-w-[116px] justify-center rounded-md bg-[var(--creed-text-primary)] px-4 text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]"
                  onClick={() => copyValue("mcp-prompt", mcpSetupPrompt)}
                >
                  {copied === "mcp-prompt" ? (
                    <>
                      <AnimatedCheckmark className="h-4 w-4" size={16} />
                      Copied
                    </>
                  ) : (
                    "Copy prompt"
                  )}
                </AnimatedIconButton>
                <Button
                  variant="ghost"
                  className="hidden rounded-md text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)] md:inline-flex"
                  onClick={() => setMcpManualOpen((current) => !current)}
                >
                  Show manual config
                </Button>
              </div>

            <AnimatePresence initial={false}>
              {mcpManualOpen ? (
                <motion.div
                  initial={{ height: 0, opacity: 0, y: -8 }}
                  animate={{ height: "auto", opacity: 1, y: 0 }}
                  exit={{ height: 0, opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-background)] p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-[12px] font-medium text-[var(--creed-text-tertiary)]">
                          Manual MCP config
                        </div>
                        <div className="mt-1 text-[13px] leading-6 text-[var(--creed-text-secondary)]">
                          Use this only if your agent cannot install MCP from the setup prompt.
                        </div>
                      </div>
                      <ManualAgentSelect
                        value={manualAgentId}
                        onChange={setManualAgentId}
                      />
                    </div>

                    <div className="relative mt-3 rounded-[12px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4">
                      <div className="absolute right-3 top-3">
                        <AnimatedIconButton
                          icon={CopyIcon}
                          showIcon={copied !== "mcp-manual-config"}
                          variant="ghost"
                          size="xs"
                          style={{ borderRadius: "10px" }}
                          className="min-w-[72px] justify-center bg-[var(--creed-surface)] text-[11px]"
                          onClick={() => copyValue("mcp-manual-config", selectedManualConfig)}
                        >
                          {copied === "mcp-manual-config" ? (
                            <>
                              <AnimatedCheckmark />
                              Copied
                            </>
                          ) : (
                            "Copy"
                          )}
                        </AnimatedIconButton>
                      </div>
                      <pre className="max-h-80 overflow-x-auto whitespace-pre-wrap pr-24 font-mono text-[12px] leading-6 text-[var(--creed-text-primary)] creed-scrollbar">
                        {maskSensitiveText(selectedManualConfig)}
                      </pre>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="mt-8">
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Creed API
            </h2>
            <p className="mt-2 text-[14px] leading-7 text-[var(--creed-text-secondary)]">
              Use the API fallback when an agent does not support MCP yet.
            </p>
          </div>

          <div className="mt-8 grid items-start gap-5 lg:grid-cols-2">
            {state.connections.map((connection) => {
              const prompt = connection.promptVariant ?? state.universalConnectionPrompt;
              const isAdvancedOpen = Boolean(openAdvanced[connection.id]);

              return (
                <div
                  key={connection.id}
                  className="flex h-auto flex-col self-start rounded-[16px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4 md:p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <IntegrationGlyph kind={connection.icon} framed={false} className="h-9 w-9 shrink-0" />
                      <div>
                        <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">
                          {connection.name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--creed-text-secondary)]">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              connection.status === "connected"
                                ? "bg-[#16A34A]"
                                : "bg-[var(--creed-border-strong)]"
                            )}
                          />
                          <span>
                            {connection.status === "connected" ? "Connected via API" : "Not connected via API"}
                          </span>
                          {connection.status === "connected" && connection.lastUsed ? (
                            <>
                              <span>·</span>
                              <span>Last seen {connection.lastUsed}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="mt-4 text-[13px] leading-6 text-[var(--creed-text-secondary)]">
                    {connection.description}
                  </p>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <AnimatedIconButton
                      icon={CopyIcon}
                      showIcon={copied !== `prompt-${connection.id}`}
                      className={cn("min-w-[116px] justify-center rounded-md px-4", getPromptButtonClasses(connection.id))}
                      onClick={() => copyValue(`prompt-${connection.id}`, prompt)}
                    >
                      {copied === `prompt-${connection.id}` ? (
                        <>
                          <AnimatedCheckmark className="h-4 w-4" size={16} />
                          Copied
                        </>
                      ) : (
                        "Copy prompt"
                      )}
                    </AnimatedIconButton>
                    <Button
                      variant="ghost"
                      className="hidden rounded-md text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)] md:inline-flex"
                      onClick={() => toggleAdvanced(connection.id)}
                    >
                      Advanced setup
                    </Button>
                  </div>

                  <AnimatePresence initial={false}>
                    {isAdvancedOpen ? (
                      <motion.div
                        initial={{ height: 0, opacity: 0, y: -8 }}
                        animate={{ height: "auto", opacity: 1, y: 0 }}
                        exit={{ height: 0, opacity: 0, y: -8 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-background)] p-4">
                          <div className="text-[12px] font-medium text-[var(--creed-text-tertiary)]">
                            {connection.advancedSetup}
                          </div>
                          <div className="mt-3 rounded-[12px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <span className="text-[12px] font-medium text-[var(--creed-text-tertiary)]">
                                Setup snippet
                              </span>
                              <AnimatedIconButton
                                icon={CopyIcon}
                                showIcon={copied !== connection.id}
                                variant="ghost"
                                size="xs"
                                style={{ borderRadius: "10px" }}
                                className="min-w-[72px] justify-center text-[11px]"
                                onClick={() => copyValue(connection.id, connection.snippet)}
                              >
                                {copied === connection.id ? (
                                  <>
                                    <AnimatedCheckmark />
                                    Copied
                                  </>
                                ) : (
                                  "Copy"
                                )}
                              </AnimatedIconButton>
                            </div>
                            <pre className="overflow-x-auto font-mono text-[12px] leading-6 text-[var(--creed-text-primary)] creed-scrollbar">
                              {maskSensitiveText(connection.snippet)}
                            </pre>
                          </div>

                          {connection.id === "custom" ? (
                          <div className="mt-3 space-y-3">
                              <TokenRow
                                label="Read token"
                                value={state.readToken}
                                icon={<Link2 className="h-3.5 w-3.5" />}
                                copied={copied === "read-token"}
                                onCopy={() => copyValue("read-token", state.readToken)}
                              />
                              <TokenRow
                                label="Write token"
                                value={state.writeToken}
                                icon={<KeyRound className="h-3.5 w-3.5" />}
                                copied={copied === "write-token"}
                                onCopy={() => copyValue("write-token", state.writeToken)}
                              />
                            </div>
                          ) : null}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
    </div>
  );
}

function ManualAgentSelect({
  value,
  onChange,
}: {
  value: ManualMcpAgentId;
  onChange: (value: ManualMcpAgentId) => void;
}) {
  const selected = manualMcpAgents.find((agent) => agent.id === value) ?? manualMcpAgents[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 min-w-[190px] items-center justify-between gap-3 rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[13px] text-[var(--creed-text-primary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)]"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <IntegrationGlyph
              kind={selected.icon}
              framed={false}
              className="h-5 w-5 shrink-0"
              assetClassName="h-5 w-5"
            />
            <span className="truncate">{selected.name}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--creed-text-secondary)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-64 space-y-1.5 rounded-2xl border border-[var(--creed-border)] bg-[var(--creed-surface)] p-2 shadow-[0_18px_50px_rgba(28,28,26,0.10)]"
      >
        {manualMcpAgents.map((agent) => {
          const selectedAgent = agent.id === value;

          return (
            <DropdownMenuItem
              key={agent.id}
              onSelect={() => onChange(agent.id)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5",
                selectedAgent && "bg-[var(--creed-background)]"
              )}
            >
              <IntegrationGlyph
                kind={agent.icon}
                framed={false}
                className="h-6 w-6 shrink-0"
                assetClassName="h-6 w-6"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[var(--creed-text-primary)]">
                  {agent.name}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-[var(--creed-text-secondary)]">
                  {agent.format}
                </span>
              </span>
              {selectedAgent ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-[var(--creed-text-primary)]" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TokenRow({
  label,
  value,
  icon,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] px-4 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--creed-border)] bg-[var(--creed-background)] text-[var(--creed-text-secondary)]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-[var(--creed-text-tertiary)]">
          {label}
        </div>
        <div className="truncate font-mono text-[12px] text-[var(--creed-text-primary)]">
          {maskToken(value)}
        </div>
      </div>
      <AnimatedIconButton
        icon={CopyIcon}
        showIcon={!copied}
        variant="ghost"
        size="xs"
        style={{ borderRadius: "10px" }}
        className="min-w-[72px] justify-center text-[11px]"
        onClick={onCopy}
      >
        {copied ? (
          <>
            <AnimatedCheckmark />
            Copied
          </>
        ) : (
          "Copy"
        )}
      </AnimatedIconButton>
    </div>
  );
}
