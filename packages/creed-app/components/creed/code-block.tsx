"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { Element, RootContent } from "hast";
import { Check, Copy } from "lucide-react";
import { Button } from "@creed/ui/button";
import { creedLowlight } from "@/lib/code-highlighting";

function renderHighlightedNode(node: RootContent, key: string): ReactNode {
  if (node.type === "text") return <Fragment key={key}>{node.value}</Fragment>;
  if (node.type !== "element") return null;
  const element = node as Element;
  const classNames = element.properties.className;
  const className = Array.isArray(classNames) ? classNames.join(" ") : String(classNames ?? "");
  return (
    <span key={key} className={className || undefined}>
      {element.children.map((child, index) => renderHighlightedNode(child, `${key}-${index}`))}
    </span>
  );
}

export function CreedCodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const normalizedLanguage = language?.trim().toLowerCase() ?? "";
  const highlighted =
    normalizedLanguage && creedLowlight.registered(normalizedLanguage)
      ? creedLowlight.highlight(normalizedLanguage, code)
      : creedLowlight.highlightAuto(code);

  useEffect(
    () => () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return;
    }
    setCopied(true);
    if (resetRef.current) clearTimeout(resetRef.current);
    resetRef.current = setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="relative my-2 min-w-0">
      {normalizedLanguage ? (
        <span className="pointer-events-none absolute left-3 top-2 z-10 font-mono text-[10px] uppercase text-[var(--creed-text-tertiary)]">
          {normalizedLanguage}
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => void copy()}
        aria-label={copied ? "Copied" : "Copy code"}
        className="absolute right-1.5 top-1.5 z-10 rounded-[8px] text-[var(--creed-text-tertiary)] hover:bg-[var(--creed-surface)] hover:text-[var(--creed-text-primary)] dark:hover:bg-input/50"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      <pre className="creed-code-block max-w-full" style={{ paddingTop: "2.15rem" }}>
        <code>
          {highlighted.children.map((node, index) => renderHighlightedNode(node, String(index)))}
        </code>
      </pre>
    </div>
  );
}
