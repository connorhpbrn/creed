"use client";

// Connected-MCP-agent management: lists agents connected over MCP with reauth
// and remove actions plus their confirmation dialogs. Rendered as the first
// section on /connections. Extracted from settings-screen so the roster lives
// next to the MCP setup card that creates these connections.
import { useState } from "react";
import { toast } from "sonner";
import { Copy, LoaderCircle, RotateCw, Unplug } from "@/components/ui/phosphor-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IntegrationGlyph } from "@/components/creed/brand";
import { useCreed } from "@/components/creed/creed-provider";
import { type McpClient } from "@/lib/creed-data";

function mcpReauthCommand(client: McpClient) {
  if (client.id === "codex" || client.icon === "codex") {
    return "codex mcp login creed";
  }
  return null;
}

export function McpAgentsSection() {
  const { state, refreshState } = useCreed();
  const [mcpRemoveTarget, setMcpRemoveTarget] = useState<McpClient | null>(null);
  const [mcpReauthTarget, setMcpReauthTarget] = useState<McpClient | null>(null);
  const [copiedMcpReauth, setCopiedMcpReauth] = useState<"command" | "url" | null>(null);
  const [removingMcpClientId, setRemovingMcpClientId] = useState<string | null>(null);

  // Removes a connected MCP agent: revokes its access server-side, then pulls a
  // fresh roster so the row disappears. Dialog stays open on failure so the user
  // can retry; the toast carries the reason.
  async function confirmRemoveMcpClient() {
    const client = mcpRemoveTarget;
    if (!client) return;
    try {
      setRemovingMcpClientId(client.id);
      const response = await fetch(`/api/app/mcp/clients/${encodeURIComponent(client.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not remove agent.");
      }
      setMcpRemoveTarget(null);
      await refreshState();
      toast.success(`Removed ${client.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove agent");
    } finally {
      setRemovingMcpClientId(null);
    }
  }

  async function copyMcpReauthValue(kind: "command" | "url", value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedMcpReauth(kind);
    toast.success(kind === "command" ? "Copied reauth command" : "Copied MCP URL");
    window.setTimeout(() => setCopiedMcpReauth(null), 1600);
  }

  return (
    <>
      <section>
        <h2 className="text-[16px] font-medium text-[var(--creed-text-primary)]">
          MCP agents
        </h2>
        <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4 md:p-5">
          <p className="text-[14px] leading-7 text-[var(--creed-text-secondary)]">
            Agents connected to your Creed over MCP. Reauthorization starts
            from the agent so it can receive the OAuth callback. Removing an
            agent revokes its access and clears it from your connection history.
          </p>
          {state.mcpClients.length === 0 ? (
            <p className="mt-4 text-[14px] text-[var(--creed-text-secondary)]">
              No agents connected yet.
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {state.mcpClients.map((client) => {
                const reauthCommand = mcpReauthCommand(client);
                return (
                  <li
                    key={client.id}
                    className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--creed-border)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <IntegrationGlyph kind={client.icon} />
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-medium text-[var(--creed-text-primary)]">
                          {client.name}
                        </div>
                        {client.lastUsed ? (
                          <div className="mt-0.5 text-[12px] text-[var(--creed-text-secondary)]">
                            Last seen {client.lastUsed}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-md border-[var(--creed-border)] text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
                        onClick={() => {
                          if (reauthCommand) {
                            void copyMcpReauthValue("command", reauthCommand);
                          } else {
                            setMcpReauthTarget(client);
                          }
                        }}
                      >
                        {reauthCommand ? (
                          <>
                            <Copy className="h-4 w-4" />
                            Copy reauth command
                          </>
                        ) : (
                          <>
                            <RotateCw className="h-4 w-4" />
                            Reauth steps
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-md border-[var(--creed-border)] text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
                        disabled={removingMcpClientId === client.id}
                        onClick={() => setMcpRemoveTarget(client)}
                      >
                        {removingMcpClientId === client.id ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Unplug className="h-4 w-4" />
                            Remove
                          </>
                        )}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <Dialog
        open={mcpRemoveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setMcpRemoveTarget(null);
        }}
      >
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>Remove MCP agent</DialogTitle>
            <DialogDescription>
              This revokes &ldquo;{mcpRemoveTarget?.name}&rdquo; access to your Creed and
              clears it from your connection history. The agent has to reauthorize
              in the browser to connect again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button
              variant="ghost"
              className="rounded-md"
              disabled={removingMcpClientId !== null}
              onClick={() => setMcpRemoveTarget(null)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[#DC2626] px-4 text-white hover:bg-[#B91C1C] hover:text-white"
              disabled={removingMcpClientId !== null}
              onClick={() => void confirmRemoveMcpClient()}
            >
              {removingMcpClientId !== null ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                "Remove agent"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={mcpReauthTarget !== null}
        onOpenChange={(open) => {
          if (!open) setMcpReauthTarget(null);
        }}
      >
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>Reauthorize MCP agent</DialogTitle>
            <DialogDescription>
              Start reauthorization from {mcpReauthTarget?.name ?? "the agent"} so it can
              receive the OAuth callback and store the new token. Creed hosts the
              approval page after the agent starts the flow.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-[var(--radius-md)] border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] px-3 py-2 font-mono text-[13px] text-[var(--creed-text-primary)]">
            <span className="block break-all">{state.mcpUrl}</span>
          </div>
          <p className="text-[13px] leading-6 text-[var(--creed-text-secondary)]">
            Open the agent&apos;s MCP or connector settings, choose Creed, and run
            its authorize or reconnect action. If the agent keeps sending a stale
            token, remove it here first, then reconnect it from Connections.
          </p>
          <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button
              variant="ghost"
              className="rounded-md"
              onClick={() => setMcpReauthTarget(null)}
            >
              Done
            </Button>
            <Button
              className="rounded-md bg-[#2563EB] px-4 text-white hover:bg-[#1D4ED8]"
              onClick={() => void copyMcpReauthValue("url", state.mcpUrl)}
            >
              {copiedMcpReauth === "url" ? "Copied" : "Copy MCP URL"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
