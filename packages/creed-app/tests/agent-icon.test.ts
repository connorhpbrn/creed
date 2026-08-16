import assert from "node:assert/strict";
import test from "node:test";
import { getAgentIconKind } from "../lib/agent-icon.ts";

test("agent icon inference keeps specific clients ahead of broad brands", () => {
  assert.equal(getAgentIconKind("Claude Code"), "claudecode");
  assert.equal(getAgentIconKind("claude-code"), "claudecode");
  assert.equal(getAgentIconKind("Anthropic Claude Code MCP"), "claudecode");
  assert.equal(getAgentIconKind("Claude"), "claude");
});

test("agent icon inference keeps OpenAI surfaces distinct", () => {
  assert.equal(getAgentIconKind("Codex"), "codex");
  assert.equal(getAgentIconKind("OpenAI Codex CLI"), "codex");
  assert.equal(getAgentIconKind("ChatGPT"), "chatgpt");
  assert.equal(getAgentIconKind("ChatGPT connector"), "chatgpt");
});

test("agent icon inference gives Creed CLI its first-party identity", () => {
  assert.equal(getAgentIconKind("Creed CLI"), "cli");
  assert.equal(getAgentIconKind("creed-cli"), "cli");
});
