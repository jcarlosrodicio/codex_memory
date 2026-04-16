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

test("defines a versioned configuration schema with strict unknown-key rejection", async () => {
  const schema = await loadJson("core/contracts/config-schema.v1.json");

  assert.equal(schema.spec_id, "SPEC-004");
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.user_default.$ref, "#/$defs/configLayer");
  assert.equal(schema.properties.repo_override.$ref, "#/$defs/configLayer");
  assert.equal(schema.properties.session_override.$ref, "#/$defs/configLayer");
  assert.equal(schema.$defs.configLayer.type, "object");
  assert.equal(schema.$defs.configLayer.additionalProperties, false);
});

test("defines deterministic precedence and required feature modes", async () => {
  const model = await loadJson("core/contracts/config-model.json");

  assert.deepEqual(model.precedence_order, [
    "session_override",
    "repo_override",
    "user_default"
  ]);

  assert.deepEqual(model.feature_modes.semantic.mode_enum, ["off", "light", "custom"]);
  assert.ok(model.feature_modes.persistence.mode_enum.length > 0);
  assert.ok(model.feature_modes.learning.mode_enum.length > 0);
  assert.ok(model.feature_modes.prompt_injection.mode_enum.length > 0);
});

test("install profiles include a safe default with semantic mode disabled", async () => {
  const profiles = await loadJson("core/contracts/config-install-profiles.json");

  assert.deepEqual(Object.keys(profiles.profiles).sort(), [
    "advanced-semantic",
    "default",
    "power-user"
  ]);
  assert.equal(profiles.default_profile, "default");
  assert.equal(profiles.profiles.default.semantic.mode, "off");
});

test("defines safe fallback behavior and schema versioning guidance", async () => {
  const model = await loadJson("core/contracts/config-model.json");

  assert.ok(
    model.fallback_behavior.some((line) => line.includes("safe mode")),
    "fallback must explicitly mention safe mode"
  );
  assert.equal(model.versioning.config_schema_version_field, "config_schema_version");
  assert.ok(model.versioning.migration_guidance.length > 0);
});
