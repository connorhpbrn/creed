"use client";

// Caps how many sidebar groups can be open at once (default 3) so a long
// "On this page" nav stays compact. Opening one past the limit closes the group
// that was opened earliest. Used by the /docs sidebar.

import { useCallback, useState } from "react";

export function useOpenSections(initialOpen: string[], maxOpen = 3) {
  const [open, setOpen] = useState<string[]>(() => initialOpen.slice(0, maxOpen));

  const toggle = useCallback(
    (key: string) => {
      setOpen((prev) => {
        if (prev.includes(key)) return prev.filter((entry) => entry !== key);
        const next = [...prev, key];
        return next.length > maxOpen ? next.slice(next.length - maxOpen) : next;
      });
    },
    [maxOpen]
  );

  const isOpen = useCallback((key: string) => open.includes(key), [open]);

  return { isOpen, toggle };
}
