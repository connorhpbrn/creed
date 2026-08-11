"use client";

import { useRef, useState } from "react";
import {
  ArrowUpRightIcon,
  type ArrowUpRightIconHandle,
} from "@creed/ui/arrow-up-right";

type TechnicalValue = {
  name: string;
  ready: boolean;
};

export function OpenTechnicalDetails({ values }: { values: TechnicalValue[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full min-w-0 text-[var(--creed-text-secondary)] sm:flex-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="open-technical-details"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 items-center gap-1 rounded-md text-[12px] font-medium transition-colors duration-200 hover:text-[var(--creed-text-primary)]"
      >
        Technical details
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3 w-3 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? "rotate-90" : ""}`}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div id="open-technical-details" className="min-h-0 overflow-hidden">
          <div className="mt-2 space-y-2">
            {values.map((item) => (
              <div key={item.name} className="flex min-w-0 items-start justify-between gap-4">
                <code className="min-w-0 break-all">{item.name}</code>
                <span
                  className={`w-14 shrink-0 text-right ${
                    item.ready
                      ? "text-[#16A34A] dark:text-[#4ADE80]"
                      : "text-[#DC2626] dark:text-[#F87171]"
                  }`}
                >
                  {item.ready ? "Ready" : "Missing"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OpenSetupGuideLink({ href }: { href: string }) {
  const arrowRef = useRef<ArrowUpRightIconHandle | null>(null);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onMouseEnter={() => arrowRef.current?.startAnimation()}
      onMouseLeave={() => arrowRef.current?.stopAnimation()}
      className="inline-flex shrink-0 items-center gap-1 self-start font-medium text-[var(--creed-accent)] transition-colors hover:text-[var(--creed-accent-hover)]"
    >
      Setup guide
      <ArrowUpRightIcon
        ref={arrowRef}
        size={12}
        className="inline-flex h-3 w-3 items-center justify-center"
      />
    </a>
  );
}
