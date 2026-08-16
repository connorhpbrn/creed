"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CreedEdition } from "@/lib/edition";

const EditionContext = createContext<CreedEdition | null>(null);

export function EditionProvider({
  edition,
  children,
}: {
  edition: CreedEdition;
  children: ReactNode;
}) {
  return (
    <EditionContext.Provider value={edition}>
      {children}
    </EditionContext.Provider>
  );
}

export function useCreedEdition(): CreedEdition {
  const edition = useContext(EditionContext);
  if (!edition) {
    throw new Error("useCreedEdition must be used inside EditionProvider.");
  }
  return edition;
}
