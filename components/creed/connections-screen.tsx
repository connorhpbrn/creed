"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedCheckmark } from "@/components/ui/animated-checkmark";
import { Button } from "@/components/ui/button";
import { Copy } from "@/components/ui/phosphor-icons";
import { AgentIconStack } from "@/components/creed/agent-icon-stack";
import { AnimatedIconButton } from "@/components/creed/animated-icon-action";
import { ConnectionCard, resolveConnectionStatus } from "@/components/creed/connection-card";
import { McpAgentsSection } from "@/components/creed/mcp-agents-section";
import { McpHealthDashboard } from "@/components/creed/mcp-health-dashboard";
import { useCreed } from "@/components/creed/creed-provider";
import { cn } from "@/lib/utils";

export function ConnectionsScreen() {
  const { state } = useCreed();
  const [copied, setCopied] = useState<string | null>(null);
  const [agentSetupOpen, setAgentSetupOpen] = useState(false);

  async function copyValue(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1600);
  }

  const connected = state.mcpStatus === "connected";
  const mcpStatusLabel = connected ? "Connected via MCP" : "Not connected via MCP";
  const showMcpStack = connected && state.mcpClients.length > 0;

  return (
    <div className="h-full overflow-y-auto bg-[var(--creed-surface)] creed-scrollbar">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-12 md:py-10">
        <div className="max-w-3xl">
          <h1 className="font-heading text-[1.75rem] font-medium tracking-[-0.03em] text-[var(--creed-text-primary)]">
            Connections
          </h1>
        </div>

        <div className="mt-8">
          <McpAgentsSection />
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
              {/* All-agents glyph recoloured by the cycling palette: the asset
                  is a monochrome svg, so we mask the cycling background to its
                  shape rather than tinting an <img>. */}
              <span
                aria-hidden
                className="creed-copy-cycle inline-block h-9 w-9 shrink-0"
                style={{
                  WebkitMaskImage: "url(/assets/agents/allagents.svg)",
                  maskImage: "url(/assets/agents/allagents.svg)",
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskPosition: "center",
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                }}
              />
              <div>
                <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">
                  All Agents
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-[var(--creed-text-secondary)]">
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
              icon={Copy}
              showIcon={copied !== "mcp-url"}
              className="creed-copy-cycle min-w-[116px] justify-center rounded-md px-4 text-white"
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
                    const { isConnected, lastSeen } = resolveConnectionStatus(
                      connection,
                      state.mcpClients
                    );
                    return (
                      <ConnectionCard
                        key={connection.id}
                        connection={connection}
                        mcpUrl={state.mcpUrl}
                        isConnected={isConnected}
                        lastSeen={lastSeen}
                      />
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
