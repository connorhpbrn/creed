// The /learn article registry. Each guide is one file exporting an `Article`;
// this module collects them and exposes lookup helpers used by the /learn
// index, the /learn/[slug] pages, the sitemap, and the llms files.

import type { Article } from "./types";

import { personalContextFile } from "./personal-context-file";
import { reExplainingTax } from "./re-explaining-tax";
import { memoryVsContextFile } from "./memory-vs-context-file";
import { connectYourTools } from "./connect-your-tools";

export const learnArticles: Article[] = [
  personalContextFile,
  reExplainingTax,
  memoryVsContextFile,
  connectYourTools,
];

export function getArticle(slug: string): Article | undefined {
  return learnArticles.find((a) => a.slug === slug);
}
