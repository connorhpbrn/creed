"use client";

import type { ReactNode } from "react";
import { CreedShell } from "@/components/creed/shell";
import { useCreed } from "@/components/creed/creed-provider";

export function AppShellLayout({ children }: { children: ReactNode }) {
  const { state } = useCreed();

  return (
    <CreedShell
      userName={state.user.name}
      avatarInitials={state.user.avatarInitials}
      avatarUrl={state.user.avatarUrl}
      sections={state.sections}
    >
      {children}
    </CreedShell>
  );
}
