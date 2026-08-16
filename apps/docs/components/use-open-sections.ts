"use client";

import { useState } from "react";

export function useOpenSections(initial: string[], limit = 2) {
  const [open, setOpen] = useState(initial);

  return {
    isOpen: (key: string) => open.includes(key),
    toggle: (key: string) => {
      setOpen((current) => {
        if (current.includes(key)) return current.filter((item) => item !== key);
        return [...current.slice(-(limit - 1)), key];
      });
    },
  };
}
