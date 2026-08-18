"use client";

// Renders an Ask answer's markdown as styled rich text - headings, bold,
// italic, inline code, links, and bullet/numbered lists - so the chat shows
// formatting instead of raw *asterisks* and #hashes.
//
// With `animate`, every word (and inline element) reveals in a fast word-by-word
// "waterfall" cascade - the smooth reveal from the landing page, but quick,
// since inference is fast. Non-animated turns (the older messages) render
// instantly.

import { Fragment, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import { SectionReferenceChip } from "@/components/creed/section-reference-chip";
import { CreedCodeBlock } from "@/components/creed/code-block";
import type { PanelSectionReference } from "@/lib/panel/actions";

const EASE = [0.22, 1, 0.36, 1] as const;
const STAGGER = 0.018; // seconds between words - fast.
const WORD_DURATION = 0.22;
// Cap the cascade so a long answer's tail doesn't reveal seconds late; past
// this many words they all ride in on the final wave together.
const MAX_STAGGER_STEPS = 60;

const INLINE = /(\[\[section:[^\]]+\]\])|(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(__[^_]+__)|(~~[^~]+~~)|(\*[^*]+\*)|(_[^_]+_)/g;

type Anim = { counter: { n: number } } | null;

// Wrap a leaf node as one revealed "word" when animating.
function reveal(node: ReactNode, anim: Anim, key: string | number): ReactNode {
  if (!anim) return node;
  const index = anim.counter.n++;
  return (
    <motion.span
      key={key}
      className="inline-block"
      initial={{ opacity: 0, y: 2, filter: "blur(2px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: WORD_DURATION, delay: Math.min(index, MAX_STAGGER_STEPS) * STAGGER, ease: EASE }}
    >
      {node}
    </motion.span>
  );
}

// Render an inline element token as a styled node (no word-splitting inside).
function safeExternalHref(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:"
      ? value
      : null;
  } catch {
    return null;
  }
}

function inlineElement(
  token: string,
  key: number,
  references: ReadonlyMap<string, PanelSectionReference>,
  onSectionClick?: (sectionId: string) => void,
): ReactNode {
  if (token.startsWith("[[section:")) {
    const id = token.slice(10, -2);
    const reference = references.get(id);
    if (!reference) return <Fragment key={key}>{token}</Fragment>;
    return (
      <SectionReferenceChip
        key={key}
        section={reference}
        onSelect={onSectionClick}
      />
    );
  }
  if (token.startsWith("`")) {
    return (
      <code key={key} className="rounded-[5px] bg-[var(--creed-surface-raised)] px-1 py-0.5 font-mono text-[0.85em]">
        {token.slice(1, -1)}
      </code>
    );
  }
  if (token.startsWith("[")) {
    const m = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    const href = m ? safeExternalHref(m[2]) : null;
    return m && href ? (
      <a key={key} href={href} target="_blank" rel="noreferrer" className="text-[var(--creed-accent)] underline underline-offset-2">
        {m[1]}
      </a>
    ) : (
      <Fragment key={key}>{token}</Fragment>
    );
  }
  if (token.startsWith("**") || token.startsWith("__")) {
    return <strong key={key} className="font-semibold">{token.slice(2, -2)}</strong>;
  }
  if (token.startsWith("~~")) {
    return <s key={key}>{token.slice(2, -2)}</s>;
  }
  return <em key={key}>{token.slice(1, -1)}</em>;
}

// Split a plain-text run into revealed word units (animated) or a fragment.
function inlineText(text: string, anim: Anim, keyBase: string): ReactNode {
  if (!anim) return <Fragment key={keyBase}>{text}</Fragment>;
  return text
    .split(/(\s+)/)
    .filter(Boolean)
    .map((part, i) =>
      /^\s+$/.test(part) ? <Fragment key={`${keyBase}-${i}`}>{part}</Fragment> : reveal(part, anim, `${keyBase}-${i}`),
    );
}

function renderInline(
  text: string,
  anim: Anim,
  references: ReadonlyMap<string, PanelSectionReference>,
  onSectionClick?: (sectionId: string) => void,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) nodes.push(inlineText(text.slice(last, start), anim, `t${key++}`));
    const el = inlineElement(token, key++, references, onSectionClick);
    nodes.push(anim ? reveal(el, anim, `e${key}`) : el);
    last = start + token.length;
  }
  if (last < text.length) nodes.push(inlineText(text.slice(last), anim, `t${key++}`));
  return nodes;
}

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "numbered"; items: string[] }
  | { kind: "callout"; text: string }
  | { kind: "code"; language: string; text: string }
  | { kind: "divider" }
  | { kind: "paragraph"; text: string };

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  let numbered: string[] = [];
  let code: { language: string; lines: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) { blocks.push({ kind: "paragraph", text: paragraph.join(" ") }); paragraph = []; }
  };
  const flushBullets = () => {
    if (bullets.length) { blocks.push({ kind: "bullets", items: bullets }); bullets = []; }
  };
  const flushNumbered = () => {
    if (numbered.length) { blocks.push({ kind: "numbered", items: numbered }); numbered = []; }
  };
  const flushAll = () => { flushParagraph(); flushBullets(); flushNumbered(); };

  for (const raw of lines) {
    const line = raw.trim();
    if (code) {
      if (line === "```") {
        blocks.push({ kind: "code", language: code.language, text: code.lines.join("\n") });
        code = null;
      } else {
        code.lines.push(raw);
      }
      continue;
    }
    const fence = line.match(/^```([\w.+-]*)$/);
    if (fence) { flushAll(); code = { language: fence[1], lines: [] }; continue; }
    if (!line) { flushAll(); continue; }
    if (/^([-*_])\1{2,}$/.test(line)) { flushAll(); blocks.push({ kind: "divider" }); continue; }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { flushAll(); blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] }); continue; }
    const callout = line.match(/^>\s?(.*)$/);
    if (callout) { flushAll(); blocks.push({ kind: "callout", text: callout[1] }); continue; }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) { flushParagraph(); flushNumbered(); bullets.push(bullet[1]); continue; }
    const numberedItem = line.match(/^\d+\.\s+(.*)$/);
    if (numberedItem) { flushParagraph(); flushBullets(); numbered.push(numberedItem[1]); continue; }
    flushBullets(); flushNumbered();
    paragraph.push(line);
  }
  if (code) blocks.push({ kind: "code", language: code.language, text: code.lines.join("\n") });
  flushAll();
  return blocks;
}

export function RichAnswer({
  markdown,
  animate = false,
  className,
  references = [],
  onSectionClick,
}: {
  markdown: string;
  animate?: boolean;
  className?: string;
  references?: PanelSectionReference[];
  onSectionClick?: (sectionId: string) => void;
}) {
  const blocks = parseBlocks(markdown);
  const referencesById = new Map(references.map((reference) => [reference.id, reference]));
  const anim: Anim = animate ? { counter: { n: 0 } } : null;
  // break-words so a long URL or unbroken token wraps inside the chat bubble
  // instead of forcing it to scroll sideways.
  return (
    <div className={`break-words ${className ?? ""}`}>
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          const size = block.level <= 1 ? "text-[15px]" : block.level === 2 ? "text-[14px]" : "text-[13px]";
          return (
            <div key={index} className={`mt-2 mb-1 font-semibold text-[var(--creed-text-primary)] first:mt-0 ${size}`}>
              {renderInline(block.text, anim, referencesById, onSectionClick)}
            </div>
          );
        }
        if (block.kind === "bullets") {
          return (
            <ul
              key={index}
              className="creed-list creed-list-bullet my-1 space-y-0.5"
              style={{ "--section-accent-bar": "#2563EB" } as CSSProperties}
            >
              {block.items.map((item, i) => (
                <li key={i} className="creed-list-item">
                  <span>{renderInline(item, anim, referencesById, onSectionClick)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === "numbered") {
          return (
            <ol
              key={index}
              className="creed-list creed-list-ordered my-1 space-y-0.5"
              style={{ "--section-accent-bar": "#2563EB" } as CSSProperties}
            >
              {block.items.map((item, i) => (
                <li key={i} className="creed-list-item">
                  <span>{renderInline(item, anim, referencesById, onSectionClick)}</span>
                </li>
              ))}
            </ol>
          );
        }
        if (block.kind === "callout") {
          return (
            <blockquote
              key={index}
              className="creed-callout my-2"
              style={{
                "--section-accent-tint": "#2563EB22",
                "--section-accent-bar": "#2563EB",
              } as CSSProperties}
            >
              <p>{renderInline(block.text, anim, referencesById, onSectionClick)}</p>
            </blockquote>
          );
        }
        if (block.kind === "code") {
          return <CreedCodeBlock key={index} code={block.text} language={block.language} />;
        }
        if (block.kind === "divider") {
          return <hr key={index} className="my-3 border-[var(--creed-border)]" />;
        }
        return (
          <p key={index} className="mt-1.5 first:mt-0">
            {renderInline(block.text, anim, referencesById, onSectionClick)}
          </p>
        );
      })}
    </div>
  );
}
