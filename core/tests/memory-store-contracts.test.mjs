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

test("names canonical persisted artifacts for events, atoms, edges, and capsules", async () => {
  const storeLayout = await loadJson("core/contracts/memory-store-layout.v1.json");

  assert.equal(storeLayout.spec_id, "SPEC-006");
  assert.deepEqual(Object.keys(storeLayout.canonical_persisted_artifacts).sort(), [
    "atoms",
    "capsules",
    "edges",
    "events"
  ]);

  for (const [artifactName, artifact] of Object.entries(storeLayout.canonical_persisted_artifacts)) {
    assert.ok(artifact.artifact, `${artifactName} must define persisted artifact path/name`);
    assert.equal(artifact.source_of_truth, true, `${artifactName} must remain canonical source`);
    assert.ok(
      artifact.required_fields.includes("scope"),
      `${artifactName} must preserve scope in durable storage`
    );
    assert.ok(
      artifact.required_fields.includes("provenance"),
      `${artifactName} must preserve provenance in durable storage`
    );
  }
});

test("index strategy supports filters by scope, type, confidence, and time", async () => {
  const storeLayout = await loadJson("core/contracts/memory-store-layout.v1.json");
  const indexes = storeLayout.index_strategy.indexes;

  assert.equal(storeLayout.index_strategy.indexes_are_secondary, true);
  assert.equal(storeLayout.index_strategy.source_of_truth, "canonical_persisted_artifacts");
  assert.deepEqual(storeLayout.index_strategy.deterministic_update_order, [
    "scope",
    "type",
    "confidence",
    "recency"
  ]);

  assert.deepEqual(indexes.scope.supports_filters, ["scope"]);
  assert.ok(indexes.type.supports_filters.length > 0);
  assert.ok(indexes.confidence.supports_filters.includes("confidence"));
  assert.ok(
    indexes.recency.supports_filters.some((field) => field.endsWith("_at")),
    "recency index must support time-based fields"
  );
  assert.equal(
    storeLayout.index_strategy.fallback_behavior.on_missing_or_stale_index,
    "read_canonical_and_rebuild_indexes"
  );
});

test("defines explicit versioning with forward failure and controlled migration", async () => {
  const storeLayout = await loadJson("core/contracts/memory-store-layout.v1.json");
  const versioning = storeLayout.versioning;

  assert.equal(versioning.schema_version_field, "store_schema_version");
  assert.equal(versioning.record_version_field, "schema_version");
  assert.equal(
    versioning.forward_compatibility.unknown_future_schema,
    "fail_closed_with_explicit_error"
  );
  assert.deepEqual(versioning.controlled_migration.required_hooks, [
    "plan_migration",
    "apply_migration",
    "verify_migration"
  ]);
  assert.equal(
    versioning.controlled_migration.post_migration_requirement,
    "rebuild_all_indexes_from_canonical_store"
  );
});
