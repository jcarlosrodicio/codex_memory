import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");

async function loadJson(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

test("SPEC-003 defines exactly four lifecycle hooks with required sections", async () => {
  const contracts = await loadJson("adapters/codex/contracts/codex-hook-contracts.json");
  const hookNames = Object.keys(contracts.lifecycle_hooks);

  assert.deepEqual(hookNames.sort(), [
    "on_after_response",
    "on_before_prompt",
    "on_session_end",
    "on_session_start"
  ]);

  for (const hookName of hookNames) {
    const hook = contracts.lifecycle_hooks[hookName];
    assert.ok(hook.responsibility, `${hookName} must define responsibility`);
    assert.ok(hook.codex_payload, `${hookName} must define codex payload`);
    assert.ok(hook.normalized_to_core, `${hookName} must define normalized payload`);
    assert.ok(hook.returns_to_codex, `${hookName} must define return payload`);
    assert.ok(hook.fallback, `${hookName} must define fallback behavior`);
  }
});

test("SPEC-003 session controls expose injection and learning toggles", async () => {
  const controls = await loadJson("adapters/codex/contracts/session-controls.json");

  assert.equal(controls.controls.disable_injection.type, "boolean");
  assert.equal(controls.controls.disable_learning.type, "boolean");
  assert.equal(controls.controls.disable_injection.scope, "session");
  assert.equal(controls.controls.disable_learning.scope, "session");
});

test("SPEC-003 defines adapter-to-core normalized boundary", async () => {
  const boundary = await loadJson("core/contracts/adapter-core-normalized-events.json");

  assert.deepEqual(boundary.normalized_event_contract.required_fields, [
    "event_type",
    "session_ref",
    "occurred_at"
  ]);
  assert.ok(
    boundary.normalized_event_contract.event_type_enum.includes("BEFORE_PROMPT"),
    "BEFORE_PROMPT must be available for retrieval requests"
  );
  assert.ok(
    boundary.invariants.some((rule) => rule.includes("host-agnostic")),
    "core boundary invariants must keep host-agnostic contracts"
  );
});

test("SPEC-003 installation contract is local-first and marketplace-ready", async () => {
  const pluginManifest = await loadJson(".codex-plugin/plugin.json");

  assert.equal(pluginManifest.distribution.default_path, "local_plugin_install");
  assert.equal(pluginManifest.distribution.marketplace_publication, "future_compatible");
  assert.equal(pluginManifest.runtime.default_mode, "zero_deps");
  assert.equal(pluginManifest.runtime.semantic_backend, "optional_off_by_default");
});
