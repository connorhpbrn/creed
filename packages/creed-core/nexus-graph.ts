import { accentColorMap, type CreedSection } from "./creed-data.ts";

export type NexusGraphNode = {
  id: string;
  name: string;
  accent: CreedSection["accent"];
  color: string;
  score?: number;
  characterCount: number;
  wordCount: number;
  outgoing: number;
  incoming: number;
  degree: number;
};

export type NexusGraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
};

export type NexusGraph = {
  nodes: NexusGraphNode[];
  edges: NexusGraphEdge[];
};

type SectionTarget = {
  id: string;
  name: string;
  aliases: string[];
};

function normalizeReference(value: string) {
  return value
    .replace(/^#+/, "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[\s_-]+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToSearchText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  ).replace(/\s+/g, " ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasPattern(alias: string) {
  const tokens = alias
    .replace(/^#+/, "")
    .trim()
    .split(/[\s_-]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (!tokens.length) {
    return null;
  }

  return tokens.map(escapeRegExp).join("[\\s_-]*");
}

function buildTargets(sections: CreedSection[]) {
  const targets = sections.map<SectionTarget>((section) => ({
    id: section.id,
    name: section.name,
    aliases: Array.from(
      new Set(
        [section.id, section.name, section.name.replace(/\s+/g, "-")]
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ),
  }));

  const byNormalized = new Map<string, SectionTarget>();
  for (const target of targets) {
    for (const alias of target.aliases) {
      const normalized = normalizeReference(alias);
      if (normalized) {
        byNormalized.set(normalized, target);
      }
    }
  }

  return { targets, byNormalized };
}

function extractChipReferences(html: string) {
  const refs: string[] = [];
  const chipPattern =
    /<span\b(?=[^>]*\bcreed-inline-tag\b)([^>]*)>([\s\S]*?)<\/span>/gi;
  let match: RegExpExecArray | null;

  while ((match = chipPattern.exec(html))) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const attrMatch = attrs.match(/\bdata-tag=(["'])(.*?)\1/i);
    if (attrMatch?.[2]) {
      refs.push(decodeHtmlEntities(attrMatch[2]));
    }
    const text = htmlToSearchText(body).trim();
    if (text) {
      refs.push(text);
    }
  }

  return refs;
}

function extractPlainReferences(html: string, targets: SectionTarget[]) {
  const text = htmlToSearchText(html);
  const refs: string[] = [];

  for (const target of targets) {
    const patterns = target.aliases
      .map(aliasPattern)
      .filter((pattern): pattern is string => Boolean(pattern));
    for (const pattern of patterns) {
      const regex = new RegExp(
        `(^|[^\\p{L}\\p{N}_])#\\s*${pattern}(?=$|[^\\p{L}\\p{N}_-])`,
        "giu",
      );
      if (regex.test(text)) {
        refs.push(target.name);
        break;
      }
    }
  }

  return refs;
}

export function buildNexusGraph(
  sections: CreedSection[],
  scoresBySectionId: ReadonlyMap<string, number> = new Map(),
): NexusGraph {
  const visibleSections = sections.filter((section) => !section.archived);
  const { targets, byNormalized } = buildTargets(visibleSections);
  const edgeById = new Map<string, NexusGraphEdge>();
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  const neighbours = new Map<string, Set<string>>();

  for (const section of visibleSections) {
    const refs = [
      ...extractChipReferences(section.content),
      ...extractPlainReferences(section.content, targets),
    ];

    for (const ref of refs) {
      const target = byNormalized.get(normalizeReference(ref));
      if (!target || target.id === section.id) {
        continue;
      }

      const edgeId = `${section.id}->${target.id}`;
      if (edgeById.has(edgeId)) {
        continue;
      }

      edgeById.set(edgeId, {
        id: edgeId,
        sourceId: section.id,
        targetId: target.id,
      });
      outgoing.set(section.id, (outgoing.get(section.id) ?? 0) + 1);
      incoming.set(target.id, (incoming.get(target.id) ?? 0) + 1);
      const sourceNeighbours = neighbours.get(section.id) ?? new Set<string>();
      sourceNeighbours.add(target.id);
      neighbours.set(section.id, sourceNeighbours);
      const targetNeighbours = neighbours.get(target.id) ?? new Set<string>();
      targetNeighbours.add(section.id);
      neighbours.set(target.id, targetNeighbours);
    }
  }

  const nodes = visibleSections.map<NexusGraphNode>((section) => {
    const out = outgoing.get(section.id) ?? 0;
    const inCount = incoming.get(section.id) ?? 0;
    const text = htmlToSearchText(section.content).trim();
    return {
      id: section.id,
      name: section.name,
      accent: section.accent,
      color: accentColorMap[section.accent] ?? accentColorMap.mono,
      score: scoresBySectionId.get(section.id),
      characterCount: text.length,
      wordCount: text ? text.split(/\s+/).length : 0,
      outgoing: out,
      incoming: inCount,
      degree: neighbours.get(section.id)?.size ?? 0,
    };
  });

  return {
    nodes,
    edges: Array.from(edgeById.values()),
  };
}
