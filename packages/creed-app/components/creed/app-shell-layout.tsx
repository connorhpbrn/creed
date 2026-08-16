"use client";

import { useEffect, type ReactNode } from "react";
import { CreedShell } from "@/components/creed/shell";
import { GettingStartedCard } from "@/components/creed/getting-started-card";
import { QualityToasts } from "@/components/creed/quality-toasts";
import { WelcomeDialog } from "@/components/creed/welcome-dialog";
import { WelcomeVideoPreloader } from "@/components/creed/welcome-video-preloader";
import { useCreedStateSelector } from "@/components/creed/creed-provider";
import type { CreedSection } from "@creed/core/creed-data";
import { setWelcomePreviewVariant } from "@/lib/welcome-preview";
import { PersistentAppSurfaces } from "@/components/creed/persistent-file-surface";

const IS_DEV = process.env.NODE_ENV !== "production";

function sameShellSections(left: CreedSection[], right: CreedSection[]) {
  return (
    left.length === right.length &&
    left.every((section, index) => {
      const other = right[index];
      return (
        other?.id === section.id &&
        other.name === section.name &&
        other.accent === section.accent &&
        other.archived === section.archived
      );
    })
  );
}

export function AppShellLayout({
  children,
  showWelcomePersonal = false,
  showWelcomeShared = false,
  welcomePaidAt = null,
}: {
  children: ReactNode;
  showWelcomePersonal?: boolean;
  showWelcomeShared?: boolean;
  welcomePaidAt?: string | null;
}) {
  const creedType = useCreedStateSelector((state) => state.creedType);
  const sharedRole = useCreedStateSelector((state) => state.shared?.myRole);
  const user = useCreedStateSelector((state) => state.user);
  const sections = useCreedStateSelector(
    (state) => state.sections,
    sameShellSections,
  );
  const variant = creedType === "shared" ? "shared" : "personal";
  // Shared tour is for owners of their first Shared Creed only. Invited
  // members get Get Started, not the owner orientation.
  const showWelcome =
    variant === "shared"
      ? showWelcomeShared && sharedRole === "owner"
      : showWelcomePersonal;

  // Publish the active space's variant so the root ⌘P preview opens the
  // matching tour (shared inside a shared space, personal otherwise).
  useEffect(() => {
    setWelcomePreviewVariant(variant);
  }, [variant]);

  return (
    <>
      {/* Mounted at the shell so a completion toast fires regardless of which
          app page is open when the analysis finishes. */}
      <QualityToasts />
      {/* Real first-run tour; self-gates on `show`. Soft Creed switches can
          open the other type's tour without a full layout remount. */}
      <WelcomeDialog
        show={showWelcome}
        paidAt={welcomePaidAt}
        variant={variant}
      />
      {(showWelcomePersonal || showWelcomeShared || IS_DEV) && (
        <WelcomeVideoPreloader variant={variant} />
      )}
      <GettingStartedCard />
      <CreedShell
        userName={user.name}
        avatarInitials={user.avatarInitials}
        avatarUrl={user.avatarUrl}
        sections={sections}
      >
        <PersistentAppSurfaces>{children}</PersistentAppSurfaces>
      </CreedShell>
    </>
  );
}
