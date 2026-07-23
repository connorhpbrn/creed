// Pure-function tests for the Nexus graph compiler.
//
//   node --test --experimental-strip-types tests/nexus-graph.test.ts

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildNexusGraph } from "../lib/nexus-graph.ts";
import type { CreedSection } from "../lib/creed-data.ts";

function section(
  id: string,
  name: string,
  content: string,
  archived = false,
): CreedSection {
  return {
    id,
    kind: "rich-text",
    template: "freeform",
    name,
    accent: "identity",
    content,
    agentWritable: true,
    agentPermission: "direct",
    lastEditedBy: "Test",
    lastEditedType: "user",
    lastEditedLabel: "now",
    archived,
  };
}

test("Nexus graph links real section chips and ignores fake tags", () => {
  const graph = buildNexusGraph([
    section(
      "identity",
      "Identity",
      '<h3>Graph Tags</h3><p><span class="creed-inline-tag" data-tag="beliefs">Beliefs</span> <span class="creed-inline-tag" data-tag="fake">Fake</span></p>',
    ),
    section("beliefs", "Beliefs", "<p>#Identity #not-a-section</p>"),
  ]);

  assert.deepEqual(graph.edges.map((edge) => edge.id).sort(), [
    "beliefs->identity",
    "identity->beliefs",
  ]);
});

test("Nexus graph matching is case-insensitive and separator-tolerant", () => {
  const graph = buildNexusGraph([
    section("identity", "Identity", "<p>#product judgment #AGENT_RULES</p>"),
    section("product-judgment", "Product Judgment", "<p>#identity</p>"),
    section("agent-rules", "Agent Rules", "<p>#Product-Judgment</p>"),
  ]);

  assert.deepEqual(graph.edges.map((edge) => edge.id).sort(), [
    "agent-rules->product-judgment",
    "identity->agent-rules",
    "identity->product-judgment",
    "product-judgment->identity",
  ]);
});

test("Nexus graph removes self links, duplicates, and archived targets", () => {
  const graph = buildNexusGraph([
    section(
      "identity",
      "Identity",
      '<p>#Identity #Beliefs <span class="creed-inline-tag" data-tag="beliefs">Beliefs</span> #Archived</p>',
    ),
    section("beliefs", "Beliefs", "<p></p>"),
    section("archived", "Archived", "<p>#Identity</p>", true),
  ]);

  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ["identity", "beliefs"],
  );
  assert.deepEqual(
    graph.edges.map((edge) => edge.id),
    ["identity->beliefs"],
  );
});

test("Nexus graph carries section scores onto nodes", () => {
  const graph = buildNexusGraph(
    [
      section("identity", "Identity", "<p>#Beliefs</p>"),
      section("beliefs", "Beliefs", "<p></p>"),
    ],
    new Map([["identity", 87]]),
  );

  assert.equal(graph.nodes.find((node) => node.id === "identity")?.score, 87);
  assert.equal(
    graph.nodes.find((node) => node.id === "beliefs")?.score,
    undefined,
  );
});

test("Nexus graph counts unique neighbouring sections", () => {
  const graph = buildNexusGraph([
    section("identity", "Identity", "<p>#Beliefs</p>"),
    section("beliefs", "Beliefs", "<p>#Identity #Goals</p>"),
    section("goals", "Goals", "<p></p>"),
  ]);

  assert.equal(
    graph.nodes.find((node) => node.id === "identity")?.degree,
    1,
  );
  assert.equal(
    graph.nodes.find((node) => node.id === "beliefs")?.degree,
    2,
  );
});
