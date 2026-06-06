"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedCheckmark } from "@/components/ui/animated-checkmark";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CopyIcon } from "@/components/ui/copy";
import { PlusIcon } from "@/components/ui/plus";
import { AgentIconStack } from "@/components/creed/agent-icon-stack";
import { AnimatedIconButton } from "@/components/creed/animated-icon-action";
import { IntegrationGlyph } from "@/components/creed/brand";
import { McpHealthDashboard } from "@/components/creed/mcp-health-dashboard";
import { useCreed } from "@/components/creed/creed-provider";
import { cn } from "@/lib/utils";

// Per-agent button colour, matching each client's brand.
function getAgentButtonClasses(connectionId: string) {
  switch (connectionId) {
    case "codex":
      return "bg-[#2563EB] text-white transition-colors hover:bg-[#1D4ED8]";
    case "claude":
    case "claudecode":
      return "bg-[#FF6200] text-white hover:bg-[#E65A00]";
    case "openclaw":
      return "bg-[#FF0000] text-white hover:bg-[#E00000]";
    case "hermes":
      return "bg-[#FFBB00] text-white hover:bg-[#E6A900] dark:bg-[#D9A000] dark:hover:bg-[#B88600]";
    case "chatgpt":
    case "cursor":
    case "devin":
    case "grok":
    case "v0":
    case "opencode":
      return "bg-[#171717] text-white hover:bg-[#0F0F0F] dark:bg-[#e7e7e2] dark:text-[#0e0e0d] dark:hover:bg-[#cfcfc8]";
    case "custom":
      return "border border-[var(--creed-border-strong)] bg-[var(--creed-surface)] text-[var(--creed-text-primary)] hover:bg-[var(--creed-surface-raised)]";
    default:
      return "bg-[var(--creed-text-primary)] text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]";
  }
}

export function ConnectionsScreen() {
  const router = useRouter();
  const { state } = useCreed();
  const [copied, setCopied] = useState<string | null>(null);
  const [agentSetupOpen, setAgentSetupOpen] = useState(false);

  async function copyValue(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1600);
  }

  useEffect(() => {
    if (state.sections.length === 0) {
      router.replace("/onboarding");
    }
  }, [router, state.sections.length]);

  const connected = state.mcpStatus === "connected";
  const mcpStatusLabel = connected ? "Connected via MCP" : "Not connected via MCP";
  const showMcpStack = connected && state.mcpClients.length > 0;

  // Per-card connected status is derived from the live MCP client roster (the
  // same source the "All Agents" card uses), matched by resolved brand icon.
  // The roster is updated on every MCP request - including reads - so a card
  // lights up as soon as its agent connects, which the legacy per-id status
  // (only written on writes/proposals) never did reliably.
  const latestClientByIcon = new Map<string, (typeof state.mcpClients)[number]>();
  for (const client of state.mcpClients) {
    if (!latestClientByIcon.has(client.icon)) {
      latestClientByIcon.set(client.icon, client);
    }
  }

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
            MCP setup
          </h2>
          <p className="mt-2 text-[14px] leading-7 text-[var(--creed-text-secondary)]">
            Add Creed to any agent that supports MCP by pasting the server URL as a
            custom connector and authorizing Creed in the browser.
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
                      "h-2 w-2 rounded-[3px]",
                      connected ? "bg-[#16A34A]" : "bg-[var(--creed-border-strong)]"
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
                  {connected && state.mcpLastUsed ? (
                    <>
                      <span>·</span>
                      <span>Last seen {state.mcpLastUsed}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 w-fit max-w-full self-start rounded-[var(--radius-md)] border border-[var(--creed-border)] px-3 py-2 font-mono text-[13px] text-[var(--creed-text-primary)]">
            <span className="block break-all">{state.mcpUrl}</span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <AnimatedIconButton
              icon={CopyIcon}
              showIcon={copied !== "mcp-url"}
              className="min-w-[116px] justify-center rounded-md bg-[var(--creed-text-primary)] px-4 text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]"
              onClick={() => copyValue("mcp-url", state.mcpUrl)}
            >
              {copied === "mcp-url" ? (
                <>
                  <AnimatedCheckmark className="h-4 w-4" size={16} />
                  Copied
                </>
              ) : (
                "Copy URL"
              )}
            </AnimatedIconButton>
            <Button
              variant="ghost"
              className="rounded-md text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
              onClick={() => setAgentSetupOpen((current) => !current)}
            >
              <span className="sm:hidden">{agentSetupOpen ? "Hide agents" : "Show agents"}</span>
              <span className="hidden sm:inline">
                {agentSetupOpen ? "Hide specific agents" : "Show specific agents"}
              </span>
            </Button>
          </div>

          <AnimatePresence initial={false}>
            {agentSetupOpen ? (
              <motion.div
                initial={{ height: 0, opacity: 0, y: -8 }}
                animate={{ height: "auto", opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="mt-5 grid items-start gap-4 border-t border-[var(--creed-border)] pt-5 lg:grid-cols-2">
                  {state.connections.map((connection) => {
                    const commandKey = `command-${connection.id}`;
                    const matchedClient = latestClientByIcon.get(connection.icon);
                    const isConnected = Boolean(matchedClient) || connection.status === "connected";
                    const lastSeen = matchedClient?.lastUsed ?? connection.lastUsed;

                    return (
                      <div
                        key={connection.id}
                        className="flex h-auto flex-col self-start rounded-[14px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4"
                      >
                        <div className="flex items-center gap-3">
                          <IntegrationGlyph kind={connection.icon} framed={false} className="h-9 w-9 shrink-0" />
                          <div>
                            <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">
                              {connection.name}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--creed-text-secondary)]">
                              <span
                                className={cn(
                                  "h-2 w-2 rounded-[3px]",
                                  isConnected
                                    ? "bg-[#16A34A]"
                                    : "bg-[var(--creed-border-strong)]"
                                )}
                              />
                              <span>
                                {isConnected ? "Connected" : "Not connected"}
                              </span>
                              {isConnected && lastSeen ? (
                                <>
                                  <span>·</span>
                                  <span>Last seen {lastSeen}</span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <p className="mt-4 text-[13px] leading-6 text-[var(--creed-text-secondary)]">
                          {connection.connectHint}
                        </p>

                        {connection.command ? (
                          <div className="mt-3 w-fit max-w-full self-start rounded-[var(--radius-md)] border border-[var(--creed-border)] px-3 py-2 font-mono text-[13px] text-[var(--creed-text-primary)]">
                            <span className="block break-all">{connection.command}</span>
                          </div>
                        ) : null}

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          {connection.deepLink ? (
                            <AnimatedIconButton
                              icon={PlusIcon}
                              showIcon={copied !== commandKey}
                              className={cn("min-w-[116px] justify-center rounded-md px-4", getAgentButtonClasses(connection.id))}
                              onClick={() => {
                                const href = connection.deepLink ?? "";
                                setCopied(commandKey);
                                window.setTimeout(() => setCopied(null), 1600);
                                if (href) {
                                  window.location.href = href;
                                }
                              }}
                            >
                              {copied === commandKey ? (
                                <>
                                  <AnimatedCheckmark className="h-4 w-4" size={16} />
                                  Added
                                </>
                              ) : (
                                "Add MCP"
                              )}
                            </AnimatedIconButton>
                          ) : connection.command ? (
                            <AnimatedIconButton
                              icon={CopyIcon}
                              showIcon={copied !== commandKey}
                              className={cn("min-w-[116px] justify-center rounded-md px-4", getAgentButtonClasses(connection.id))}
                              onClick={() => copyValue(commandKey, connection.command ?? "")}
                            >
                              {copied === commandKey ? (
                                <>
                                  <AnimatedCheckmark className="h-4 w-4" size={16} />
                                  Copied
                                </>
                              ) : (
                                "Copy command"
                              )}
                            </AnimatedIconButton>
                          ) : (
                            <AnimatedIconButton
                              icon={CopyIcon}
                              showIcon={copied !== commandKey}
                              className={cn("min-w-[116px] justify-center rounded-md px-4", getAgentButtonClasses(connection.id))}
                              onClick={() => copyValue(commandKey, state.mcpUrl)}
                            >
                              {copied === commandKey ? (
                                <>
                                  <AnimatedCheckmark className="h-4 w-4" size={16} />
                                  Copied
                                </>
                              ) : (
                                "Copy URL"
                              )}
                            </AnimatedIconButton>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <McpHealthDashboard />
      </div>
    </div>
  );
}
