"use client";

import { useState } from "react";
import { AlertTriangle, Ellipsis, LoaderCircle } from "lucide-react";
import { AnimatedCheckmark } from "@/components/ui/animated-checkmark";
import { ArrowUpRightIcon } from "@/components/ui/arrow-up-right";
import { BookTextIcon } from "@/components/ui/book-text";
import { Button } from "@/components/ui/button";
import { ChartColumnIncreasingIcon } from "@/components/ui/chart-column-increasing";
import { CopyIcon } from "@/components/ui/copy";
import { KeyIcon } from "@/components/ui/key";
import { RadioTowerIcon } from "@/components/ui/radio-tower";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlusIcon } from "@/components/ui/plus";
import {
  AnimatedIconButton,
  AnimatedMenuIconItem,
} from "@/components/creed/animated-icon-action";
import { IntegrationGlyph } from "@/components/creed/brand";
import {
  getCliConnectionPresentation,
  getConnectionPresentation,
} from "@/lib/connection-actions";
import type {
  ConnectionAction,
  ConnectionItem,
  McpClient,
} from "@/lib/creed-data";
import { cn } from "@/lib/utils";

// Where each agent lives, for the kebab's "Open" action. Agents without a
// product URL (CLI-only or unknown) simply don't show the item.
const AGENT_OPEN_URLS: Record<string, string> = {
  chatgpt: "https://chatgpt.com",
  claude: "https://claude.ai",
  grok: "https://grok.com",
  codex: "https://chatgpt.com/codex",
  claudecode: "https://claude.ai/code",
  cursor: "https://cursor.com",
  opencode: "https://opencode.ai",
  devin: "https://app.devin.ai",
  replit: "https://replit.com",
  v0: "https://v0.dev",
  factory: "https://app.factory.ai",
  manus: "https://manus.im",
};

// Anchor on Creed's own /docs page for the kebab's "Docs" action. Agents with
// their own card there get a per-card anchor; the rest land on their group's
// section.
const AGENT_DOCS_ANCHORS: Record<string, string> = {
  claude: "agent-claude",
  chatgpt: "agent-chatgpt",
  grok: "agent-grok",
  whirl: "agent-whirl",
  openclaw: "agent-openclaw",
  hermes: "agent-hermes",
  claudecode: "agent-claudecode",
  codex: "agent-codex",
  opencode: "agent-opencode",
  cursor: "agent-cursor",
  custom: "agent-custom",
  devin: "agents-coding",
  replit: "agents-coding",
  v0: "agents-coding",
  factory: "agents-coding",
  manus: "agents-assistants",
};

// Compacts the backend's relative-time strings ("2 days ago", "5 min ago",
// "3h ago", "just now") to the card's short form ("2d", "5m", "3h", "now").
function compactLastSeen(value: string) {
  if (value === "just now") return "now";
  const match = value.match(/^(\d+)\s*(min|h|day)/);
  if (!match) return value;
  const unit = match[2] === "min" ? "m" : match[2] === "h" ? "h" : "d";
  return `${match[1]}${unit}`;
}

// Per-agent button colour, matching each client's brand.
function getAgentButtonClasses(connectionId: string) {
  switch (connectionId) {
    case "codex":
    case "whirl":
      return "bg-[var(--creed-accent)] text-white transition-colors hover:bg-[var(--creed-accent-hover)]";
    case "claude":
    case "claudecode":
      return "bg-[#FF6200] text-white hover:bg-[#E65A00]";
    case "replit":
      return "bg-[#F26207] text-white transition-colors hover:bg-[#D65606]";
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
    case "factory":
    case "manus":
    case "custom":
      return "bg-[#171717] text-white hover:bg-[#0F0F0F] dark:bg-[#e7e7e2] dark:text-[#0e0e0d] dark:hover:bg-[#cfcfc8]";
    default:
      return "bg-[var(--creed-text-primary)] text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]";
  }
}

// Per-card connected status from the live MCP client roster, matched by resolved
// brand icon. The roster updates on every MCP request - including reads - so a
// card lights up as soon as its agent connects (the legacy per-id status only
// updated on writes / proposals).
export function resolveConnectionStatus(
  connection: ConnectionItem,
  mcpClients: McpClient[],
) {
  const matched = mcpClients.find((client) => client.icon === connection.icon);
  return {
    isConnected: Boolean(matched) || connection.status === "connected",
    lastSeen: matched?.lastUsed ?? connection.lastUsed,
  };
}

// One per-agent connect card, used on both /connections and the onboarding
// Connect step. Self-contained: it manages its own copy/flash state and renders
// the connection's primary/secondary actions (install link, settings page, or
// copyable command/JSON/URL), falling back to a plain "Copy URL".
export function ConnectionCard({
  connection,
  creedId,
  mcpUrl,
  isConnected,
  lastSeen,
  onRevoke,
  onLogs,
  mode = "mcp",
  showMenu = false,
}: {
  connection: ConnectionItem;
  creedId?: string;
  mcpUrl: string;
  isConnected: boolean;
  lastSeen?: string;
  // When set, the card grows a kebab menu (Copy / Docs / Test / Logs / red
  // Revoke). The onboarding Connect step omits it and keeps the plain card.
  onRevoke?: () => Promise<void>;
  // Jump to the Health section filtered to this agent.
  onLogs?: () => void;
  mode?: "mcp" | "cli";
  showMenu?: boolean;
}) {
  // Which button is showing its "Copied"/"Added" flash; primary and secondary
  // flash independently.
  const [flashedSlot, setFlashedSlot] = useState<
    "primary" | "secondary" | null
  >(null);
  const [testState, setTestState] = useState<
    "idle" | "testing" | "ok" | "fail"
  >("idle");
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const runTest = async () => {
    if (!creedId) {
      setTestState("fail");
      window.setTimeout(() => setTestState("idle"), 1600);
      return;
    }
    setTestState("testing");
    try {
      const response = await fetch(
        `/api/app/mcp/test?icon=${encodeURIComponent(connection.icon)}&creedId=${encodeURIComponent(creedId)}`,
      );
      const payload = (await response.json().catch(() => ({}))) as {
        connected?: boolean;
      };
      setTestState(response.ok && payload.connected ? "ok" : "fail");
    } catch {
      setTestState("fail");
    }
    window.setTimeout(() => setTestState("idle"), 1600);
  };
  const flash = (slot: "primary" | "secondary") => {
    setFlashedSlot(slot);
    window.setTimeout(
      () => setFlashedSlot((current) => (current === slot ? null : current)),
      1600,
    );
  };
  const buttonClass = cn(
    "min-w-[116px] justify-center rounded-md px-4",
    getAgentButtonClasses(connection.id),
  );
  const secondaryButtonClass =
    "min-w-[116px] justify-center rounded-md border border-[var(--creed-border-strong)] bg-[var(--creed-surface)] px-4 text-[var(--creed-text-primary)] hover:bg-[var(--creed-surface-raised)]";

  // Buttons and hint are derived client-side from the agent id + MCP URL (see
  // lib/connection-actions.ts for why they don't ride the server payload),
  // with the server definition as fallback and a plain Copy URL as the floor.
  const presentation = mode === "cli"
    ? getCliConnectionPresentation(connection.name)
    : getConnectionPresentation(connection.id, mcpUrl);
  const primaryAction: ConnectionAction = presentation.primary ??
    connection.primaryAction ?? {
      kind: "copy",
      label: "Copy URL",
      value: mcpUrl,
    };
  const secondaryAction =
    presentation.secondary ?? connection.secondaryAction ?? null;
  const connectHint = presentation.hint ?? connection.connectHint;

  const renderAction = (
    action: ConnectionAction,
    slot: "primary" | "secondary",
  ) => {
    const flashed = flashedSlot === slot;
    const className = slot === "primary" ? buttonClass : secondaryButtonClass;
    if (action.kind === "open") {
      // Settings pages open in a new tab; no flash, the destination is the
      // feedback.
      return (
        <AnimatedIconButton
          icon={ArrowUpRightIcon}
          className={className}
          onClick={() => {
            window.open(action.href, "_blank", "noopener,noreferrer");
          }}
        >
          {action.label}
        </AnimatedIconButton>
      );
    }
    if (action.kind === "install") {
      return (
        <AnimatedIconButton
          icon={PlusIcon}
          showIcon={!flashed}
          className={className}
          onClick={() => {
            flash(slot);
            window.location.href = action.href;
          }}
        >
          {flashed ? (
            <>
              <AnimatedCheckmark className="h-4 w-4" size={16} />
              Added
            </>
          ) : (
            action.label
          )}
        </AnimatedIconButton>
      );
    }
    return (
      <AnimatedIconButton
        icon={CopyIcon}
        showIcon={!flashed}
        className={className}
        onClick={async () => {
          await navigator.clipboard.writeText(action.value);
          flash(slot);
        }}
      >
        {flashed ? (
          <>
            <AnimatedCheckmark className="h-4 w-4" size={16} />
            Copied
          </>
        ) : (
          action.label
        )}
      </AnimatedIconButton>
    );
  };

  return (
    <div className="flex h-auto flex-col self-start rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IntegrationGlyph
            kind={connection.icon}
            framed={false}
            className="h-9 w-9 shrink-0"
          />
          <div>
            <div className="text-[15px] font-medium text-[var(--creed-text-primary)]">
              {connection.name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-[var(--creed-text-secondary)]">
              <span
                className={cn(
                  "h-2 w-2 rounded-[3px]",
                  isConnected
                    ? "bg-[#16A34A]"
                    : "bg-[var(--creed-border-strong)]",
                )}
              />
              <span>
                {mode === "cli"
                  ? isConnected
                    ? "Connected via CLI"
                    : "Not connected via CLI"
                  : isConnected
                    ? "Connected via MCP"
                    : "Not connected"}
              </span>
              {isConnected && lastSeen ? (
                <>
                  <span>·</span>
                  <span>Last seen {compactLastSeen(lastSeen)}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {showMenu || onRevoke ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-[var(--creed-text-secondary)] transition-colors duration-150 hover:text-[var(--creed-text-primary)] data-[state=open]:text-[var(--creed-text-primary)]"
              >
                <Ellipsis className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-[var(--creed-border)] bg-[var(--creed-surface)]"
            >
              {AGENT_OPEN_URLS[connection.id] ? (
                <AnimatedMenuIconItem
                  icon={ArrowUpRightIcon}
                  className="text-sm"
                  onSelect={() => {
                    window.open(
                      AGENT_OPEN_URLS[connection.id],
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                >
                  Open
                </AnimatedMenuIconItem>
              ) : null}
              <AnimatedMenuIconItem
                icon={BookTextIcon}
                className="text-sm"
                onSelect={() => {
                  window.open(
                    mode === "cli"
                      ? "/docs#creed-cli"
                      : `/docs#${AGENT_DOCS_ANCHORS[connection.id] ?? "connect-mcp"}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              >
                Docs
              </AnimatedMenuIconItem>
              {mode === "mcp" && isConnected && onRevoke ? (
                <>
                  <DropdownMenuSeparator />
                  <AnimatedMenuIconItem
                    icon={RadioTowerIcon}
                    showIcon={testState === "idle"}
                    className="text-sm"
                    disabled={testState === "testing"}
                    onSelect={(event) => {
                      event.preventDefault();
                      void runTest();
                    }}
                  >
                    {testState === "testing" ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : testState === "ok" ? (
                      <AnimatedCheckmark />
                    ) : null}
                    {testState === "testing"
                      ? "Testing"
                      : testState === "ok"
                        ? "Connected"
                        : testState === "fail"
                          ? "No connection"
                          : "Test"}
                  </AnimatedMenuIconItem>
                  {onLogs ? (
                    <AnimatedMenuIconItem
                      icon={ChartColumnIncreasingIcon}
                      className="text-sm"
                      onSelect={onLogs}
                    >
                      Logs
                    </AnimatedMenuIconItem>
                  ) : null}
                  <AnimatedMenuIconItem
                    icon={KeyIcon}
                    className="mt-1 bg-[#DC2626] text-sm text-white hover:bg-[#B91C1C] hover:text-white focus:bg-[#B91C1C] focus:text-white data-[highlighted]:bg-[#B91C1C] data-[highlighted]:text-white not-data-[variant=destructive]:focus:**:text-white"
                    onSelect={() => {
                      // Let the menu close first, then open the dialog on the
                      // next tick so its enter animation plays (two Radix
                      // overlays in the same tick skips it).
                      window.setTimeout(() => setRevokeOpen(true), 0);
                    }}
                  >
                    Revoke
                  </AnimatedMenuIconItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <p className="mt-4 text-[13px] leading-6 text-[var(--creed-text-secondary)]">
        {connectHint}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {renderAction(primaryAction, "primary")}
        {secondaryAction ? renderAction(secondaryAction, "secondary") : null}
      </div>

      {onRevoke ? (
        <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
          <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-[#B91C1C]" />
                Revoke {connection.name} access
              </DialogTitle>
              <DialogDescription>
                Disconnects {connection.name} and revokes its MCP tokens. It
                stops reading your Creed until you reconnect and authorize it
                again.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
              <Button
                variant="ghost"
                className="rounded-md"
                onClick={() => setRevokeOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="rounded-md bg-[#DC2626] text-white hover:bg-[#B91C1C]"
                disabled={revoking}
                onClick={async () => {
                  setRevoking(true);
                  try {
                    await onRevoke();
                    setRevokeOpen(false);
                  } catch {
                    // Failed revoke: keep the dialog open so the action can be
                    // retried; the card would otherwise read as disconnected.
                  } finally {
                    setRevoking(false);
                  }
                }}
              >
                {revoking ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : null}
                {revoking ? "Revoking" : "Revoke"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
