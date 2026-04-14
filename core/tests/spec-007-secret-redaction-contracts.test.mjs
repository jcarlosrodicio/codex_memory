import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

async function loadJson(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

test("SPEC-007 defines redaction as a mandatory gate before durable writes", async () => {
  const policy = await loadJson("core/contracts/secret-redaction-policy.v1.json");

  assert.equal(policy.spec_id, "SPEC-007");
  assert.equal(policy.redaction_pipeline.applies_before_durable_writes, true);
  assert.equal(policy.redaction_pipeline.gate_is_mandatory, true);
  assert.equal(policy.durable_enforcement.bypass_allowed, false);
  assert.equal(policy.durable_enforcement.blocked_content_persisted_raw, false);
});

test("SPEC-007 persistence outcomes are explicit and explainable", async () => {
  const policy = await loadJson("core/contracts/secret-redaction-policy.v1.json");

  assert.deepEqual(policy.persistence_outcomes.allowed_states, ["allow", "redact", "block"]);
  assert.equal(policy.persistence_outcomes.explainability.required, true);
  assert.ok(
    policy.persistence_outcomes.explainability.required_fields.includes("outcome"),
    "explainability must include outcome"
  );
  assert.ok(
    policy.persistence_outcomes.explainability.required_fields.includes("reason_codes"),
    "explainability must include reason codes"
  );
});

test("SPEC-007 covers structured secrets and common free-text leaks", async () => {
  const policy = await loadJson("core/contracts/secret-redaction-policy.v1.json");

  assert.ok(
    policy.detection_coverage.structured_secrets.length > 0,
    "structured secret coverage must be declared"
  );
  assert.ok(
    policy.detection_coverage.free_text_leaks.length > 0,
    "free-text leak coverage must be declared"
  );
});

test("SPEC-007 defaults to stricter behavior under uncertainty and backend degradation", async () => {
  const policy = await loadJson("core/contracts/secret-redaction-policy.v1.json");

  assert.equal(policy.fallback_behavior.uncertain_classification_default, "block");
  assert.equal(
    policy.fallback_behavior.optional_backend_failure,
    "continue_with_local_safety_gates"
  );
});
