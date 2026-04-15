import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalMemoryStore } from "../../core/src/index.mjs";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const nodeBin = process.execPath;

function realCodexPayloads(sessionId) {
  return {
    sessionStart: {
      hook_event_name: "SessionStart",
      session_id: sessionId,
      cwd: repoRoot,
      model: "gpt-5.4"
    },
    userPromptSubmit: {
      hook_event_name: "UserPromptSubmit",
      session_id: sessionId,
      turn_id: "turn-1",
      cwd: repoRoot,
      model: "gpt-5.4",
      prompt: "Always run node --test before finalize"
    },
    stop: {
      hook_event_name: "Stop",
      session_id: sessionId,
      turn_id: "turn-1",
      cwd: repoRoot,
      model: "gpt-5.4",
      stop_hook_active: false,
      last_assistant_message: "We will run node --test first and fix failures."
    }
  };
}

async function invokeHook({ hook, payload, storePath }) {
  const hookScript = path.join(repoRoot, "adapters/codex/bin/codex-memory-hook.mjs");
  const child = spawn(nodeBin, [hookScript, hook, "--store-path", storePath], {
    cwd: repoRoot,
    env: process.env
  });

  child.stdin.write(JSON.stringify(payload));
  child.stdin.end();

  const output = await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`hook process failed (code=${code}): ${stderr}`));
        return;
      }

      resolve(stdout);
    });
  });

  return JSON.parse(String(output).trim());
}

function runInspect(args) {
  const cliScript = path.join(repoRoot, "cli/bin/codex-memory-inspect.mjs");
  const result = spawnSync(nodeBin, [cliScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test("SPEC-017 inspection CLI exposes status, metrics, inspect-last-pack, inspect-session, explain-atom", async () => {
  const storePath = await mkdtemp(path.join(tmpdir(), "codex-memory-spec017-inspect-"));
  const sessionId = "s-spec-017-inspect";
  const payloads = realCodexPayloads(sessionId);

  await invokeHook({ hook: "SessionStart", payload: payloads.sessionStart, storePath });
  await invokeHook({ hook: "UserPromptSubmit", payload: payloads.userPromptSubmit, storePath });
  await invokeHook({ hook: "Stop", payload: payloads.stop, storePath });

  const status = runInspect(["status", "--store-path", storePath, "--json"]);
  assert.equal(status.command, "status");
  assert.equal(typeof status.metrics.semantic_mode, "string");
  assert.equal(typeof status.audit.audit_last_updated_at, "string");

  const metrics = runInspect(["metrics", "--store-path", storePath, "--json"]);
  assert.equal(metrics.command, "metrics");
  assert.equal(typeof metrics.runtime.memory_enabled, "boolean");
  assert.equal(typeof metrics.runtime.learning_enabled, "boolean");

  const lastPack = runInspect(["inspect-last-pack", "--store-path", storePath, "--json"]);
  assert.equal(lastPack.command, "inspect-last-pack");
  assert.equal(typeof lastPack.pack.decision_reason, "string");
  assert.equal(typeof lastPack.pack.metrics.dropped_count, "number");

  const session = runInspect(["inspect-session", "--store-path", storePath, "--session-id", sessionId, "--json"]);
  assert.equal(session.command, "inspect-session");
  assert.equal(session.session.session_ref, sessionId);

  const store = new LocalMemoryStore({ rootDir: storePath });
  const currentStore = store.loadMemoryStore();
  assert.ok(currentStore.atoms.length > 0);

  const explained = runInspect(["explain-atom", "--store-path", storePath, "--atom-id", currentStore.atoms[0].id, "--json"]);
  assert.equal(explained.command, "explain-atom");
  assert.equal(explained.atom.id, currentStore.atoms[0].id);
});

test("SPEC-017 inspection CLI analyzes and compacts the store only with explicit apply", async () => {
  const storePath = await mkdtemp(path.join(tmpdir(), "codex-memory-spec017-cleanup-"));
  const store = new LocalMemoryStore({ rootDir: storePath });
  const memoryStore = store.loadMemoryStore();

  memoryStore.events.push(
    {
      id: "evt-a",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test", session_ref: "s-1" },
      event_type: "BEFORE_PROMPT",
      occurred_at: "2026-04-14T10:00:00.000Z",
      captured_at: "2026-04-14T10:00:01.000Z",
      payload: { prompt_excerpt: "You are a helpful assistant." }
    },
    {
      id: "evt-b",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test", session_ref: "s-1" },
      event_type: "BEFORE_PROMPT",
      occurred_at: "2026-04-14T10:00:00.000Z",
      captured_at: "2026-04-14T10:00:02.000Z",
      payload: { prompt_excerpt: "You are a helpful assistant." }
    }
  );
  memoryStore.atoms.push(
    {
      id: "atom-noise-1",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test" },
      atom_type: "fact",
      content: "You are a helpful assistant",
      confidence: 0.72,
      created_at: "2026-04-14T10:10:00.000Z"
    },
    {
      id: "atom-good-1",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test" },
      atom_type: "workflow",
      content: "Always run node --test before finalize changes",
      confidence: 0.91,
      created_at: "2026-04-14T10:11:00.000Z"
    }
  );

  store.rewriteCanonicalArtifact("events", memoryStore.events);
  store.rewriteCanonicalArtifact("atoms", memoryStore.atoms);
  store.rebuildIndexes(memoryStore);

  const analysis = runInspect(["analyze-store", "--store-path", storePath, "--json"]);
  assert.equal(analysis.command, "analyze-store");
  assert.equal(analysis.duplicates.events, 1);
  assert.equal(analysis.noise.atoms, 1);
  assert.equal(typeof analysis.noise_reasons.atoms.generic_system_scaffolding, "number");

  const dryRun = runInspect(["compact-store", "--store-path", storePath, "--json"]);
  assert.equal(dryRun.command, "compact-store");
  assert.equal(dryRun.applied, false);
  assert.match(dryRun.reason, /requires --apply/);
  assert.equal(store.loadMemoryStore().atoms.length, 2);

  const applied = runInspect(["compact-store", "--store-path", storePath, "--apply", "--json"]);
  assert.equal(applied.command, "compact-store");
  assert.equal(applied.applied, true);
  assert.equal(applied.removed.events, 1);
  assert.equal(applied.removed.atoms, 1);
  assert.equal(applied.removed_breakdown.atoms.noise, 1);

  const reloaded = store.loadMemoryStore();
  assert.equal(reloaded.events.length, 1);
  assert.equal(reloaded.atoms.length, 1);
  assert.equal(reloaded.atoms[0].id, "atom-good-1");
});

test("SPEC-017 metrics expose learning-quality rejections from the latest audited sessions", async () => {
  const storePath = await mkdtemp(path.join(tmpdir(), "codex-memory-spec017-learning-metrics-"));
  const sessionId = "s-spec-017-learning";

  await invokeHook({
    hook: "SessionStart",
    payload: {
      hook_event_name: "SessionStart",
      session_id: sessionId,
      cwd: repoRoot,
      model: "gpt-5.4"
    },
    storePath
  });

  await invokeHook({
    hook: "UserPromptSubmit",
    payload: {
      hook_event_name: "UserPromptSubmit",
      session_id: sessionId,
      turn_id: "turn-1",
      cwd: repoRoot,
      model: "gpt-5.4",
      prompt: "Review findings: You are a helpful assistant. No encontré findings nuevos en este fix."
    },
    storePath
  });

  await invokeHook({
    hook: "Stop",
    payload: {
      hook_event_name: "Stop",
      session_id: sessionId,
      turn_id: "turn-1",
      cwd: repoRoot,
      model: "gpt-5.4",
      stop_hook_active: false,
      last_assistant_message: "No encontré findings nuevos en este fix. Always keep the default store path at ~/.codex/plugins/codex-memory/data."
    },
    storePath
  });

  const metrics = runInspect(["metrics", "--store-path", storePath, "--json"]);
  assert.equal(metrics.command, "metrics");
  assert.ok(metrics.learning.sessions_observed >= 1);
  assert.ok(metrics.learning.filtered_by_quality_policy >= 1);
  assert.ok(metrics.learning.filtered_reasons.review_chatter >= 1);
});
