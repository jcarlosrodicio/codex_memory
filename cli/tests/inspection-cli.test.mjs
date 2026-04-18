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

test("inspection CLI exposes status, metrics, inspect-last-pack, inspect-session, explain-atom", async () => {
  const storePath = await mkdtemp(path.join(tmpdir(), "codex-memory-spec017-inspect-"));
  const sessionId = "s-inspect";
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

test("inspection CLI analyzes and compacts the store only with explicit apply", async () => {
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
      id: "atom-noise-2",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test" },
      atom_type: "fact",
      content: "He revisado lo trackeado y no he visto tokens, claves, secrets, ni credenciales reales",
      confidence: 0.72,
      created_at: "2026-04-14T10:10:30.000Z"
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
  memoryStore.capsules.push(
    {
      id: "capsule-noise-inherited",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test" },
      summary: "Session learned durable fact",
      source_memory_ids: ["atom-noise-2"],
      confidence: 0.72,
      created_at: "2026-04-14T10:10:45.000Z"
    }
  );

  store.rewriteCanonicalArtifact("events", memoryStore.events);
  store.rewriteCanonicalArtifact("atoms", memoryStore.atoms);
  store.rewriteCanonicalArtifact("capsules", memoryStore.capsules);
  store.rebuildIndexes(memoryStore);

  const analysis = runInspect(["analyze-store", "--store-path", storePath, "--json"]);
  assert.equal(analysis.command, "analyze-store");
  assert.equal(analysis.duplicates.events, 1);
  assert.equal(analysis.noise.atoms, 2);
  assert.equal(analysis.noise.capsules, 1);
  assert.equal(typeof analysis.noise_reasons.atoms.generic_system_scaffolding, "number");
  assert.equal(typeof analysis.noise_reasons.atoms.session_validation_noise, "number");
  assert.equal(typeof analysis.noise_reasons.capsules.source_memory_noise_inherited, "number");

  const dryRun = runInspect(["compact-store", "--store-path", storePath, "--json"]);
  assert.equal(dryRun.command, "compact-store");
  assert.equal(dryRun.applied, false);
  assert.match(dryRun.reason, /requires --apply/);
  assert.equal(store.loadMemoryStore().atoms.length, 3);

  const applied = runInspect(["compact-store", "--store-path", storePath, "--apply", "--json"]);
  assert.equal(applied.command, "compact-store");
  assert.equal(applied.applied, true);
  assert.equal(applied.removed.events, 1);
  assert.equal(applied.removed.atoms, 2);
  assert.equal(applied.removed.capsules, 1);
  assert.equal(applied.removed_breakdown.atoms.noise, 2);
  assert.equal(applied.removed_breakdown.capsules.noise, 1);

  const reloaded = store.loadMemoryStore();
  assert.equal(reloaded.events.length, 1);
  assert.equal(reloaded.atoms.length, 1);
  assert.equal(reloaded.capsules.length, 0);
  assert.equal(reloaded.atoms[0].id, "atom-good-1");
});

test("metrics expose learning-quality rejections from the latest audited sessions", async () => {
  const storePath = await mkdtemp(path.join(tmpdir(), "codex-memory-spec017-learning-metrics-"));
  const sessionId = "s-learning";

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
  assert.ok(metrics.learning.quality_policy_filtered_reasons.review_chatter >= 1);
  assert.equal(typeof metrics.prompts.injection_rate, "number");
  assert.equal(typeof metrics.prompts.empty_pack_rate, "number");
  assert.equal(typeof metrics.prompts.avg_token_savings_on_injected_prompts, "number");
  assert.equal(typeof metrics.prompts.max_token_savings_estimate, "number");
  assert.equal(typeof metrics.prompt_drop_reasons.empty_pack, "object");
  assert.equal(typeof metrics.store.artifacts.atoms, "number");
  assert.equal(typeof metrics.store.edges.zero_edges_visible, "boolean");
});

test("metrics expose session narrative quality reasons distinctly from other noise", async () => {
  const storePath = await mkdtemp(path.join(tmpdir(), "codex-memory-spec017-session-narrative-metrics-"));
  const runtimeRoot = path.join(storePath, "runtime");

  const audits = [
    {
      audit_schema_version: "1",
      id: "audit-stop-session-narrative",
      occurred_at: "2026-04-16T10:15:00.000Z",
      session_id: "s-session-narrative",
      hook_event_name: "Stop",
      learning: {
        rejected_by_quality_policy: 3,
        filtered_reasons: {
          session_validation_noise: 1,
          session_result_narrative_noise: 1,
          session_narrative_noise: 1
        },
        promoted_atoms: 1,
        promoted_capsule: true
      }
    }
  ];

  await import("node:fs/promises").then(({ mkdir, writeFile }) => Promise.all([
    mkdir(runtimeRoot, { recursive: true }),
    writeFile(path.join(runtimeRoot, "audit.ndjson"), `${audits.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8"),
    writeFile(path.join(runtimeRoot, "status.json"), JSON.stringify({
      memory_enabled: true,
      learning_enabled: true,
      semantic_mode: "off",
      metrics: {
        pack_tokens: 0,
        retrieved_count: 0,
        dropped_count: 0,
        token_savings_estimate: 0
      },
      safety: {
        blocked_persistence_detected: false,
        redaction_detected: false,
        warning_count: 0
      }
    }, null, 2), "utf8")
  ]));

  const metrics = runInspect(["metrics", "--store-path", storePath, "--json"]);
  assert.equal(metrics.learning.filtered_reasons.session_validation_noise, 1);
  assert.equal(metrics.learning.filtered_reasons.session_result_narrative_noise, 1);
  assert.equal(metrics.learning.filtered_reasons.session_narrative_noise, 1);
  assert.equal(metrics.learning.quality_policy_filtered_reasons.session_validation_noise, 1);
  assert.equal(metrics.learning.quality_policy_filtered_reasons.session_result_narrative_noise, 1);
  assert.equal(metrics.learning.quality_policy_filtered_reasons.session_narrative_noise, 1);
});

test("metrics compute injection rate, empty-pack rate, injected savings, and breakdowns", async () => {
  const storePath = await mkdtemp(path.join(tmpdir(), "codex-memory-spec017-metrics-breakdown-"));
  const runtimeRoot = path.join(storePath, "runtime");
  const store = new LocalMemoryStore({ rootDir: storePath });
  const memoryStore = store.loadMemoryStore();

  memoryStore.atoms.push(
    {
      id: "atom-noise-title",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test" },
      atom_type: "fact",
      content: "{\"title\":\"Revisa SPEC-026 API v1\"}",
      confidence: 0.72,
      created_at: "2026-04-14T10:10:00.000Z"
    },
    {
      id: "atom-keep",
      scope: { level: "repository", repository_id: "repo-a", scope_key: "repo::repo-a" },
      provenance: { producer: "test" },
      atom_type: "workflow",
      content: "Always run node --test before finalize changes",
      confidence: 0.91,
      created_at: "2026-04-14T10:11:00.000Z"
    }
  );

  store.rewriteCanonicalArtifact("atoms", memoryStore.atoms);
  store.rebuildIndexes(memoryStore);

  const audits = [
    {
      audit_schema_version: "1",
      id: "audit-prompt-1",
      occurred_at: "2026-04-14T10:00:00.000Z",
      session_id: "s-1",
      hook_event_name: "UserPromptSubmit",
      decision: { reason: "context_pack_injected", inject_context: true },
      pack: { included: [{ memory_id: "atom-keep" }], dropped: [{ memory_id: "atom-noise-title", reason: "scope_mismatch", stage: "lexical" }] },
      metrics: { pack_tokens: 80, retrieved_count: 1, dropped_count: 1, token_savings_estimate: 120, memory_enabled: true, semantic_mode: "off" },
      safety: { blocked_persistence_detected: false, redaction_detected: false, warning_count: 0 }
    },
    {
      audit_schema_version: "1",
      id: "audit-prompt-2",
      occurred_at: "2026-04-14T10:05:00.000Z",
      session_id: "s-2",
      hook_event_name: "UserPromptSubmit",
      decision: { reason: "empty_pack", inject_context: false },
      pack: { included: [], dropped: [{ memory_id: "atom-noise-title", reason: "scope_mismatch", stage: "lexical" }, { memory_id: "capsule-x", reason: "below_lexical_threshold", stage: "lexical" }] },
      metrics: { pack_tokens: 0, retrieved_count: 0, dropped_count: 2, token_savings_estimate: 0, memory_enabled: true, semantic_mode: "off" },
      safety: { blocked_persistence_detected: false, redaction_detected: false, warning_count: 0 }
    },
    {
      audit_schema_version: "1",
      id: "audit-prompt-3",
      occurred_at: "2026-04-14T10:10:00.000Z",
      session_id: "s-3",
      hook_event_name: "UserPromptSubmit",
      decision: { reason: "context_pack_injected", inject_context: true },
      pack: { included: [{ memory_id: "atom-keep" }], dropped: [{ memory_id: "capsule-y", reason: "section_budget_exhausted", stage: "pack" }] },
      metrics: { pack_tokens: 64, retrieved_count: 1, dropped_count: 1, token_savings_estimate: 60, memory_enabled: true, semantic_mode: "off" },
      safety: { blocked_persistence_detected: false, redaction_detected: false, warning_count: 0 }
    },
    {
      audit_schema_version: "1",
      id: "audit-stop-1",
      occurred_at: "2026-04-14T10:15:00.000Z",
      session_id: "s-3",
      hook_event_name: "Stop",
      learning: {
        rejected_by_quality_policy: 2,
        filtered_reasons: {
          title_payload_noise: 1,
          process_reporting_noise: 1
        },
        promoted_atoms: 1,
        promoted_capsule: true
      }
    }
  ];

  const runtimeAuditPath = path.join(runtimeRoot, "audit.ndjson");
  const runtimeStatusPath = path.join(runtimeRoot, "status.json");
  await import("node:fs/promises").then(({ mkdir, writeFile }) => Promise.all([
    mkdir(runtimeRoot, { recursive: true }),
    writeFile(runtimeAuditPath, `${audits.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8"),
    writeFile(runtimeStatusPath, JSON.stringify({
      memory_enabled: true,
      learning_enabled: true,
      semantic_mode: "off",
      metrics: {
        pack_tokens: 64,
        retrieved_count: 1,
        dropped_count: 1,
        token_savings_estimate: 60
      },
      safety: {
        blocked_persistence_detected: false,
        redaction_detected: false,
        warning_count: 0
      }
    }, null, 2), "utf8")
  ]));

  const metrics = runInspect(["metrics", "--store-path", storePath, "--json"]);
  assert.equal(metrics.prompts.total, 3);
  assert.equal(metrics.prompts.injected, 2);
  assert.equal(metrics.prompts.empty_pack, 1);
  assert.equal(metrics.prompts.injection_rate, 2 / 3);
  assert.equal(metrics.prompts.empty_pack_rate, 1 / 3);
  assert.equal(metrics.prompts.avg_token_savings_estimate, 60);
  assert.equal(metrics.prompts.avg_token_savings_on_injected_prompts, 90);
  assert.equal(metrics.prompts.max_token_savings_estimate, 120);
  assert.equal(metrics.prompt_drop_reasons.empty_pack.scope_mismatch, 1);
  assert.equal(metrics.prompt_drop_reasons.empty_pack.below_lexical_threshold, 1);
  assert.equal(metrics.learning.filtered_reasons.title_payload_noise, 1);
  assert.equal(metrics.store.noise.detected, 1);
  assert.equal(metrics.store.noise.by_reason.atoms.title_payload_noise, 1);
  assert.equal(metrics.store.edges.zero_edges_visible, true);
});

test("dashboard generates cyberpunk HTML with key metrics from a test store", async () => {
  const storePath = await mkdtemp(path.join(tmpdir(), "codex-memory-spec017-dashboard-"));
  const sessionId = "s-dashboard";
  const payloads = realCodexPayloads(sessionId);

  await invokeHook({ hook: "SessionStart", payload: payloads.sessionStart, storePath });
  await invokeHook({ hook: "UserPromptSubmit", payload: payloads.userPromptSubmit, storePath });
  await invokeHook({ hook: "Stop", payload: payloads.stop, storePath });

  const outputPath = path.join(storePath, "runtime", "dashboard-test.html");
  const dashboard = runInspect(["dashboard", "--store-path", storePath, "--output", outputPath, "--json"]);
  assert.equal(dashboard.command, "dashboard");
  assert.equal(dashboard.generated, true);
  assert.equal(dashboard.output_path, outputPath);
  assert.equal(typeof dashboard.summary.verdict, "string");
  assert.equal(typeof dashboard.summary.injection_rate, "number");

  const html = await import("node:fs/promises").then(({ readFile }) => readFile(outputPath, "utf8"));
  assert.match(html, /codex-memory observability deck/i);
  assert.match(html, /Injection rate/i);
  assert.match(html, /Empty pack rate/i);
  assert.match(html, /System verdict/i);
  assert.match(html, /cyberpunk/i);
});
