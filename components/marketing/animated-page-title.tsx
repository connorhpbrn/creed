"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { splitPreservingLigatures } from "@/lib/landing-text";
import { cn } from "@/lib/utils";

const VARIANTS = {
  hidden: { opacity: 0, filter: "blur(10px)", y: 10 },
  visible: { opacity: 1, filter: "blur(0px)", y: 0 },
} as const;

const STAGGER_TRANSITION = (delay: number) => ({
  delayChildren: delay,
  staggerChildren: 0.042,
});

const ITEM_TRANSITION = { duration: 0.62, ease: [0.16, 1, 0.3, 1] as const };

type AnimatedHeadingProps = {
  text: string;
  className?: string;
  delay?: number;
};

function renderGlyphs(text: string) {
  return text.split("\n").flatMap((line, lineIndex, lines) => {
    const glyphs = splitPreservingLigatures(line);
    const lineNodes = glyphs.map((glyph, index) => (
      <motion.span
        key={`${lineIndex}-${index}-${glyph}`}
        variants={VARIANTS}
        transition={ITEM_TRANSITION}
        className={cn(
          "inline-block whitespace-pre",
          glyph !== " " && "will-change-transform"
        )}
      >
        {glyph === " " ? " " : glyph}
      </motion.span>
    ));

    if (lineIndex < lines.length - 1) {
      lineNodes.push(<span key={`break-${lineIndex}`} className="basis-full" />);
    }

    return lineNodes;
  });
}

export function AnimatedPageTitle({ text, className, delay = 0 }: AnimatedHeadingProps) {
  const nodes = useMemo(() => renderGlyphs(text), [text]);

  return (
    <motion.h1
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: STAGGER_TRANSITION(delay) },
      }}
      className={className}
    >
      {nodes}
    </motion.h1>
  );
}

export function AnimatedSectionHeading({ text, className }: AnimatedHeadingProps) {
  // Section headings inside subpages (privacy, terms, docs) used to play the
  // same per-glyph blur-in as the page title, which felt repetitive scrolling
  // through long copy. They now render plainly so only the page title carries
  // the entrance flourish.
  const lines = text.split("\n");
  return (
    <h2 className={className}>
      {lines.map((line, index) => (
        <span key={`${line}-${index}`} className="block">
          {line}
        </span>
      ))}
    </h2>
  );
}
