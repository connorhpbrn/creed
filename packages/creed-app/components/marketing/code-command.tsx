"use client";

// Shared CLI / one-liner command block used on /bench. Same
// creed-code-block chrome as the editor, with a far-right copy control.

import { useState, type ReactNode } from "react";
import { AnimatedIconButton } from "@/components/creed/animated-icon-action";
import { AnimatedCheckmark } from "@creed/ui/animated-checkmark";
import { CopyIcon } from "@creed/ui/copy";
import { cn } from "@creed/ui/utils";

export function CodeCommand({
  copyText,
  children,
  className,
}: {
  copyText: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "creed-code-block flex w-fit max-w-full items-center gap-2 rounded-[12px] bg-[var(--creed-surface-raised)] py-[0.45rem] pl-[0.95rem] pr-[0.4rem]",
        className,
      )}
    >
      <pre className="min-w-0 overflow-x-auto font-mono text-[13px] leading-[1.5] text-[var(--creed-text-primary)]">
        <code>{children}</code>
      </pre>
      <CodeCopyButton copyText={copyText} />
    </div>
  );
}

export function CodeCopyButton({
  copyText,
  className,
}: {
  copyText: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <AnimatedIconButton
      icon={CopyIcon}
      iconSize={14}
      iconClassName="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none"
      showIcon={!copied}
      variant="ghost"
      size="icon-sm"
      aria-label={copied ? "Copied" : "Copy"}
      className={cn(
        "shrink-0 text-[var(--creed-text-tertiary)] hover:bg-transparent hover:text-[var(--creed-text-primary)]",
        className,
      )}
      onClick={() => {
        void navigator.clipboard?.writeText(copyText).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
    >
      {copied ? (
        <AnimatedCheckmark className="h-3.5 w-3.5" size={14} />
      ) : (
        <span className="sr-only">Copy</span>
      )}
    </AnimatedIconButton>
  );
}
