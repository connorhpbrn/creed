"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileAvatar } from "@/components/creed/profile-avatar";

// The spaces a connecting agent can be granted, shown on the OAuth consent
// screen. One connection reaches exactly one Creed - personal OR a single
// company - the way Supabase scopes an access token to one project. To reach a
// second Creed the user connects the agent again and picks that one. Keeping it
// to one space removes any per-call ambiguity: the agent always acts on the
// Creed it was connected to.
export type SpaceOption = {
  id: string;
  label: string;
  type: "personal" | "company";
  avatarInitials: string;
  avatarUrl?: string;
};

export function AuthorizeSpacePicker({ spaces }: { spaces: SpaceOption[] }) {
  // Default to the personal Creed (or the first space if there is none), so the
  // common case is a single click. The choice is required and always resolves
  // to exactly one space.
  const [selectedId, setSelectedId] = useState<string>(() => {
    const personal = spaces.find((space) => space.type === "personal");
    return (personal ?? spaces[0])?.id ?? "";
  });
  const selected = spaces.find((space) => space.id === selectedId);

  return (
    <div className="mt-6 text-left">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Choose the Creed this agent connects to"
            className="inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface)] py-0 pl-2 pr-3 text-[13px] text-[var(--creed-text-primary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] aria-expanded:bg-[var(--creed-surface-raised)]"
          >
            <span className="flex min-w-0 items-center gap-2">
              {selected ? (
                <ProfileAvatar
                  kind={selected.type === "company" ? "company" : "person"}
                  name={selected.label}
                  initials={selected.avatarInitials}
                  avatarUrl={selected.avatarUrl}
                  size="sm"
                />
              ) : null}
              <span className="truncate">
                {selected?.label ?? "Select a Creed"}
              </span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)]" strokeWidth={2} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[var(--radix-dropdown-menu-trigger-width)] max-w-[min(24rem,90vw)] border-[var(--creed-border)] bg-[var(--creed-surface)]"
        >
          {spaces.map((space) => {
            const isSelected = space.id === selectedId;
            return (
              <DropdownMenuItem
                key={space.id}
                onSelect={() => setSelectedId(space.id)}
                className="flex items-center justify-between gap-3 px-2 text-[13px]"
              >
                <span className="flex min-w-0 items-center gap-2 text-[var(--creed-text-primary)]">
                  <ProfileAvatar
                    kind={space.type === "company" ? "company" : "person"}
                    name={space.label}
                    initials={space.avatarInitials}
                    avatarUrl={space.avatarUrl}
                    size="sm"
                  />
                  <span className="truncate">{space.label}</span>
                </span>
                {isSelected ? (
                  <Check
                    className="h-3.5 w-3.5 shrink-0 text-[var(--creed-text-secondary)]"
                    strokeWidth={1.8}
                  />
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* The form posts the single chosen Creed; the server re-validates that the
          user is a member of it before granting the connection. */}
      <input type="hidden" name="creed_grant" value={selectedId} />
    </div>
  );
}
