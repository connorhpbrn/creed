import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const featureModels = source("../lib/ai/feature-models.ts");
const panelRoute = source("../app/api/app/ai/panel/route.ts");
const agentRoute = source("../app/api/app/ai/agent/route.ts");
const tabRoute = source("../app/api/app/ai/tab/route.ts");
const openRouter = source("../lib/ai/openrouter.ts");

test("Panel pins one Luna model across Search, Ask, and Agent", () => {
  assert.match(featureModels, /panel: "openai\/gpt-5\.6-luna"/);
  assert.match(panelRoute, /resolveAiCredential\([\s\S]*?"panel", active\?\.creedId\)/);
  assert.match(agentRoute, /resolveAiCredential\([\s\S]*?"panel", activeCreed\?\.creedId\)/);
});

test("Panel configures Luna for fast, stable structured responses", () => {
  assert.match(panelRoute, /reasoning: \{ effort: "none", exclude: true \}/);
  assert.match(agentRoute, /reasoning: \{ effort: "medium", exclude: true \}/);
  assert.match(panelRoute, /seed: 0/);
  assert.match(agentRoute, /seed: 0/);
  assert.match(panelRoute, /require_parameters: true/);
  assert.match(agentRoute, /require_parameters: true/);
  assert.match(panelRoute, /data_collection: "deny"/);
  assert.match(agentRoute, /data_collection: "deny"/);
  assert.doesNotMatch(panelRoute, /temperature:/);
  assert.doesNotMatch(agentRoute, /temperature:/);
  assert.match(openRouter, /typeof seed === "number"/);
});

test("Tab configures Luna for low-latency deterministic streaming", () => {
  assert.match(featureModels, /tab: "openai\/gpt-5\.6-luna"/);
  assert.match(tabRoute, /resolveAiCredential\([\s\S]*?"tab", activeCreed\?\.creedId\)/);
  assert.match(tabRoute, /reasoning: \{ effort: "none", exclude: true \}/);
  assert.match(tabRoute, /seed: 0/);
  assert.match(tabRoute, /maxTokens: mode === "draft" \? 240 : 160/);
  assert.match(tabRoute, /timeoutMs: 12000/);
  assert.match(tabRoute, /sort: "throughput"/);
  assert.match(tabRoute, /require_parameters: true/);
  assert.match(tabRoute, /data_collection: "deny"/);
  assert.doesNotMatch(tabRoute, /temperature:/);
  assert.doesNotMatch(tabRoute, /cerebras|sambanova|groq/i);
});
