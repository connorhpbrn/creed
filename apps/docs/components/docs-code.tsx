import type { ReactNode } from "react";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import { CodeCommand } from "@/components/marketing/code-command";

hljs.registerLanguage("bash", bash);

export function DocsCommand({ children }: { children: string }) {
  const highlighted = hljs.highlight(children, { language: "bash" }).value;
  const multiline = children.includes("\n");

  return (
    <CodeCommand
      copyText={children}
      className={`w-full justify-between ${multiline ? "items-start" : "items-center"}`}
    >
      <span dangerouslySetInnerHTML={{ __html: highlighted }} />
    </CodeCommand>
  );
}

export function InlineCode({ children }: { children: ReactNode }) {
  return <code>{children}</code>;
}
