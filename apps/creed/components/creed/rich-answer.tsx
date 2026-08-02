"use client";

// Renders an Ask answer's markdown as styled rich text - headings, bold,
// italic, inline code, links, and bullet/numbered lists - so the chat shows
// formatting instead of raw *asterisks* and #hashes.
//
// With `animate`, every word (and inline element) reveals in a fast word-by-word
// "waterfall" cascade - the smooth reveal from the landing page, but quick,
// since inference is fast. Non-animated turns (the older messages) render
// instantly.

import { Fragment, type ReactNode } from "react";
import { motion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;
const STAGGER = 0.018; // seconds between words - fast.
const WORD_DURATION = 0.22;
// Cap the cascade so a long answer's tail doesn't reveal seconds late; past
// this many words they all ride in on the final wave together.
const MAX_STAGGER_STEPS = 60;

const INLINE = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(__[^_]+__)|(_[^_]+_)/g;

type Anim = { counter: { n: number } } | null;

// Wrap a leaf node as one revealed "word" when animating.
function reveal(node: ReactNode, anim: Anim, key: string | number): ReactNode {
  if (!anim) return node;
  const index = anim.counter.n++;
  return (
    <motion.span
      key={key}
      className="mr-[0.25em] inline-block"
      initial={{ opacity: 0, y: 2, filter: "blur(2px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: WORD_DURATION, delay: Math.min(index, MAX_STAGGER_STEPS) * STAGGER, ease: EASE }}
    >
      {node}
    </motion.span>
  );
}

// Render an inline element token as a styled node (no word-splitting inside).
function inlineElement(token: string, key: number): ReactNode {
  if (token.startsWith("`")) {
    return (
      <code key={key} className="rounded-[5px] bg-[var(--creed-surface-raised)] px-1 py-0.5 font-mono text-[0.85em]">
        {token.slice(1, -1)}
      </code>
    );
  }
  if (token.startsWith("[")) {
    const m = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    return m ? (
      <a key={key} href={m[2]} target="_blank" rel="noreferrer" className="text-[var(--creed-accent)] underline underline-offset-2">
        {m[1]}
      </a>
    ) : (
      <Fragment key={key}>{token}</Fragment>
    );
  }
  if (token.startsWith("**") || token.startsWith("__")) {
    return <strong key={key} className="font-semibold">{token.slice(2, -2)}</strong>;
  }
  return <em key={key}>{token.slice(1, -1)}</em>;
}

// Split a plain-text run into revealed word units (animated) or a fragment.
function inlineText(text: string, anim: Anim, keyBase: string): ReactNode {
  if (!anim) return <Fragment key={keyBase}>{text}</Fragment>;
  return text
    .split(/(\s+)/)
    .filter((part) => part.trim().length > 0)
    .map((word, i) => reveal(word, anim, `${keyBase}-${i}`));
}

function renderInline(text: string, anim: Anim): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) nodes.push(inlineText(text.slice(last, start), anim, `t${key++}`));
    const el = inlineElement(token, key++);
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
  | { kind: "paragraph"; text: string };

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  let numbered: string[] = [];

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
    if (!line) { flushAll(); continue; }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { flushAll(); blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] }); continue; }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) { flushParagraph(); flushNumbered(); bullets.push(bullet[1]); continue; }
    const numberedItem = line.match(/^\d+\.\s+(.*)$/);
    if (numberedItem) { flushParagraph(); flushBullets(); numbered.push(numberedItem[1]); continue; }
    flushBullets(); flushNumbered();
    paragraph.push(line);
  }
  flushAll();
  return blocks;
}

export function RichAnswer({
  markdown,
  animate = false,
  className,
}: {
  markdown: string;
  animate?: boolean;
  className?: string;
}) {
  const blocks = parseBlocks(markdown);
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
              {renderInline(block.text, anim)}
            </div>
          );
        }
        if (block.kind === "bullets") {
          return (
            <ul key={index} className="my-1 space-y-0.5 pl-1">
              {block.items.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[0.6em] h-1 w-1 shrink-0 rounded-[1px] bg-[var(--creed-text-tertiary)]" />
                  <span>{renderInline(item, anim)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === "numbered") {
          return (
            <ol key={index} className="my-1 space-y-0.5 pl-1">
              {block.items.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 tabular-nums text-[var(--creed-text-tertiary)]">{i + 1}.</span>
                  <span>{renderInline(item, anim)}</span>
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={index} className="mt-1.5 first:mt-0">
            {renderInline(block.text, anim)}
          </p>
        );
      })}
    </div>
  );
}
