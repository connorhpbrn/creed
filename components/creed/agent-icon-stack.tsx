"use client";

import { IntegrationGlyph } from "@/components/creed/brand";
import type { AgentIconKind, McpClient } from "@/lib/creed-data";
import { cn } from "@/lib/utils";

type AgentLike = string | Pick<McpClient, "name" | "icon"> | { agentName?: string; icon?: AgentIconKind };

const agentAliases: Array<[AgentIconKind, string[]]> = [
  ["claude", ["claude", "claude code"]],
  ["codex", ["codex"]],
  ["openclaw", ["openclaw", "open claw", "open-claw", "clawdius", "claw"]],
  ["hermes", ["hermes"]],
  ["cursor", ["cursor"]],
  ["windsurf", ["windsurf"]],
  ["opencode", ["opencode", "open code", "open-code"]],
];

export function getAgentIconKind(value?: string | null): AgentIconKind {
  const normalized = value?.toLowerCase() ?? "";
  const match = agentAliases.find(([, aliases]) => aliases.some((alias) => normalized.includes(alias)));

  return match?.[0] ?? "custom";
}

function normalizeAgent(agent: AgentLike): { name: string; icon: AgentIconKind } {
  if (typeof agent === "string") {
    return { name: agent, icon: getAgentIconKind(agent) };
  }

  const name = "name" in agent ? agent.name : agent.agentName ?? "Agent";
  return {
    name,
    icon: agent.icon ?? getAgentIconKind(name),
  };
}

function dedupeAgents(agents: AgentLike[]) {
  const seen = new Set<string>();

  return agents
    .map(normalizeAgent)
    .filter((agent) => {
      const key = `${agent.icon}:${agent.name.toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

export function AgentIconStack({
  agents,
  maxVisible = 5,
  className,
  itemClassName,
  variant = "stacked",
}: {
  agents: AgentLike[];
  maxVisible?: number;
  className?: string;
  itemClassName?: string;
  variant?: "stacked" | "inline";
}) {
  const uniqueAgents = dedupeAgents(agents);
  const visibleAgents = uniqueAgents.slice(0, maxVisible);
  const overflowCount = Math.max(uniqueAgents.length - visibleAgents.length, 0);

  if (visibleAgents.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        variant === "stacked" ? "flex items-center overflow-visible py-0.5" : "flex items-center overflow-visible",
        className
      )}
      aria-label={visibleAgents.map((agent) => agent.name).join(", ")}
    >
      {visibleAgents.map((agent, index) => (
        <span
          key={`${agent.icon}-${agent.name}`}
          style={{ zIndex: index + 1 }}
          className={cn(
            variant === "stacked"
              ? "relative -ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white p-[1.5px] shadow-[0_0_0_1px_rgba(255,255,255,0.96)] first:ml-0"
              : "relative inline-flex h-4 w-4 items-center justify-center first:ml-0",
            itemClassName
          )}
        >
          <IntegrationGlyph
            kind={agent.icon}
            framed={false}
            className="h-full w-full"
            assetClassName={variant === "stacked" ? "h-full w-full" : "h-full w-full scale-[0.98]"}
            iconClassName={cn(
              "h-full w-full",
              agent.icon === "custom" && (variant === "stacked" ? "scale-[0.78]" : "scale-[0.82]")
            )}
          />
        </span>
      ))}
      {overflowCount > 0 ? (
        <span
          style={{ zIndex: visibleAgents.length + 1 }}
          className={cn(
            variant === "stacked"
              ? "relative -ml-2 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-1.5 text-[10px] font-medium text-[var(--creed-text-primary)] shadow-[0_0_0_1px_rgba(255,255,255,0.96)]"
              : "relative inline-flex items-center justify-center text-[10px] font-medium text-[var(--creed-text-tertiary)]",
            itemClassName
          )}
        >
          +{overflowCount}
        </span>
      ) : null}
    </div>
  );
}
