"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedCheckmark } from "@/components/ui/animated-checkmark";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CopyIcon } from "@/components/ui/copy";
import { AgentIconStack } from "@/components/creed/agent-icon-stack";
import { AnimatedIconButton } from "@/components/creed/animated-icon-action";
import {
  ConnectionCard,
  resolveConnectionStatus,
} from "@/components/creed/connection-card";
import {
  Dropdown,
  McpHealthDashboard,
} from "@/components/creed/mcp-health-dashboard";
import { useCreed } from "@/components/creed/creed-provider";
import {
  AGENT_CATEGORY_FILTER_ITEMS,
  getAgentCategory,
} from "@/lib/agent-icon";
import type { AgentIconKind } from "@/lib/creed-data";
import { cn } from "@/lib/utils";

const SETUP_STEPS = [
  {
    title: "Copy the server URL",
    detail: "One URL connects every agent.",
  },
  {
    title: "Add it to your agent",
    detail: "Paste where your agent accepts MCP.",
  },
  {
    title: "Authorize in the browser",
    detail: "Approve the prompt and you're connected.",
  },
];

export function ConnectionsScreen() {
  const router = useRouter();
  const { state, refreshState } = useCreed();
  const [copied, setCopied] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [agentTypeFilter, setAgentTypeFilter] = useState<string>("all");

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
  const mcpStatusLabel = connected ? "Connected" : "Not connected via MCP";
  const showMcpStack = connected && state.mcpClients.length > 0;

  const visibleConnections = useMemo(
    () =>
      agentTypeFilter === "all"
        ? state.connections
        : state.connections.filter(
            (connection) =>
              getAgentCategory(connection.icon) === agentTypeFilter,
          ),
    [state.connections, agentTypeFilter],
  );

  function openLogs(icon: AgentIconKind) {
    const client = state.mcpClients.find((c) => c.icon === icon);
    window.dispatchEvent(
      new CustomEvent("creed:mcp-health-focus-agent", {
        detail: { clientId: client?.id },
      }),
    );
  }

  async function revokeAgent(icon: AgentIconKind) {
    const response = await fetch("/api/app/mcp/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icon }),
    });
    // Throw on failure so the card's confirm dialog stays open instead of
    // closing as if the revoke succeeded.
    if (!response.ok) {
      throw new Error("Could not revoke agent access.");
    }
    await refreshState();
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--creed-surface)] creed-scrollbar">
      <div className="mx-auto max-w-[960px] px-4 py-8 md:px-12 md:py-10">
        <div className="max-w-3xl">
          <h1 className="font-heading text-[1.75rem] font-medium tracking-[-0.03em] text-[var(--creed-text-primary)]">
            Connections
          </h1>
        </div>

        <div className="mt-8">
          <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
            Setup
          </h2>
          <p className="mt-2 text-[14px] leading-7 text-[var(--creed-text-secondary)]">
            Paste the server URL into any MCP agent, then authorize Creed in the
            browser.
          </p>
        </div>

        <div className="mt-5 grid items-start gap-4 lg:grid-cols-2">
          <div className="flex h-auto flex-col self-start rounded-[16px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4 md:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* MCP glyph recoloured by the cycling palette: the asset is a
                  monochrome svg, so we mask the cycling background to its
                  shape rather than tinting an <img>. */}
                <span
                  aria-hidden
                  className="creed-copy-cycle inline-block h-9 w-9 shrink-0"
                  style={{
                    WebkitMaskImage: "url(/assets/agents/mcp.svg)",
                    maskImage: "url(/assets/agents/mcp.svg)",
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
                    MCP
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-[var(--creed-text-secondary)]">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-[3px]",
                        connected
                          ? "bg-[#16A34A]"
                          : "bg-[var(--creed-border-strong)]",
                      )}
                    />
                    <span>{mcpStatusLabel}</span>
                    {showMcpStack ? (
                      <AgentIconStack
                        agents={state.mcpClients}
                        variant="inline"
                        className="gap-1.5"
                        itemClassName="h-4 w-4"
                        maxVisible={3}
                      />
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
                onClick={() => setSetupOpen((current) => !current)}
              >
                <span className="sm:hidden">{setupOpen ? "Hide" : "Show"}</span>
                <span className="hidden sm:inline">
                  {setupOpen ? "Hide instructions" : "Show instructions"}
                </span>
              </Button>
            </div>

            <AnimatePresence initial={false}>
              {setupOpen ? (
                <motion.div
                  initial={{ height: 0, opacity: 0, y: -8 }}
                  animate={{ height: "auto", opacity: 1, y: 0 }}
                  exit={{ height: 0, opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <ol className="mt-5 grid items-start gap-4 border-t border-[var(--creed-border)] pt-5">
                    {SETUP_STEPS.map((step, index) => (
                      <li key={step.title}>
                        <div className="text-[14px] font-medium text-[var(--creed-text-primary)]">
                          {index + 1}. {step.title}
                        </div>
                        <p className="mt-1 text-[13px] leading-6 text-[var(--creed-text-secondary)]">
                          {step.detail}
                        </p>
                      </li>
                    ))}
                  </ol>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* CLI setup card: announced ahead of launch, so the actions render in
            a disabled state until the CLI connection type ships. */}
          {/* Whole card sits at half opacity with pointer events off - one
              clear "not live yet" signal instead of piecemeal greyed bits. */}
          <div className="pointer-events-none flex h-auto select-none flex-col self-start rounded-[16px] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4 opacity-50 md:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="creed-copy-cycle inline-block h-9 w-9 shrink-0"
                  style={{
                    WebkitMaskImage: "url(/assets/agents/cli.svg)",
                    maskImage: "url(/assets/agents/cli.svg)",
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
                    CLI
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-[var(--creed-text-secondary)]">
                    <span className="h-2 w-2 rounded-[3px] bg-[var(--creed-border-strong)]" />
                    <span>Coming soon</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 w-fit max-w-full self-start rounded-[var(--radius-md)] border border-[var(--creed-border)] px-3 py-2 font-mono text-[13px] text-[var(--creed-text-primary)]">
              <span className="block break-all">coming soon : )</span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <AnimatedIconButton
                icon={CopyIcon}
                disabled
                className="creed-copy-cycle min-w-[116px] justify-center rounded-md px-4 text-white"
              >
                Copy command
              </AnimatedIconButton>
              <Button
                variant="ghost"
                disabled
                className="rounded-md text-[var(--creed-text-secondary)]"
              >
                <span className="sm:hidden">Show</span>
                <span className="hidden sm:inline">Show instructions</span>
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
              Agents
            </h2>
            <p className="mt-2 text-[14px] leading-7 text-[var(--creed-text-secondary)]">
              Every agent Creed supports and its connection status.
            </p>
          </div>
          <Dropdown
            trigger={
              AGENT_CATEGORY_FILTER_ITEMS.find(
                (item) => item.key === agentTypeFilter,
              )?.label ?? "All"
            }
            items={AGENT_CATEGORY_FILTER_ITEMS}
            selectedKey={agentTypeFilter}
            onSelect={setAgentTypeFilter}
            align="end"
            menuWidthClass="min-w-28"
          />
        </div>

        <div className="mt-5 grid items-start gap-4 lg:grid-cols-2">
          {visibleConnections.map((connection) => {
            const { isConnected, lastSeen } = resolveConnectionStatus(
              connection,
              state.mcpClients,
            );
            return (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                mcpUrl={state.mcpUrl}
                isConnected={isConnected}
                lastSeen={lastSeen}
                onRevoke={() => revokeAgent(connection.icon)}
                onLogs={() => openLogs(connection.icon)}
              />
            );
          })}
        </div>

        <McpHealthDashboard />
      </div>
    </div>
  );
}
